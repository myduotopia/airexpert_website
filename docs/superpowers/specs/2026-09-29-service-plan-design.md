# 保養方案與到期提醒（Service Plan）設計規格

- 日期：2026-09-29
- 狀態：設計已核可
- 前置：機台維護報告單模組（Epic #194、spec `2026-09-17-service-report-design.md`）已上線，migration 0021 已套用正式 DB

## 1. 目標

1. **依時數階段自動帶入料件**：空壓機依累計運轉時數分階段保養（例：每 2000 小時基礎保養、4000 小時基礎保養＋空氣濾清器、6000 小時年度保養）。開立機台維護報告單時，若該機台已達某個**尚未開過單**的階段，自動帶入該階段的料件品名與數量。
2. **每個階段只帶入一次**：某台機的某個階段一旦開過單（未作廢），之後不再自動帶入、也不再提醒。例：2000 小時那張開過後，機台跑到 3000 小時不會再跳 2000；要到 4000 小時才跳 4000 階段。
3. **到期提醒**：報告單列表頁搜尋列上方顯示提醒清單，提示行政人員通知客戶安排定期大／小保養。

## 2. 名詞

| 名詞 | 意義 |
|---|---|
| 保養方案（plan） | 一組階段的集合，對應一類機台（依馬力，如「20HP 空壓機」） |
| 階段（stage） | 方案中的一個里程碑：時數 + 名稱 + 料件清單（品名／數量／單位） |
| 已開過 | 該機台該階段存在一張**未作廢**的報告單（`sr_reports.plan_stage_id`） |
| 目前時數 | 保養卡 `mx_records.hours` 與報告單 `results.compressor.run_hours` 中，日期最新且可解析者 |

## 3. 範圍

### 3.1 本期要做
- 保養方案與階段的後台維護（CRUD）
- 機台 → 方案對應：依馬力比對，另可逐台指定（覆寫）
- 開單時依「已達且未開過」的階段自動帶入料件、勾選服務項目、記錄階段
- 列表頁提醒區塊：依使用速度推估到期日（14 天內）＋ 已達門檻未開單者

### 3.2 本期不做
- 通知客戶的實際發送（Email／LINE）— 只在後台提醒，由行政人員自行聯絡
- 排程／背景工作（無 cron；提醒於開啟列表頁時即時計算）
- 與 ERP 品項、庫存、報價串接（料件為文字，不連 `erp_items`）
- 回填結果同步保養卡（沿用報告單模組既有範圍）
- 過濾卡（`card_type='filter'`）不納入提醒與自動帶入

## 4. 資料模型（migration 0022）

```sql
-- 保養方案
create table sr_service_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                       -- 「20HP 空壓機」
  hp_tags    text[] not null default '{}',        -- 適用馬力，如 {'20HP','20'}；比對時正規化
  active     boolean not null default true,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sr_service_plans_name_key on sr_service_plans (lower(btrim(name)));

-- 階段
create table sr_service_plan_stages (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references sr_service_plans(id) on delete cascade,
  hours      int  not null check (hours > 0 and hours <= 1000000),
  label      text not null,                       -- 「基礎保養」「年度保養」
  parts      jsonb not null default '[]'::jsonb,  -- [{ "name": "螺旋專用油", "qty": "1", "unit": "桶" }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sr_service_plan_stages_plan_hours_key
  on sr_service_plan_stages (plan_id, hours);
create index sr_service_plan_stages_plan_idx on sr_service_plan_stages (plan_id, hours);

-- 逐台指定方案（覆寫馬力比對）。獨立表，避免動到 mx_machines 的 RLS。
create table sr_machine_plans (
  machine_id uuid primary key references mx_machines(id) on delete cascade,
  plan_id    uuid not null references sr_service_plans(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- 報告單記錄套用的階段（快照保留語意，階段刪除後仍看得出來）
alter table sr_reports
  add column if not exists plan_stage_id    uuid references sr_service_plan_stages(id) on delete set null,
  add column if not exists plan_stage_hours int,
  add column if not exists plan_stage_label text;
create index if not exists sr_reports_plan_stage_idx
  on sr_reports (machine_id, plan_stage_id) where plan_stage_id is not null;
```

**`parts` 元素**：`{ name: string, qty: string, unit?: string }`。`qty` 為文字（沿用報告單 `parts.qty` 的文字模型，允許「1」「1桶」）；`unit` 僅供方案管理頁顯示與帶入時組字（帶入報告單時寫入 `qty = [qty, unit].join("")`，例如 `1桶`）。

### 4.1 RLS 與權限
- `sr_service_plans`、`sr_service_plan_stages`、`sr_machine_plans`：`has_module('service_report')` 可 select/insert/update/delete。方案是設定資料，允許刪除；報告單已快照 `plan_stage_hours/label`，刪除階段不影響歷史單據。
- `mx_records`：**新增** `has_module('service_report')` 的 **select** policy（提醒與時數判定需要；目前 office@ 因具 office 角色可讀，純模組授權帳號則否）。
- `sr_reports.plan_stage_*`：沿用既有 policy。未作廢的報告單（含已列印）本來就可修改與清除階段欄位（`sr_guard_report` 只限制單號、狀態與列印欄位）。
- **`sr_guard_report` 需最小擴充**：0021 的「作廢單唯讀」只對 `customer_id`／`machine_id` 的 FK set-null 開例外。若不把 `plan_stage_id` 一併納入，只要有**作廢單**引用某階段，刪除該階段或方案就會被觸發器擋下（error `voided`），與「階段可刪、報告單留快照」相牴觸。0022 以 `create or replace` 將例外清單擴充到 `plan_stage_id`，其餘邏輯不變；本機測試已覆蓋含作廢單的刪除情境。

## 5. 判定邏輯（純函式，`frontend/src/lib/service-report/plan/*`）

### 5.1 時數解析 `parseHours(text): number | null`
- 去除千分位逗號、全形數字轉半形、去除單位（`小時`、`H`、`h`、`hr`、`hrs`、`HR`、`時`）與前後空白。
- 含 `/` 時取**前段**（`0/1500` → `0`；耗材時數格式）。
- 僅接受 0–1,000,000 的整數或小數（取整）；其餘回 `null`（不猜）。

### 5.2 目前時數 `latestHours(readings): { hours, date, source } | null`
輸入：保養卡記錄（`service_date`, `hours`）與報告單（`report_date`, `results.compressor.run_hours`，排除作廢單）。
- 解析成功者取 `date` 最新的一筆；同日期以報告單優先（報告單為當次實際抄表）。

### 5.3 方案比對 `matchPlan(machine, plans, overrides)`
1. `sr_machine_plans` 有指定 → 用指定方案（即使 `active=false` 也用，避免突然失效）。
2. 否則依 `machine.horsepower` 正規化後（大寫、去空白、去 `HP`、去前導零）比對 `plan.hp_tags` 正規化集合，取第一個 `active` 方案；多筆相符取 `name` 排序第一並在管理頁標示衝突。
3. 仍比不到 → 「通用預設方案」：`active` 且 `hp_tags` 正規化後為空的方案（`source: "default"`）。機台沒填馬力或馬力無法正規化時也走這一層；多個通用預設方案同樣取 `name` 排序第一並標示衝突。
4. 都沒有 → 無方案（不提醒、不自動帶入）。

### 5.4 下一個階段 `nextStage(stages, issuedStageIds)`
- 階段依 `hours` 由小到大排序，排除已開過（存在未作廢報告單）的階段，取第一個。
- 全部開過 → 無下一階段（不再提醒）。**每個階段只觸發一次**；日後要延伸循環，於方案新增 8000／10000… 等階段即可。

### 5.5 使用速度與預估到期 `estimateDue(readings, target, today)`
- 取該機台最近 6 筆可解析且**時數遞增**的記錄。
- 需至少 2 筆、首尾相距 ≥ 7 天且時數有增加，否則視為「無法推估」。
- `rate = (hours_last - hours_first) / days_between`，限制在 0.1–24 小時/日。
- `daysToTarget = ceil((target - latest.hours) / rate)`，`dueDate = latest.date + daysToTarget`。

### 5.6 是否列入提醒 `reminderFor(machine, …)`
依序判定，成立即列入：
1. **已達門檻**：`latest.hours >= stage.hours` → `status: "due"`（最優先）。
2. **即將到期**：可推估且 `dueDate <= today + 14 天` → `status: "upcoming"`，附預估日期。
3. 其他 → 不列入。
- **備援**：無法推估速度（資料不足）時只靠條件 1，避免新機台或資料少的機台完全不提醒。
- 排序：`due` 在前，其次依 `dueDate` 由近到遠，再依客戶名稱。

## 6. 畫面

| 路由 | 功能 |
|---|---|
| `/admin/service-reports/plans` | 方案列表（名稱、適用馬力、階段數、套用機台數、啟用狀態）；新增／編輯／刪除（刪除需確認，提示已套用機台數） |
| `/admin/service-reports/plans/[id]` | 方案編輯：基本資料＋階段編輯（每階段：時數、名稱、料件列 品名／數量／單位，可增刪排序） |
| `/admin/service-reports/plans/machines` | 機台對應：列出未封存空壓機（客戶、機台、馬力、目前比對到的方案、目前時數），可逐台指定方案或清除指定 |
| `/admin/service-reports`（既有） | 搜尋列**上方**新增提醒區塊 |
| `/admin/service-reports/new`（既有） | 支援 `?machineId=&stageId=`；選機台後提示可套用階段 |

### 6.1 提醒區塊
- Server component，於 `page.tsx` header 與 `ReportListFilters` 之間；無提醒項目時整塊不渲染。
- 標題：「保養到期提醒（N）」；預設顯示前 5 筆，其餘以 `<details>` 展開。
- 每列：客戶名稱｜機台（`代號-機號` 或型號）｜目前時數（民國抄表日）｜下一階段（`4000 小時 基礎保養`）｜狀態徽章（**已達門檻** / **預計 115/10/12 到期**）｜「開立報告單」連結（帶 `?machineId=&stageId=`）。
- 樣式沿用後台既有元件；`due` 用警示色、`upcoming` 用一般提示色。

### 6.2 開單自動帶入
- `new` 頁帶 `machineId` → 預選機台並帶入既有欄位（沿用 `prefill`）；帶 `stageId` → 直接套用該階段。
- 未帶參數而選了機台：若該機台有「已達且未開過」的階段，表單於料件區上方顯示提示列「此機台已達 4000 小時 基礎保養，套用料件？」＋「套用」按鈕；另有下拉可選擇套用其他階段（含未達門檻者，供提前保養）。
- **套用行為**：
  - 料件已有內容（任一列 `qty` 非空）時，先 `confirm` 詢問是否覆蓋；取消則只填入空白列。
  - 依品名比對既有 10 列（正規化後相同者填數量），其餘依序填入空白列；超過 10 列時，超出部分不填並提示「料件超過 10 列，請手動調整」。
  - 勾選服務項目 `periodic`（定期大/小保養）。
  - 記錄 `plan_stage_id`、`plan_stage_hours`、`plan_stage_label`。
- 已套用階段的報告單，在編輯頁與詳情頁顯示「本單對應：4000 小時 基礎保養」，可清除（清除後該階段視為未開過）。

## 7. 錯誤處理
- 沿用報告單模組：server action 回 `{ ok, error }`，訊息中文；`unstable_rethrow` 於 client 表單。
- 方案名稱重複（23505）→「方案名稱已存在」；同方案時數重複 →「同一方案的階段時數不可重複」。
- 提醒區塊查詢失敗不擋列表：記錄錯誤並隱藏區塊（列表仍可用）。

## 8. 測試
- **純函式（Vitest）**：`parseHours`（單位、逗號、全形、`0/1500`、異常值）、`latestHours`（同日期優先序、作廢單排除）、`matchPlan`（覆寫優先、馬力正規化、多方案衝突）、`nextStage`（已開過排除、全開完）、`estimateDue`（資料不足、時數倒退、速率上下限、邊界 14 天）、`reminderFor`（due / upcoming / 不列入、排序）、料件套用（品名比對、空白列、超過 10 列、覆寫與否）。
- **Server action（mock supabase）**：未授權拒絕、方案／階段 CRUD 驗證、名稱與時數重複訊息、指定方案寫入與清除。
- **SQL（`supabase/tests/service_plan_test.sql`，接 `local-db.sh`）**：RLS（無授權讀不到、有授權可讀寫）、`mx_records` 只讀、FK 行為（刪方案 → 階段連動刪、報告單 `plan_stage_id` 轉 null 且快照仍在）、階段時數唯一。
- 正式 DB 套用 0022 前備份並經使用者確認。

## 9. 拆分

```
#1 地基：migration 0022 + SQL 測試 + lib/service-report/plan/*（純函式）+ queries + 方案／階段／指定 server actions
 ├─ #2 方案管理頁（列表、編輯、階段與料件編輯、機台對應頁）
 ├─ #3 開單自動帶入（new 頁參數、選機台提示、套用邏輯、報告單記錄階段）
 └─ #4 列表提醒區塊（推估、排序、UI、連結帶參數）
```
#2／#3／#4 於 #1 合併後並行；三者只依賴 #1 匯出的純函式、queries 與 actions，彼此不共用檔案。
