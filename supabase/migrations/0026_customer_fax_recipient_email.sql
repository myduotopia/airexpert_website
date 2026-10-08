-- 0026：客戶主檔補欄位：傳真、收信人、Email（#222，對照舊系統客戶主檔）。
--
-- mx_customers 為保養卡模組與 ERP 共用的客戶表：
--   - 只新增 nullable text 欄位，無預設值、無約束、無索引，既有列一律為 null；
--   - 保養卡模組的讀寫（select * / 指定欄位 insert、update）不受影響，RLS policy 為表層級，
--     既有 office / erp / service_report policy 自動涵蓋新欄位，不需變更；
--   - erp_post_document 以 select * into record 讀客戶，不受欄位增加影響。
-- Email 格式由前端 normalizeCustomerInput 檢查（可多筆，以 ; , 分隔）；DB 不加 check，
-- 以免日後匯入舊資料時被格式不一的舊值擋下。
--
-- 須先於前端程式上線（新版客戶頁會 select 這三欄）；舊程式搭配本檔不受影響。
-- 本檔可重複執行。

alter table mx_customers add column if not exists fax            text;   -- 傳真
alter table mx_customers add column if not exists mail_recipient text;   -- 收信人（郵寄對帳單／發票的收件人）
alter table mx_customers add column if not exists email          text;   -- Email（可多筆，以 ; 分隔）

comment on column mx_customers.fax is '傳真（ERP 客戶主檔）';
comment on column mx_customers.mail_recipient is '收信人：郵寄對帳單／發票的收件人（ERP 客戶主檔）';
comment on column mx_customers.email is 'Email，可多筆以 ; 分隔（ERP 客戶主檔）';
