# 行政部門「空壓機保養記錄卡」後台 MVP — 設計文件

> 建立日期：2026-07-25 ・ 狀態：設計定案，待 review → 進 writing-plans

## 1. 背景與痛點

超勁賀（AirExpert）行政部門目前為每台售出的空壓機維護兩張紙本保養卡：

- **男生卡**：師傅帶出去現場填寫，記錄近期保養資料。
- **女生卡**：行政部門留存，記錄該機號自出廠以來的**所有歷史紀錄**。

痛點：師傅送回男生卡後，行政人員必須**手動把男生卡的內容重新謄寫到女生卡**，重複填寫、耗時、易錯。

本 MVP 目標：讓「女生卡」數位化到官網後台，行政人員以**拍照辨識**或**手動輸入**維護資料，免去重複謄寫。本 MVP 只涵蓋完整體的核心部分（見 §8 排除範圍）。

## 2. 範圍（MVP）

**做**：
1. 專屬「行政」後台角色（`office`），登入後只看到「保養記錄卡」，與 `admin`（CMS 管理）內容完全不同。
2. 三層資料模型：客戶 → 機器（=保養卡）→ 維護紀錄（多列）。
3. 保養卡列表 + 單卡詳情（基本資訊 + 維護紀錄表格）。
4. **手動輸入**：建新卡、逐列新增/編輯/刪除維護紀錄。
5. **拍照辨識**：拍男生卡 → AI（Gemini vision）擷取 → 行政在 review 畫面編輯確認 → 儲存匯入女生卡；以**機號**自動比對現有卡（命中附加、未命中建卡）。
6. 最小稽核：辨識產出與原圖 path 留存（`mx_import_drafts`）。

**不做**（§8 詳列）：到期提醒、報表匯出、師傅端 App、客戶自助查詢、多張批次辨識。

## 3. 保養卡欄位（來源：實體卡 KC054）

**基本資訊（機器層級）**：客戶名稱、使用地點、購買時間、機型、馬力、電壓、機號。

**維護與系統紀錄（每次保養一列）**：日期、時數、專用油、機油濾清器、空氣濾清器、油氣分離器、變頻器、過濾系統、維護員。

## 4. 權限與角色

沿用現有雙角色機制（`admin_profiles.role` + security-definer RPC + RLS，見 [0005_seo_roles.sql](../../../supabase/migrations/0005_seo_roles.sql)），新增第三種角色。

- `admin_profiles.role` 擴充允許值 `office`。
- 新增 `is_office()` RPC（鏡像 `is_seo_manager()`：security definer、stable、`search_path=public`；`revoke execute from public, anon` + `grant execute to authenticated`）。
- 前端 `AdminRole` type（[auth.ts](../../../frontend/src/lib/admin/auth.ts)）加入 `"office"`；`getCurrentUserRole()` 接受 `office`。
- `navForRole()`（[nav-config.ts](../../../frontend/src/lib/admin/nav-config.ts)）：`office` 只看得到「保養記錄卡」一項；CMS / SEO / 設定 / 人員管理一律隱藏。「保養記錄卡」項標 `roles: ['office']`，故 `admin`/`seo_manager` 側欄也**看不到**它。
- `office` 登入後預設落地 `/admin/maintenance`；`/admin` 總覽對 `office` 直接 redirect 到保養卡。

### 4.1 資料隔離（方案 B）與其誠實邊界

保養卡三表**只**對 `is_office()` 開放讀寫；`admin` 與 `seo_manager` 一律 fail-closed 讀不到。

**邊界說明**：`office` 帳號仍由 admin 在「人員管理」頁以 service_role 建立（建帳號 ≠ 讀資料）。但 service_role（部署層金鑰）在技術上永遠能繞過 RLS，因此「admin 看不到保養卡」是 **UI + RLS 層級**的隔離，**不是**對掌握部署金鑰者的加密隔離。這是方案 B 的固有限制，已與需求方確認接受。

> 伏筆（非 MVP）：日後若要「admin 可讀不可寫」的除錯後門，可在三表加一條 `is_admin()` 的 SELECT-only policy，不影響現有設計。

## 5. 資料模型

新 migration：`supabase/migrations/0011_office_maintenance.sql`。前綴 `mx_`（maintenance）以與 CMS 表區隔。

### `mx_customers` — 客戶
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| name | text not null | 客戶名稱 |
| created_at | timestamptz default now() | |

### `mx_machines` — 機器（= 一張保養卡）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| customer_id | uuid FK → mx_customers | |
| card_no | text | 卡號（如 KC054），可空 |
| serial_no | text not null | 機號，**唯一鍵**（unique index）|
| location | text | 使用地點 |
| purchased_at | date | 購買時間 |
| model | text | 機型 |
| horsepower | text | 馬力（保留文字，含「10HP」等原樣）|
| voltage | text | 電壓（如「220V」）|
| created_at | timestamptz default now() | |

### `mx_records` — 維護紀錄（每列一筆）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| machine_id | uuid FK → mx_machines | |
| service_date | date | 日期 |
| hours | text | 時數（保留文字，容忍手寫格式）|
| oil | text | 專用油 |
| oil_filter | text | 機油濾清器 |
| air_filter | text | 空氣濾清器 |
| oil_separator | text | 油氣分離器 |
| inverter | text | 變頻器 |
| filter_system | text | 過濾系統 |
| technician | text | 維護員 |
| note | text | 備註 |
| source | text | `'manual'` \| `'photo'` |
| created_at | timestamptz default now() | |

> 設計取捨：`hours`、`horsepower` 等數值欄位刻意用 `text`，因手寫卡常含非純數字內容（單位、註記、模糊字），MVP 以「忠實保存 + 人工可讀」優先於強型別；日後要統計再加正規化欄位。

### `mx_import_drafts` — 辨識稽核（最小版，對應範圍第 6 項）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid PK | |
| created_by | uuid | 操作者（office user id）|
| photo_path | text | 原圖 Storage path |
| raw_output | jsonb | Gemini 回傳的原始結構化結果 |
| status | text | `'pending'` \| `'committed'` \| `'discarded'` |
| machine_id | uuid null | commit 後對應的卡 |
| created_at | timestamptz default now() | |

### 5.1 RLS

三張核心表（`mx_customers` / `mx_machines` / `mx_records`）+ `mx_import_drafts`：
- `enable row level security`。
- 對 `authenticated` 開 SELECT / INSERT / UPDATE / DELETE，`using (is_office())` / `with check (is_office())`。
- **無** `admin` / `seo_manager` policy → 兩者 fail-closed 讀不到（方案 B）。
- 特權操作（建帳號）走 service_role，不靠這些 policy。

## 6. AI 拍照辨識

### 6.1 技術路線

**沿用前端現有 Gemini 路徑**，不動 FastAPI backend（目前僅 health router，從零建部署/認證成本過高）。

在 [gemini.ts](../../../frontend/src/lib/ai/gemini.ts) 新增 `extractMaintenanceCard(imageBytes, mimeType)`：
- 沿用現有 `ai_config`（AES 解密）取 key、重試/指數退避、`FALLBACK_MODEL` 備援機制。
- 請求帶 image part + `responseMimeType: "application/json"` + `responseSchema`（強制輸出結構）。
- 模型：`gemini-2.5-flash`（支援影像輸入；成本可忽略，見 [gemini-api-cost-zh.md](../../gemini-api-cost-zh.md)）。
- Prompt 要求：手寫繁中 + 數字；看不清的欄位回空字串、**不猜測**；維護列逐行輸出；日期/時數盡量正規化但不確定就原樣保留。

長期若搬 Vertex AI，此 server action 是薄封裝、易替換。

### 6.2 匯入流程

```
行政拍/選照片
 → client 端壓縮縮圖至 ~1–2MB（避開 Vercel Server Action 4.5MB 上限）
 → 原圖經簽名直傳存 Storage（沿用 createMediaUploadUrl，audit 用）
 → server action extractCardFromImage(photoPath)
      · requireRole(['office'])
      · 下載照片 → extractMaintenanceCard() → 結構化 JSON
      · insert mx_import_drafts（status='pending', photo_path, raw_output, created_by）
 → Review 畫面（可編輯表格）
      · 以辨識 serial_no 比對現有 mx_machines：
          - 命中 → 「將附加 N 列到卡『機號 XXX / 客戶 YYY』」
          - 未命中 → 「將建立新卡」+ 基本資訊可編輯
          - 機號模糊/信心低 → 提示手動選卡或確認基本資訊
      · 行政逐欄修正、逐列增刪
 → 按「儲存」→ server action commitImport(...)
      · 交易式：新卡則 upsert 客戶 + 機器，再 insert 維護列
      · mx_import_drafts.status = 'committed'、寫入 machine_id
```

**核心原則**：Review 畫面**強制**，AI 結果**永不自動寫入**。拍照辨識 =「幫你預填好的手動輸入」，故 review 表單與手動表單共用同一組元件。

## 7. 頁面與路由

掛在 `/admin/maintenance`（側欄「保養記錄卡」，僅 `office` 可見）；整個子樹 `requireRole(['office'])`。

| 路由 | 內容 |
|---|---|
| `/admin/maintenance` | 保養卡列表：客戶/機號/機型/最後保養日；含搜尋（機號/客戶）+ 排序 + 分頁（沿用 #114 列表模式）|
| `/admin/maintenance/import` | 拍照辨識：上傳 → Review 可編輯表格 → 儲存 |
| `/admin/maintenance/new` | 手動建新卡（基本資訊表單）|
| `/admin/maintenance/[machineId]` | 單卡詳情：上半基本資訊（可編輯），下半維護紀錄表格（新增/編輯/刪除列）|
| `/admin/maintenance/[machineId]/records/new` | 手動新增一列維護紀錄 |

**元件與檔案**：
- 元件：`CardBasicForm`（基本資訊）、`RecordsTable` / `RecordRow`（維護列，可編輯）、`ImportReview`（= 預填的 CardBasicForm + RecordsTable）。
- server actions：`/admin/maintenance/actions.ts`。
- DAL：`lib/admin/maintenance.ts`，一般讀寫走登入者 session（靠 RLS 擋）；特權才用 service_role。

## 8. 明確排除（非 MVP）

1. 維護提醒 / 到期預警（依時數或日期）。
2. 報表匯出（PDF / Excel）。
3. 師傅端 App / 男生卡數位化。
4. 客戶自助查詢。
5. 多張照片批次辨識。

保留：第 6 項「最小稽核」（`mx_import_drafts`）。

## 9. 錯誤處理

- **AI 失敗**（key 未設 / 429 / 503）：沿用 gemini.ts 重試 + 備援模型；最終失敗顯示「辨識失敗，請改用手動輸入」，照片已存 Storage 不遺失。
- **非合法 JSON**：擋在 server action，回可讀錯誤，不讓半殘資料進 review。
- **機號唯一鍵衝突**（建新卡撞既有機號）：commit 交易失敗 → 提示「此機號已存在，是否改為附加到現有卡？」
- **空欄位**：辨識不到一律留空由行政補；不猜、不亂填。

## 10. 測試

沿用專案 vitest；CI 先跑 Prettier `format:check`（push 前先 `npm run format`）。

- **純函式優先**：辨識 JSON → 內部型別的 parser / normalizer、serial_no 比對、日期/時數正規化，皆寫成可單測純函式。
- **權限**：`office` 可讀寫；`admin` / `seo_manager` / 未登入一律 fail-closed（RLS + `requireRole` 雙防線）。
- **Gemini 呼叫**：注入 / mock 隔離，不打真 API（沿用現有 gemini 測試套路）。

## 11. 邊界情況

- 一張照片多列維護紀錄 → 逐列辨識，review 可逐列增刪。
- 手寫模糊 → review 強制人工確認，永不自動寫入。
- 同名客戶 → 三層結構下客戶為獨立實體；建卡時可選現有客戶或新建（以 name 比對提示，不強制唯一）。
