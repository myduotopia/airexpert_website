# 行政「保養記錄卡」— 開帳號與完整測試流程

> 對象：專案負責人 / QA。用來在 PR #120 merge 前後，驗證 office 行政功能是否正常。
> 對應 PR：#120（Closes #117 #118 #119）。功能設計見
> [spec](superpowers/specs/2026-07-25-office-maintenance-card-mvp-design.md)。

---

## 0. 前置作業（沒做，功能無法運作）

| # | 事項 | 說明 | 沒做的後果 |
|---|---|---|---|
| 0-1 | **執行 migration 0011** | Supabase → SQL Editor 貼上 `supabase/migrations/0011_office_maintenance.sql` **整檔照跑（含 RLS，勿拆掉）** | 資料表不存在，功能一行都動不了 |
| 0-2 | **執行 migration 0012** | 同上貼 `supabase/migrations/0012_maintenance_soft_delete.sql`（封存區軟刪除所需） | 封存 / 復原 / 永久刪除會報 `archived_at` 欄位不存在 |
| 0-3 | **設定 Gemini API key** | 後台 → 網站設定 ▸ AI，貼上 Gemini key（建議付費層：不限流、內容不被訓練；model 需為 `gemini-2.5-flash` 或 `gemini-2.5-pro`）| 手動輸入可用；**拍照辨識**會回「尚未設定 key」|
| 0-4 | **執行 migration 0014** | 同上貼 `supabase/migrations/0014_record_service_type.sql`（服務類型欄位 + 既有資料回填所需；全檔冪等） | 新增／編輯維護紀錄、拍照匯入全部寫入失敗，訊息為 `Could not find the 'service_type' column of 'mx_records' in the schema cache` |

### 0-1 / 0-2 / 0-4 驗證 migration 是否套用成功
在 SQL Editor 執行，五項都要符合預期：

```sql
-- 應回 4 張表：mx_customers / mx_import_drafts / mx_machines / mx_records
select tablename from pg_tables where tablename like 'mx_%' order by 1;

-- 應回 is_office
select proname from pg_proc where proname = 'is_office';

-- 應對每張 mx_ 表各回一條 "office all ..." policy（共 4 條）
select tablename, policyname from pg_policies where tablename like 'mx_%' order by 1;

-- 0012：mx_machines 應有 archived_at 欄位
select column_name from information_schema.columns
where table_name = 'mx_machines' and column_name = 'archived_at';

-- 0014：mx_records 應有 service_type 欄位
select column_name from information_schema.columns
where table_name = 'mx_records' and column_name = 'service_type';
```

> ⚠️ **部署順序**：`service_type` 是前端每次寫入維護紀錄都會帶的欄位。
> 前端上線前（或上線後立刻）務必先跑 0014，否則新增／編輯／拍照匯入都會失敗。

---

## 1. 建立行政（office）帳號

> office 帳號**沒有預設帳密**，由 admin 當場建立，email 與初始密碼都自己決定。

1. 用管理員帳號 `admin@airexpert.com.tw` 登入後台 `/admin/login`
2. 左側欄 → **人員管理**（`/admin/staff`）
3. 下方「新增帳號」表單：
   - **角色**：選 **行政（保養記錄卡）**
   - **Email**：例 `office@airexpert.com.tw`
   - **初始密碼**：自訂，**至少 8 碼**
4. 按建立 → 列表出現該帳號，角色顯示「行政」
5. 把這組 email + 密碼交給行政人員

備註：
- 建立時已標記 email 已驗證，**不寄驗證信**，建完即可登入。
- 要停用：人員管理列表該列的「移除」鈕（連同登入帳號一併刪除，對方即無法登入）。
- 目前沒有「行政自助改密」頁（不在本 MVP 範圍）；如需改密走 Supabase Auth 一般流程。

**✅ 驗收：** 人員管理列表出現一個角色為「行政」的帳號。

---

## 2. 角色隔離測試（安全核心）

### 2-1 office 只看得到保養記錄卡
1. 登出 admin，改用剛建立的 office 帳號登入
2. **預期：**
   - 側欄**只有**「保養記錄卡」一項（看不到商品 / 最新消息 / SEO / 網站設定 / 人員管理…）
   - 登入後自動落在 `/admin/maintenance`（而非後台總覽）

### 2-2 越權存取被擋
用 office 帳號在網址列直接輸入以下路徑，**預期全部被導回 `/admin/login`**：
- `/admin/products`
- `/admin/staff`
- `/admin/settings`

### 2-3 admin 看不到保養記錄卡
1. 登出 office，改用 admin 登入
2. **預期：** admin 側欄**沒有**「保養記錄卡」項；直接輸入 `/admin/maintenance` 也被導回登入（方案 B 資料隔離）

**✅ 驗收：** office 只見保養卡、admin 看不到保養卡、跨區存取被擋。

---

## 3. 手動輸入測試（不需 Gemini key）

以 office 帳號操作。

### 3-1 建立新卡
1. `/admin/maintenance` → 右上「新增保養卡」
2. 填寫（**客戶名稱、機號為必填**，其餘可空），用照片上的實際資料即可，例：
   - 客戶名稱：`念德鋼鐵工業(股)公司`
   - 機號：`B072303002`
   - 機型：`PMV10`、馬力：`10HP`、電壓：`220V`、卡號：`KC054`
3. 按建立 → **預期：** 導向該卡詳情頁，基本資訊正確顯示

### 3-2 新增維護紀錄
1. 卡詳情頁 → 「新增維護紀錄」
2. 填日期、時數、專用油、各濾清器、維護員等（皆可空）
3. 儲存 → **預期：** 回到詳情頁，維護紀錄表格出現該列

### 3-3 編輯
1. 詳情頁右上「編輯基本資訊」→ 改機型 → 儲存 → **預期：** 詳情頁更新
2. 維護列右側「編輯」→ 改時數 → 儲存 → **預期：** 該列更新

### 3-4 刪除
- 維護列右側「移除」→ 確認 → **預期：** 該列消失

### 3-5 列表搜尋 / 排序
1. 回 `/admin/maintenance`
2. 搜尋框輸入機號或客戶名 → **預期：** 即時過濾
3. 點欄位標題（機號 / 客戶 / 機型 / 最後保養日）→ **預期：** 可排序

### 3-6 服務類型與篩選頁籤
1. 3-2／3-3 的表單最上方有「服務類型」下拉（未判定／例檢／保養／維修）；
   手動新增／編輯**不會自動分類**，維持你選的值（留「未判定」就存 null）
2. 詳情頁維護紀錄表格的「類型」欄會顯示對應 badge，未判定為灰色
3. 表格上方頁籤：全部／例檢（n）／保養（n）／維修（n）／未判定（n）
   → **預期：** 點任一頁籤只列出該類型（網址帶 `?type=`，重新整理仍保持）；
   四個類型的數字相加 = 全部的列數；該類型沒有資料時顯示「沒有「◯◯」的維護紀錄。」
4. 手動把網址改成 `?type=亂打` → **預期：** 視同「全部」，不報錯

**✅ 驗收：** 建卡、維護列增/改/刪、編輯基本資訊、搜尋排序、服務類型篩選皆正常。

---

## 4. 拍照 AI 辨識測試（需 Gemini key）

以 office 帳號操作。準備一張男生卡照片（手機拍即可）。

### 4-1 未命中 → 建新卡
1. `/admin/maintenance` → 右上「拍照辨識」（`/admin/maintenance/import`）
2. 點上傳區 → 拍照 / 選一張**新機號**的男生卡
3. **預期：**
   - 顯示「辨識中…」後出現 review 畫面
   - 上方顯示照片預覽 + 「未比對到既有卡，將建立新卡」
   - 基本資訊與維護列**已被 AI 預填**，可逐欄修改、逐列增刪
   - **點照片預覽可全螢幕放大**（點任意處或右上 ✕ 關閉），方便對照手寫原稿
4. 修正辨識錯誤的欄位 → 按「確認並匯入保養卡」
5. **預期：** 導向新卡詳情，維護列已匯入（這些列的 `source` 為 `photo`）

> **辨識準確度提醒：** 手寫繁中 + 稀疏表格，欄位對齊本就是 AI 的難點。prompt 已加強
> 民國年換算與對欄規則，但**仍會偶爾錯位**，review 就是為此而設。若對欄常錯，可到
> 「網站設定 ▸ AI」把 model 換成 `gemini-2.5-pro`（視覺 / 表格推理較強）再試。

### 4-2 命中 → 附加到既有卡
1. 再次「拍照辨識」，這次用**已存在機號**（例 4-1 或 3-1 建過的機號）的照片
2. **預期：** review 畫面顯示「比對到既有卡：機號 XXX／客戶 YYY。將附加 N 列維護紀錄。」，且**不**再問基本資訊
3. 確認儲存 → **預期：** 導向該既有卡詳情，新維護列附加在原有紀錄之後

### 4-3 稽核紀錄
在 SQL Editor 確認每次辨識都有留痕：
```sql
select id, status, photo_path, machine_id, created_at
from mx_import_drafts order by created_at desc limit 5;
```
**預期：** 成功匯入的列 `status = 'committed'` 且 `machine_id` 有值；`photo_path` 指向已存的原圖。

### 4-4 錯誤情境
- **未設 key 時**（若尚未做 0-3）：辨識應回友善訊息，提示改用手動輸入，且不崩潰
- **辨識品質**：手寫繁中 + 數字辨識不會 100% 準，review 為**強制**、永不自動寫入 —— 感受一下準確度，若某欄（時數 / 日期）常錯，回報給開發者可再調 prompt

**✅ 驗收：** 新機號建卡、既有機號附加、稽核留痕皆正常；辨識結果一律經人工確認才寫入。

---

## 5. 封存區（軟刪除）測試

> 需先完成 0-2（migration 0012）。以 office 帳號操作。

### 5-1 刪除（封存）
1. `/admin/maintenance` 列表 → 某列右側「刪除」→ **二次確認**（提示「將移到封存區，可再復原」）
2. **預期：** 該卡從列表消失；點右上「封存區」→ 該卡出現在封存清單，含「封存時間」

### 5-2 封存後同機號可重用
1. 封存某張卡（機號例 `B072303002`）後，回列表 → 新增保養卡，用**同一機號**建立
2. **預期：** 可成功建立，不會被封存區的舊卡擋住（部分唯一索引生效）。拍照辨識同機號時，也只會比對到「未封存」的那張

### 5-3 復原
1. 封存區 → 某列「復原」
2. **預期：** 卡回到正常列表，封存區不再顯示它

### 5-4 永久刪除
1. 封存區 → 某列「永久刪除」→ **更強的二次確認**（提示不可復原）
2. **預期：** 卡從封存區消失；該卡的所有維護紀錄一併刪除（FK cascade）。用 SQL 覆核：
```sql
-- 應查不到該機號的卡與其維護列
select * from mx_machines where serial_no = '<剛永久刪除的機號>';
```

**✅ 驗收：** 刪除→封存區、復原、永久刪除（連維護紀錄）皆正常；封存後同機號可重用。

---

## 6. 資料隔離覆核（選作，進階）

確認 RLS 真的擋住非 office：在 Supabase SQL Editor（以 service_role 執行，會看得到資料，屬正常），若要驗證 RLS，改用「以某使用者身分」的方式測試較準；一般情況信任 migration 的 policy 即可。快速心智檢查：

- office session 能 CRUD `mx_*` → 因 `is_office()` policy
- admin / seo_manager 的前端根本進不了 `/admin/maintenance`（第 2 節已驗），且其 session 對 `mx_*` 無 policy → fail-closed

---

## 附錄：本階段 MVP 範圍界線

**包含（測完即達成）：** office 角色 + 資料隔離、手動 CRUD（含編輯）、拍照辨識匯入（機號比對）、封存區（軟刪除 / 復原 / 永久刪除）、最小稽核。

**不包含（後續版本）：** 到期提醒 / 預警、報表匯出（PDF / Excel）、師傅端 App / 男生卡數位化、客戶自助查詢、多張批次辨識。
