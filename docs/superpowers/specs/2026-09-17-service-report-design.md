# 機台維護報告單（Service Report）模組設計規格

- 日期：2026-09-17
- 狀態：設計已核可
- 參考：紙本「勁賀空壓 機台維護報告單」（派工單號 X11507010、X11509009）；列印做法參考 `/Users/benson/GIT/DO-system`

## 1. 目標與範圍

行政人員在後台開立「機台維護報告單」、看到列印預覽、以 EPSON LQ 系列點陣印表機在**空白 A4 連續紙**上印出**整張表單**（格線、標題、欄位名、資料），技師帶到現場手寫檢查結果與簽名，收回後行政人員**回填結果並結案**，並可管理所有報告單。

### 1.1 本期要做
- 模組授權 `service_report`，初期只授權 `office@airexpert.com.tw`
- 報告單開立／編輯（左表單、右即時預覽）、從保養卡選客戶與機台自動帶入（快照、可改）
- 派工單號自動編號 `X + 民國年(3) + 月(2) + 流水號(3)`，可手動改、不可重複
- A4 整張列印（瀏覽器列印）、位置校正（平移／縮放，存於瀏覽器）、可列印範圍警示、空白表單列印
- 狀態：草稿 → 已列印 → 已結案；作廢（需原因）；列印次數與時間紀錄
- 管理列表：搜尋、篩選、分頁；回填結果

### 1.2 本期不做
- 回填結果同步到保養卡（`mx_records`）— 報告單獨立管理
- 本機列印代理程式／ESC/P 直送、免對話框列印
- 預印表單套印（逐欄位座標）
- 技師手機端填寫、電子簽名、拍照上傳
- 與 ERP 單據（銷貨、工資請款）串接

### 1.3 待確認（先以預設設計，做成可調）
- 連續紙實際尺寸（預設 A4 210×297mm）→ 紙張尺寸常數集中於 `lib/service-report/layout.ts`
- 印表機型號與複寫聯數（預設 EPSON LQ、四聯；底部印「第一聯：簽回聯(白) 第二聯：存根聯(藍) 第三聯：會計聯(紅) 第四聯：客戶收執聯(黃)」）

## 2. 架構

沿用 ERP／保養卡模式：**Next.js server actions + Supabase（RLS）**，不使用 FastAPI。

- 讀取：server component 以 `getServerSupabase()` 查詢，集中在 `frontend/src/lib/service-report/queries.ts`（server-only）。
- 寫入：server action 開頭 `ensureServiceReport()`（`hasModule("service_report")`），回傳 `{ ok, error }`。
- 單號：資料庫函式 `sr_next_report_no(p_date date)`（security definer、`has_module('service_report')` 檢查），併發安全。
- 列印：HTML/CSS 以實際 mm 尺寸繪製，瀏覽器 `window.print()`；預覽與列印共用同一元件（`container-type: inline-size` + `cqw` 縮放）。
- 日期：DB 存西元，顯示／輸入民國（`lib/admin/minguo.ts`、ERP 的 `RocDateInput`）。

### 2.1 目錄

```
supabase/migrations/0021_service_report.sql
supabase/tests/service_report_test.sql           # 接到 local-db.sh
frontend/src/lib/admin/auth.ts                    # AdminModule += "service_report"
frontend/src/lib/admin/nav-config.ts              # 側欄項目（modules: ["service_report"]）
frontend/src/lib/service-report/
  types.ts          # 報告單型別、預設料件列、列舉與標籤
  report-no.ts      # 單號格式（純函式，顯示／驗證用）
  layout.ts         # 紙張尺寸、mm 換算、校正 transform、可列印範圍檢查（純函式）
  validate.ts       # 表單驗證（純函式）
  queries.ts        # server-only 查詢
  guard.ts          # ensureServiceReport()
frontend/src/components/service-report/
  ReportSheet.tsx          # 整張 A4 表單（預覽／列印共用）
  ReportForm.tsx           # 開單／編輯表單（含回填區）
  CalibrationPanel.tsx     # 校正設定（localStorage）
frontend/src/app/admin/(protected)/service-reports/
  page.tsx  new/page.tsx  [id]/page.tsx  [id]/edit/page.tsx  actions.ts
frontend/src/app/admin/(print)/service-reports/
  layout.tsx  print/[id]/page.tsx  print/blank/page.tsx
```

## 3. 權限

### 3.1 DB（migration 0021）
```sql
-- 放寬模組檢查
alter table admin_module_grants drop constraint if exists admin_module_grants_module_check;
alter table admin_module_grants add constraint admin_module_grants_module_check
  check (module in ('erp', 'service_report'));

-- 授權 office@
insert into admin_module_grants (user_id, module)
select id, 'service_report' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;
```
- `sr_*` 表 RLS：`has_module('service_report')`（select/insert/update；**不給 delete**，作廢取代刪除；草稿可刪由 policy 限 `status = 'draft'`）。
- `mx_customers`、`mx_machines`：新增 `has_module('service_report')` 的 **select** policy（只讀，用於選取帶入）。

### 3.2 前端
- `AdminModule = "erp" | "service_report"`，`KNOWN_MODULES` 同步。
- `(protected)/service-reports/layout.tsx` 與 `(print)/service-reports/layout.tsx` 呼叫 `requireModule("service_report")`。
- 側欄項目：`{ key: "service-reports", label: "機台維護報告單", href: "/admin/service-reports", modules: ["service_report"], group: "維護" }`。
- office 首頁導向維持 `/admin/maintenance`（有 service_report 授權者從側欄進入）。

## 4. 資料模型

```sql
create table sr_sequences (
  period  text primary key,          -- 民國年月 '11509'
  last_no int  not null default 0
);

create table sr_reports (
  id              uuid primary key default gen_random_uuid(),
  report_no       text not null,                     -- X11509009；unique
  report_date     date not null default current_date, -- 維護日期
  time_slot       text check (time_slot in ('morning','noon','afternoon')),
  status          text not null default 'draft'
                  check (status in ('draft','printed','completed','voided')),

  customer_id     uuid references mx_customers(id) on delete set null,
  machine_id      uuid references mx_machines(id)  on delete set null,

  -- 表頭快照（列印用；改保養卡不影響舊單）
  header_code     text,   -- 左上代號，預設「客戶編號-機台代號」如 KK855-2
  customer_name   text,
  phone           text,
  tax_id          text,
  contact         text,   -- 聯絡人（含手機）
  address         text,
  equipment       text,   -- 設備，如「PUMA SP50VH5 50HP 空壓機」
  model           text,   -- 型號
  voltage         text,   -- 電壓
  serial_no       text,   -- 編號
  machine_state   text check (machine_state in ('running','standby')),
  service_items   text[] not null default '{}',
                  -- 子集合：new_trial 新機試車 / routine 例檢 / periodic 定期大小保養 / repair 查修 / other 其他
  summary         text,   -- 修護記要及建議

  -- 回填結果（現場手寫 → 行政回填）
  results         jsonb not null default '{}'::jsonb,   -- 見 §4.1
  parts           jsonb not null,                       -- 見 §4.2，10 列
  suggestions     text[] not null default '{}',
                  -- 子集合：transmission 傳動系統年度維護 / motor 馬達電機年度維護 / rotor 壓縮轉子年度歲修
  technician      text,   -- 維護人員
  customer_signer text,   -- 客戶簽名人（回填）
  note            text,   -- 內部備註（不列印）

  print_count      int not null default 0,
  first_printed_at timestamptz,
  last_printed_at  timestamptz,
  completed_at     timestamptz,
  voided_at        timestamptz,
  void_reason      text,

  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index sr_reports_report_no_key on sr_reports (upper(btrim(report_no)));
create index sr_reports_date_idx on sr_reports (report_date desc);
create index sr_reports_customer_idx on sr_reports (customer_id);
create index sr_reports_machine_idx on sr_reports (machine_id);
-- updated_at trigger
```

### 4.1 `results` jsonb（全部選填，字串保留手寫原樣）
```json
{
  "compressor": {
    "run_hours": "22278", "consumable_hours": "0/1500", "frequency": "101",
    "set_pressure": "7.5-8", "temperature": "81", "current": "102",
    "fan": "normal|abnormal", "inverter_fan": "normal|abnormal", "inverter_params": "normal|abnormal"
  },
  "dryer": {
    "total_hours": "", "saving_rate": "",
    "refrigerant_high": "normal|abnormal", "refrigerant_low": "normal|abnormal",
    "cooling_fan": "normal|abnormal", "auto_drain": "normal|abnormal", "tank_drain": "normal|abnormal"
  },
  "filter_consumable": "usable|replace|none|suggest_install"
}
```

### 4.2 `parts` jsonb（固定 10 列，編號 1–10）
預設品名：1 螺旋專用油、2 機油濾清器、3 空氣濾清器(外)、4 空氣濾清器(內)、5 油氣分離器、6 自動排水器、7 過濾器濾蕊、8（空白）、9（空白）、10 維護及保養工資。
```json
[{ "no": 1, "name": "螺旋專用油", "qty": "1桶" }, …]
```
品名可改；數量為文字（如「1桶」「2」）。

### 4.3 單號
- `sr_next_report_no(p_date date) returns text`：`insert into sr_sequences … on conflict (period) do update set last_no = sr_sequences.last_no + 1 returning last_no`，格式 `X` + 民國年月 + 至少 3 位流水號（>999 自然 4 位）。security definer、`set search_path = public, pg_temp`、開頭檢查 `has_module('service_report')`；只授權 authenticated。
- 開單時預設取號；使用者可改號，存檔時 unique index 擋重複 → 「派工單號已存在」。

### 4.4 狀態規則
| 動作 | 前置狀態 | 結果 |
|---|---|---|
| 新增 | — | `draft`（取號） |
| 編輯 | draft / printed / completed | 不變（completed 編輯需二次確認） |
| 記錄列印 | draft / printed / completed | draft → printed；`print_count+1`、更新列印時間 |
| 結案 | printed | `completed`、`completed_at` |
| 重新開啟 | completed | `printed`、清 `completed_at` |
| 作廢 | draft / printed / completed | `voided`，需原因；作廢後唯讀 |
| 刪除 | draft 且從未列印 | 實際刪除 |

狀態轉換一律由 server action 以條件更新（`.eq("status", 前置狀態)`）完成，避免併發覆蓋。

## 5. 列印版面

### 5.1 原則（取自 DO-system 經驗）
- 紙張 `@page { size: 210mm 297mm; margin: 0 }`，由列印頁注入、離開時移除。
- `.sheet` 固定 210×297mm、`overflow: hidden`；不可用 `top:50%`／`margin:auto` 置中（會溢出第二頁）。
- 列印時隱藏工具列以外所有內容（`display:none`，非 `visibility`）。
- 文字一律**實心黑色**，欄位名粗體；不使用灰色（點陣印表機會糊）。字級 ≥ 9pt。
- 內容保持在安全範圍內（預設上 10mm、下 8mm、左右 8mm），超出時工具列顯示警示。
- 校正：`offsetXmm`、`offsetYmm`（±15mm）、`scale`（90–110%），存 `localStorage("sr-print-calibration")`，所有報告單共用；`transform: translate() scale()` 於內層，外層 sheet 不變形。空白欄位回預設值而非 0。
- 預覽與列印同一 `ReportSheet` 元件：預覽容器 `aspect-ratio: 210/297`、`container-type: inline-size`，字級與尺寸以 `cqw` 表示；列印時容器寬度 = 210mm。

### 5.2 表單版面（由上而下，比照紙本）
1. 表頭：LOGO、「勁賀空壓科技有限公司」、英文名、TEL 02-2675-9977 / FAX 02-2675-9955、標題「機台維護報告單」；左上代號（header_code）
2. 維護日期（民國）＋ 早上／中午／下午（選中者以 ■，其餘 □）｜派工單號
3. 客戶名稱｜電話；統一編號｜聯絡人；地址
4. 服務項目（5 個勾選框）｜設備、型號／電壓、編號／狀態（運轉／待機）
5. 修護記要及建議（多行，固定高度）
6. 空壓機檢查（3×3：數值欄＋正常/異常勾選框）
7. 乾燥機檢查（總時數、節能率＋冷媒高低壓＋散熱風扇／自動排水器）
8. 過濾耗材（4 勾選）｜貯氣桶排水功能
9. 更換料件編號及數量（左 1–5、右 6–10，各含品名、數量）
10. 建議事項（3 勾選）｜維護人員簽名｜客戶簽名
11. 聯單說明、服務電話

勾選框：選中 `■`、未選 `□`（字元，列印清晰）。回填值為空時留白供手寫。

### 5.3 列印頁
- `/admin/service-reports/print/[id]`：工具列（返回、校正設定、可列印範圍警示、「列印」）。按「列印」→ 先呼叫 `recordPrintAction(id)` 成功後 `window.print()`。
- `/admin/service-reports/print/blank`：空白表單（只有固定文字與格線），不記錄。

## 6. 畫面

| 路由 | 功能 |
|---|---|
| `/admin/service-reports` | 列表：派工單號、維護日期（民國）、客戶、設備、服務項目、狀態、列印次數；搜尋（單號／客戶／設備／編號）、日期區間、狀態篩選、每頁 50；「開立報告單」「列印空白表單」 |
| `/admin/service-reports/new` | 左表單、右即時預覽；客戶／機台選取帶入；儲存草稿、儲存並列印 |
| `/admin/service-reports/[id]` | 詳情＝唯讀預覽＋操作（編輯、列印、回填結果、結案、重新開啟、作廢、刪除草稿）＋列印紀錄 |
| `/admin/service-reports/[id]/edit` | 同 new；回填區預設展開於 printed／completed |

帶入規則：選客戶 → 客戶名稱（`invoice_title` 優先否則 `name`）、電話、統編、聯絡人（`contact_person`）、地址（`address`）；選機台 → 設備（`model` + `horsepower` 組字）、型號、電壓、編號（`serial_no`）、左上代號（`客戶.code` + `-` + `machine_no`，缺者省略）。帶入後可改；變更客戶會詢問是否覆蓋已填欄位。

## 7. 錯誤處理
- server action 回傳 `{ ok: false, error: 中文 }`，表單保留輸入；網路錯誤 try/catch + `unstable_rethrow`。
- unique 衝突（23505）→「派工單號已存在」；狀態條件更新 0 列 →「報告單狀態已變更，請重新整理」。

## 8. 測試
- Vitest 純函式：`report-no`（格式、位數）、`layout`（mm、transform、範圍檢查、校正值 clamp／預設）、`validate`、帶入規則（客戶／機台 → 欄位）、`parts` 預設列。
- Server action（mock supabase）：未授權拒絕、狀態轉換條件、作廢需原因、刪除限未列印草稿、unique 衝突訊息。
- SQL（`supabase/tests/service_report_test.sql`，接 `local-db.sh`）：無授權使用者讀寫被擋、office 授權可讀寫、無 delete 已列印單、`sr_next_report_no` 格式與遞增、mx_* 只讀。
- 正式 DB 套用 0021 前先備份，並經使用者確認。

## 9. 拆分

```
#1 地基（3 個 agent 同一 worktree、檔案不重疊）
   · DB：migration 0021 + SQL 測試
   · 邏輯：auth/nav、lib（types/report-no/layout/validate/guard/queries/prefill）、全部 server actions（actions.ts）與測試
   · 表單元件：ReportSheet（A4 整張表單，預覽／列印共用）
 ├─ #2 開單與列印：ReportForm、new/edit 頁、列印頁（校正、可列印範圍、空白表單）
 └─ #3 管理：列表、詳情頁（ReportSheet 唯讀預覽＋狀態操作按鈕、列印紀錄）
```
#2 與 #3 在 #1 合併後並行，彼此不依賴：兩者都只使用 #1 提供的 `ReportSheet`、`actions.ts`、`queries.ts`。`actions.ts` 路徑為 `frontend/src/app/admin/(protected)/service-reports/actions.ts`，匯出：`saveReportAction`、`recordPrintAction`、`completeReportAction`、`reopenReportAction`、`voidReportAction`、`deleteDraftReportAction`、`nextReportNoAction`。
