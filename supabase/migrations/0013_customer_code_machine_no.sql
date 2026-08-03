-- 0013_customer_code_machine_no.sql
-- 保養卡：卡號改客戶編號（移到客戶層）+ 新增機台編號。依賴 0011 / 0012。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

alter table mx_customers add column code text;      -- 客戶編號（客戶層識別碼）
alter table mx_machines  add column machine_no text; -- 機台編號（機台層）

-- best-effort：把既有機台的 card_no 回填到其客戶的 code（測試資料；同客戶多值取其一）。
update mx_customers c
set code = m.card_no
from mx_machines m
where m.customer_id = c.id and c.code is null and m.card_no is not null;

-- 客戶編號查詢索引（供輸入客戶編號時查客戶；不強制唯一以免回填衝突）。
create index mx_customers_code_idx on mx_customers (lower(btrim(code))) where code is not null;

alter table mx_machines drop column card_no;
