-- 0016_customer_profile.sql
-- 保養卡：客戶主檔補齊欄位（聯絡人 / 電話 / 地址 / 備註 / 更新時間）。
-- updated_at 於新增欄位後回填為 created_at（見下方），避免既有客戶的「最後更新」
-- 全部顯示成本次 migration 的執行時間。
-- 依賴 0011（建立 mx_customers 與 office RLS）、0013（新增 mx_customers.code）。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

alter table mx_customers add column contact_person text;  -- 聯絡人
alter table mx_customers add column phone        text;    -- 電話
alter table mx_customers add column address      text;    -- 地址
alter table mx_customers add column note         text;    -- 備註
alter table mx_customers add column updated_at   timestamptz not null default now();

-- 回填：既有客戶未曾編輯過，上面的 default now() 會讓所有人的「最後更新」都變成
-- 本檔執行的時間點（看起來像剛剛全部被改過）。改回建立時間才是實情。
-- 只在本次新增欄位後執行一次；重跑整支 migration 會先卡在 add column，不會重複套用。
update mx_customers set updated_at = created_at;

-- 客戶列表可用電話搜尋；比照 0013 的 code 索引做正規化（lower + btrim）。
create index mx_customers_phone_idx
  on mx_customers (lower(btrim(phone))) where phone is not null;

-- 備註：client 端搜尋為主，本索引供未來資料量成長後改走 DB 端查詢使用。
-- 備註：code 仍刻意不設唯一約束（0013 的考量：回填資料可能重複）；
--       重複由 UI 於儲存時提示（軟性警告，不擋）。
