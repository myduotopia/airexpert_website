-- 0016_customer_profile.sql
-- 保養卡：客戶主檔補齊欄位（聯絡人 / 電話 / 地址 / 備註 / 更新時間）。
-- 依賴 0011（建立 mx_customers 與 office RLS）、0013（新增 mx_customers.code）。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

alter table mx_customers add column contact_person text;  -- 聯絡人
alter table mx_customers add column phone        text;    -- 電話
alter table mx_customers add column address      text;    -- 地址
alter table mx_customers add column note         text;    -- 備註
alter table mx_customers add column updated_at   timestamptz not null default now();

-- 客戶列表可用電話搜尋；比照 0013 的 code 索引做正規化（lower + btrim）。
create index mx_customers_phone_idx
  on mx_customers (lower(btrim(phone))) where phone is not null;

-- 備註：client 端搜尋為主，本索引供未來資料量成長後改走 DB 端查詢使用。
-- 備註：code 仍刻意不設唯一約束（0013 的考量：回填資料可能重複）；
--       重複由 UI 於儲存時提示（軟性警告，不擋）。
