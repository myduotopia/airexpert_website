-- 0035：客戶來源 mx_customers.source（#266，匯入舊系統客戶資料並標註 FB 客戶）。
--
-- mx_customers 為保養卡模組與 ERP 共用的客戶表（同 0026 的作法）：
--   - 只新增一個 nullable text 欄位，無預設值、無 check 約束（自由文字；常見值 FB = Facebook 來的客戶，
--     前端表單與匯入腳本都把 fb 正規化為大寫 FB），既有列一律為 null；
--   - RLS policy 為表層級：既有 maintenance（mx_has_access()，0032）／erp／service_report policy
--     自動涵蓋新欄位，本檔不建立、不變更任何 policy；
--   - erp_post_document 以 select * into record 讀客戶，不受欄位增加影響。
-- 索引：客戶列表依來源篩選（FB／其他有值／未填）；partial index 只收有值的列。
--
-- 須先於前端程式上線（新版客戶頁會 select source）；舊程式搭配本檔不受影響。
-- 本檔可重複執行。

alter table mx_customers add column if not exists source text;   -- 客戶來源（FB 等，自由文字）

comment on column mx_customers.source is '客戶來源（自由文字；FB = Facebook 來的客戶，#266）';

create index if not exists mx_customers_source_idx
  on mx_customers (source) where source is not null;
