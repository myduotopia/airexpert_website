-- 0020_erp_foundation.sql
-- ERP 地基（issue #172，spec：docs/superpowers/specs/2026-09-15-erp-design.md §2.0、§3.1、§4、§5、§9）
--   * 模組授權：admin_module_grants + has_module(text)；seed 僅授權 office@airexpert.com.tw
--   * 全部 erp_* 表：倉庫 / 廠商 / 品項 / 單據 / 單據行 / 行序號 / 取號 / 機號 / 存量 / 庫存帳 / 收付款 / 沖銷
--   * mx_customers 擴充 ERP 欄位（統編、發票抬頭、送貨地址、付款條件、業務）+ 客戶編號 partial unique
--   * RLS：所有 erp_* → has_module('erp')；mx_customers、mx_machines 另加 erp policy
--   * RPC（security invoker，開頭檢查 has_module）：取號、過帳、作廢、收付款、沖銷、作廢收付款
--   * Views（security_invoker）：單據餘額、客戶／廠商餘額、採購到貨進度
-- 依賴 0001（set_updated_at()、products）、0002（admin_profiles）、0011（mx_* 三層）、
--      0013（mx_customers.code）、0015（mx_machines.card_type）、0016（mx_customers 聯絡欄位）、
--      0018／0019（mx_machines 的 (客戶, 卡別, 機號) partial unique index）。
--
-- ⚠️ 套用正式 DB 前需使用者確認（以 pooler 連線或 SQL Editor 貼上執行）。
-- 本檔設計為可重複執行：create table if not exists、add column if not exists、
--   create or replace function / view、drop policy / trigger if exists 後再建立、seed 皆 on conflict do nothing。
--   （注意：若之後改了表結構，重跑本檔不會補欄位；schema 調整請另開 0021_erp_*.sql。）
--
-- 錯誤契約（§9）：raise exception using errcode = 'P0001', message = '<code>', detail = '<中文訊息>'
--   code ∈ forbidden / not_draft / not_posted / validation / insufficient_stock /
--          serial_unavailable / over_receipt / has_dependents / over_allocation
--   supabase-js 端：error.message = code、error.details = 中文訊息。
--
-- 實作決策（spec 未明言或需補足之處，皆為最小合理選擇）：
--   1. 稅額計算與前端 frontend/src/lib/erp/calc.ts 一致：subtotal = round(Σ 行金額, 2)；
--      外加 tax = round(subtotal × rate, 幣別位數)、total = subtotal + tax；
--      內含 untaxed = round(total / (1 + rate), 幣別位數)、tax = total − untaxed；
--      未稅／合計本身不再依幣別取整（TWD 單價有小數時可能出現小數）。
--   2. 進貨 in_cost 與 avg-cost.ts 一致：(行金額 + 折扣 × 行金額 / 品項合計) / qty × 匯率，
--      不因「內含稅」再扣稅。
--   3. erp_document_line_serials 增加 mx_machine_id、mx_machine_created 兩欄，記錄銷貨過帳時
--      「新建」或「連結既有」的保養卡機台，作廢時才能只刪除由該銷貨單建立的機台。
--   4. 作廢銷貨判斷機台是否有保養紀錄，需讀 mx_records；mx_records 只有 office policy，
--      故以 security definer 的 erp_machine_has_records(uuid) 查詢（僅回 boolean），不對 erp 開放 mx_records。
--   5. 品項約束：service/expense 不得追蹤庫存與序號；追蹤序號必追蹤庫存；
--      mx_card_type 非 null 必須追蹤序號（保養卡機台需要機號）。
--   6. 草稿階段不在 DB 層強制「item 行必填 item_id」，改於過帳驗證（草稿可先存空白行）。
--      過帳需至少一個 item 行（僅折扣／備註行的單據無意義）。
--   7. 入庫新機號（I、A 盤盈）若同品項已有相同機號（任何狀態）→ serial_unavailable，不重用舊列
--      （避免作廢時無法回復舊狀態）。
--   8. SR／PR 指定來源行時，累計退貨量不得超過來源行數量 → validation。
--   9. 機號的 in_doc_id = 建立該機號的入庫單（I／A 盤盈，永不改）；out_doc_id = 最近一次出庫單
--      （S／PR／A 盤虧）。非 in_stock 狀態 warehouse_id 清空；SR 不改 out_doc_id。
--  10. I／A 盤盈作廢要刪除其建立的機號：機號須仍 in_stock、在原倉、且未被其他任何單據（含草稿／作廢單）
--      的行序號引用，否則 serial_unavailable。
--  11. 作廢寫入的反向庫存帳 move_date = 作廢當天（current_date）。
--  12. S／I／SR／PR 作廢時若有沖銷（posted 收付款）→ has_dependents。
--  13. erp_payments 另加 voided_by；erp_post_payment 付款方式為支票且未給 check_status 時預設 'pending'。
--  14. 沖銷規則：每筆沖銷後單據 outstanding 需落在 [0, total]（S/I）或 [total, 0]（SR/PR），
--      且該收付款的沖銷合計需介於 0 與 amount 之間，違反皆 over_allocation。
--  15. 內部輔助函式（erp_raise、erp_stock_apply、erp_calc_tax、erp_avg_*）因 security invoker 的 RPC
--      需要由呼叫者執行，故同樣 grant 給 authenticated；會寫資料的 erp_stock_apply 開頭也檢查 has_module。
--      （erp 使用者本就能經 RLS 直接寫 erp_stock_levels，並未擴權。）

-- ============================================================
-- 1) 模組授權
-- ============================================================
create table if not exists admin_module_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  module     text not null check (module in ('erp')),
  created_at timestamptz not null default now(),
  primary key (user_id, module)
);
alter table admin_module_grants enable row level security;

drop policy if exists "read own grants" on admin_module_grants;
create policy "read own grants" on admin_module_grants
  for select to authenticated using (user_id = auth.uid());
-- 寫入僅 service_role / SQL Editor（無 insert/update/delete policy，fail-closed）。

create or replace function has_module(p_module text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_module_grants g
    where g.user_id = auth.uid() and g.module = p_module
  );
$$;
revoke execute on function has_module(text) from public, anon;
grant execute on function has_module(text) to authenticated;

-- seed：僅 office@airexpert.com.tw（帳號不存在時不插入任何列）
insert into admin_module_grants (user_id, module)
select id, 'erp' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;

-- ============================================================
-- 2) 基本資料：倉庫 / 廠商 / 品項
-- ============================================================
create table if not exists erp_warehouses (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  name       text not null,
  is_default boolean not null default false,
  active     boolean not null default true,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists erp_warehouses_code_key on erp_warehouses (lower(btrim(code)));
-- 至多一個預設倉
create unique index if not exists erp_warehouses_default_key on erp_warehouses (is_default) where is_default;

create table if not exists erp_vendors (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,                 -- 廠商編號，如 KA405
  name           text not null,
  tax_id         text,
  contact_person text,
  phone          text,
  fax            text,
  email          text,
  address        text,
  currency       text not null default 'TWD',
  payment_terms  text,                          -- 自由文字：月結30天、票期60天…
  active         boolean not null default true,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists erp_vendors_code_key on erp_vendors (lower(btrim(code)));

create table if not exists erp_items (
  id                uuid primary key default gen_random_uuid(),
  code              text not null,              -- 產品編號，如 ALH-15AI
  name              text not null,              -- 品名規格
  kind              text not null check (kind in ('machine','part','service','expense')),
  unit              text not null default '台',
  track_serial      boolean not null default false,
  track_stock       boolean not null default true,
  mx_card_type      text check (mx_card_type in ('compressor','filter')),  -- 非 null → 銷貨過帳建立保養卡機台
  brand             text,
  model             text,                       -- 帶入 mx_machines.model
  sale_price        numeric(14,2),
  purchase_price    numeric(14,2),
  avg_cost          numeric(14,4) not null default 0,   -- 移動加權平均（TWD、全公司不分倉）
  safety_stock      numeric(12,3) not null default 0,
  default_vendor_id uuid references erp_vendors(id),
  product_id        uuid references products(id) on delete set null,
  active            boolean not null default true,
  note              text,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- 服務／費用不追蹤庫存與序號
  constraint erp_items_service_no_stock_check
    check (kind not in ('service','expense') or (not track_stock and not track_serial)),
  -- 追蹤序號必追蹤庫存
  constraint erp_items_serial_needs_stock_check check (not track_serial or track_stock),
  -- 會建立保養卡機台者必追蹤序號（機台需要機號）
  constraint erp_items_card_needs_serial_check check (mx_card_type is null or track_serial)
);
create unique index if not exists erp_items_code_key on erp_items (lower(btrim(code)));
create index if not exists erp_items_kind_idx on erp_items (kind);

-- mx_customers 擴充（客戶主檔與保養卡共用）
alter table mx_customers add column if not exists tax_id           text;   -- 統一編號
alter table mx_customers add column if not exists invoice_title    text;   -- 發票抬頭
alter table mx_customers add column if not exists delivery_address text;   -- 送貨地址（address 為聯絡地址）
alter table mx_customers add column if not exists payment_terms    text;   -- 付款條件
alter table mx_customers add column if not exists sales_rep        text;   -- 業務
alter table mx_customers add column if not exists erp_active       boolean not null default true;
-- 客戶編號唯一（現有資料已確認無重複；空白編號不受限）
create unique index if not exists mx_customers_code_key on mx_customers (lower(btrim(code)))
  where code is not null and btrim(code) <> '';

-- ============================================================
-- 3) 單據
-- ============================================================
create table if not exists erp_documents (
  id              uuid primary key default gen_random_uuid(),
  doc_type        text not null check (doc_type in ('Q','P','I','PR','S','SR','T','A')),
  doc_no          text unique,                  -- 過帳時取號
  doc_date        date not null default current_date,
  status          text not null default 'draft' check (status in ('draft','posted','voided')),
  customer_id     uuid references mx_customers(id) on delete restrict,   -- Q/S/SR
  vendor_id       uuid references erp_vendors(id) on delete restrict,    -- P/I/PR
  warehouse_id    uuid references erp_warehouses(id),   -- I/PR/S/SR/A 出入倉；T 為來源倉
  to_warehouse_id uuid references erp_warehouses(id),   -- 僅 T
  source_doc_id   uuid references erp_documents(id),    -- Q→S、P→I、S→SR、I→PR
  -- 表頭快照（列印用）
  party_name      text,
  party_tax_id    text,
  party_contact   text,
  party_phone     text,
  party_address   text,
  sales_rep       text,
  tax_type        text not null default 'excluded' check (tax_type in ('excluded','included','exempt')),
  tax_rate        numeric(5,4) not null default 0.05,
  currency        text not null default 'TWD',
  exchange_rate   numeric(12,6) not null default 1,
  amount_untaxed  numeric(14,2) not null default 0,
  tax_amount      numeric(14,2) not null default 0,
  total_amount    numeric(14,2) not null default 0,     -- 單據幣別
  total_twd       numeric(14,2) not null default 0,     -- 應收應付以此計
  invoice_no      text,
  expected_date   date,                                 -- P：交貨日期；Q：報價有效期限
  note            text,
  posted_at       timestamptz,
  posted_by       uuid,
  voided_at       timestamptz,
  voided_by       uuid,
  void_reason     text,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint erp_documents_customer_check check (doc_type not in ('Q','S','SR') or customer_id is not null),
  constraint erp_documents_vendor_check   check (doc_type not in ('P','I','PR') or vendor_id is not null),
  constraint erp_documents_transfer_check check (doc_type <> 'T' or (warehouse_id is not null
                                                  and to_warehouse_id is not null
                                                  and warehouse_id <> to_warehouse_id)),
  constraint erp_documents_doc_no_check   check (status = 'draft' or doc_no is not null)
);
create index if not exists erp_documents_type_date_idx on erp_documents (doc_type, doc_date desc);
create index if not exists erp_documents_customer_idx  on erp_documents (customer_id) where customer_id is not null;
create index if not exists erp_documents_vendor_idx    on erp_documents (vendor_id) where vendor_id is not null;
create index if not exists erp_documents_source_idx    on erp_documents (source_doc_id) where source_doc_id is not null;
create index if not exists erp_documents_status_idx    on erp_documents (status);

create table if not exists erp_document_lines (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references erp_documents(id) on delete cascade,
  line_no        int not null,
  line_type      text not null check (line_type in ('item','discount','note')),
  item_id        uuid references erp_items(id) on delete restrict,   -- item 行過帳時必填
  description    text,
  qty            numeric(12,3) not null default 0,     -- A 單可為負（盤虧）
  unit_price     numeric(14,2) not null default 0,
  amount         numeric(14,2) not null default 0,     -- item: qty×unit_price；discount: 負數；note: 0
  unit_cost      numeric(14,4),                        -- 過帳時寫入
  source_line_id uuid references erp_document_lines(id),
  serial_nos     text[],                               -- 入庫新機號（I、A 盤盈），過帳時建立 erp_serials
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (document_id, line_no)
);
create index if not exists erp_document_lines_item_idx   on erp_document_lines (item_id) where item_id is not null;
create index if not exists erp_document_lines_source_idx on erp_document_lines (source_line_id) where source_line_id is not null;

create table if not exists erp_doc_sequences (
  prefix  text not null,
  period  text not null,                       -- 民國年月，如 '11509'
  last_no int not null default 0,
  primary key (prefix, period)
);

-- ============================================================
-- 4) 庫存
-- ============================================================
create table if not exists erp_serials (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references erp_items(id),
  serial_no     text not null,                 -- 機號，如 26-PM15060010
  status        text not null check (status in ('in_stock','sold','returned_to_vendor','written_off')),
  warehouse_id  uuid references erp_warehouses(id),
  customer_id   uuid references mx_customers(id),
  unit_cost     numeric(14,4),
  in_doc_id     uuid references erp_documents(id),
  out_doc_id    uuid references erp_documents(id),
  mx_machine_id uuid references mx_machines(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint erp_serials_in_stock_wh_check check (status <> 'in_stock' or warehouse_id is not null)
);
create unique index if not exists erp_serials_item_serial_key on erp_serials (item_id, lower(btrim(serial_no)));
create index if not exists erp_serials_serial_lookup_idx on erp_serials (lower(btrim(serial_no)));
create index if not exists erp_serials_status_wh_idx on erp_serials (status, warehouse_id);
create index if not exists erp_serials_customer_idx on erp_serials (customer_id) where customer_id is not null;

create table if not exists erp_document_line_serials (
  line_id            uuid not null references erp_document_lines(id) on delete cascade,
  serial_id          uuid not null references erp_serials(id) on delete restrict,
  -- 決策 3：銷貨過帳時寫入，作廢時據以判斷是否刪除機台
  mx_machine_id      uuid references mx_machines(id) on delete set null,
  mx_machine_created boolean not null default false,
  primary key (line_id, serial_id)
);
create index if not exists erp_document_line_serials_serial_idx on erp_document_line_serials (serial_id);

create table if not exists erp_stock_levels (
  item_id      uuid not null references erp_items(id),
  warehouse_id uuid not null references erp_warehouses(id),
  qty          numeric(12,3) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (item_id, warehouse_id)
);

create table if not exists erp_stock_moves (   -- 庫存帳（只增不改）
  id          uuid primary key default gen_random_uuid(),
  moved_at    timestamptz not null default now(),
  move_date   date not null,
  item_id     uuid not null references erp_items(id),
  warehouse_id uuid not null references erp_warehouses(id),
  qty         numeric(12,3) not null,            -- 入 +、出 −
  unit_cost   numeric(14,4) not null,
  document_id uuid not null references erp_documents(id),
  line_id     uuid references erp_document_lines(id),
  is_reversal boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists erp_stock_moves_item_date_idx on erp_stock_moves (item_id, move_date);
create index if not exists erp_stock_moves_wh_idx on erp_stock_moves (warehouse_id, move_date);
create index if not exists erp_stock_moves_doc_idx on erp_stock_moves (document_id);

-- ============================================================
-- 5) 應收應付
-- ============================================================
create table if not exists erp_payments (
  id             uuid primary key default gen_random_uuid(),
  direction      text not null check (direction in ('in','out')),   -- in=收款(客戶) out=付款(廠商)
  doc_no         text unique,                   -- RC11509001 / PM11509001
  pay_date       date not null,
  customer_id    uuid references mx_customers(id),
  vendor_id      uuid references erp_vendors(id),
  method         text not null check (method in ('cash','transfer','check','other')),
  amount         numeric(14,2) not null check (amount > 0),         -- TWD
  check_no       text,
  check_due_date date,
  bank           text,
  check_status   text check (check_status in ('pending','cleared','bounced')),
  status         text not null default 'posted' check (status in ('posted','voided')),
  voided_at      timestamptz,
  voided_by      uuid,
  void_reason    text,
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint erp_payments_party_check
    check ((direction = 'in' and customer_id is not null and vendor_id is null)
        or (direction = 'out' and vendor_id is not null and customer_id is null)),
  constraint erp_payments_check_fields_check
    check (method <> 'check' or (check_no is not null and check_due_date is not null))
);
create index if not exists erp_payments_customer_idx on erp_payments (customer_id) where customer_id is not null;
create index if not exists erp_payments_vendor_idx on erp_payments (vendor_id) where vendor_id is not null;
create index if not exists erp_payments_date_idx on erp_payments (pay_date);
create index if not exists erp_payments_check_due_idx on erp_payments (check_due_date) where method = 'check';

create table if not exists erp_payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references erp_payments(id) on delete cascade,
  document_id uuid not null references erp_documents(id),
  amount      numeric(14,2) not null,           -- 對 SR/PR 為負
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists erp_payment_allocations_payment_idx on erp_payment_allocations (payment_id);
create index if not exists erp_payment_allocations_document_idx on erp_payment_allocations (document_id);

-- ============================================================
-- 6) updated_at 觸發器（沿用 0001 的 set_updated_at()）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'erp_warehouses','erp_vendors','erp_items','erp_documents','erp_document_lines',
    'erp_serials','erp_stock_levels','erp_payments'
  ]
  loop
    execute format('drop trigger if exists %1$s_updated_at on %1$I;', t);
    execute format(
      'create trigger %1$s_updated_at before update on %1$I for each row execute function set_updated_at();',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 7) RLS：所有 erp_* 僅 has_module('erp')；mx_customers / mx_machines 另加 erp policy
--    （select has_module(...)）寫法讓 planner 每個查詢只評估一次。
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'erp_warehouses','erp_vendors','erp_items','erp_documents','erp_document_lines',
    'erp_doc_sequences','erp_serials','erp_document_line_serials','erp_stock_levels',
    'erp_stock_moves','erp_payments','erp_payment_allocations'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "erp all %1$s" on %1$I;', t);
    execute format(
      'create policy "erp all %1$s" on %1$I for all to authenticated using ((select has_module(''erp''))) with check ((select has_module(''erp'')));',
      t
    );
    -- 縱深防禦：anon 不需要任何 ERP 表權限
    execute format('revoke all on table %I from anon;', t);
  end loop;

  foreach t in array array['mx_customers','mx_machines']
  loop
    execute format('drop policy if exists "erp all %1$s" on %1$I;', t);
    execute format(
      'create policy "erp all %1$s" on %1$I for all to authenticated using ((select has_module(''erp''))) with check ((select has_module(''erp'')));',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 8) seed：總倉
-- ============================================================
insert into erp_warehouses (code, name, is_default)
select 'MAIN', '總倉', true
where not exists (select 1 from erp_warehouses where lower(btrim(code)) = 'main')
  and not exists (select 1 from erp_warehouses where is_default);

-- ============================================================
-- 9) 輔助函式
-- ============================================================

-- 依錯誤契約拋出例外（message = code、detail = 中文訊息）
create or replace function erp_raise(p_code text, p_detail text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, p_code);
end;
$$;

-- 稅額計算（§5.1，與 calc.ts 一致，見決策 1）
create or replace function erp_calc_tax(
  p_subtotal numeric, p_tax_type text, p_tax_rate numeric, p_currency text, p_exchange_rate numeric
)
returns table (amount_untaxed numeric, tax_amount numeric, total_amount numeric, total_twd numeric)
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  v_dp  int := case when upper(btrim(coalesce(p_currency, 'TWD'))) = 'TWD' then 0 else 2 end;
  v_sub numeric := round(coalesce(p_subtotal, 0), 2);
  v_rate numeric := coalesce(p_tax_rate, 0);
begin
  if p_tax_type = 'excluded' then
    amount_untaxed := v_sub;
    tax_amount     := round(v_sub * v_rate, v_dp);
    total_amount   := v_sub + tax_amount;
  elsif p_tax_type = 'included' then
    total_amount   := v_sub;
    amount_untaxed := round(v_sub / (1 + v_rate), v_dp);
    tax_amount     := total_amount - amount_untaxed;
  else
    amount_untaxed := v_sub;
    tax_amount     := 0;
    total_amount   := v_sub;
  end if;
  total_twd := round(total_amount * coalesce(p_exchange_rate, 1), 0);
  return next;
end;
$$;

-- 入庫後移動平均（I、SR；作廢 PR／S 視同入庫）。與 avg-cost.ts avgCostAfterInbound 一致。
create or replace function erp_avg_in(p_q0 numeric, p_c0 numeric, p_qty numeric, p_cost numeric)
returns numeric
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when p_q0 < 0 or p_q0 + p_qty <= 0 then round(p_cost, 4)
    else round((p_q0 * p_c0 + p_qty * p_cost) / (p_q0 + p_qty), 4)
  end;
$$;

-- 以特定成本出庫後移動平均（PR；作廢 I／SR 視同出庫）。與 avg-cost.ts avgCostAfterReturnOut 一致。
create or replace function erp_avg_out(p_q0 numeric, p_c0 numeric, p_qty numeric, p_cost numeric)
returns numeric
language sql
immutable
security invoker
set search_path = public
as $$
  select case
    when p_q0 - p_qty <= 0 then round(p_c0, 4)
    else round((p_q0 * p_c0 - p_qty * p_cost) / (p_q0 - p_qty), 4)
  end;
$$;

-- 異動存量 + 寫庫存帳；出庫後該倉為負 → insufficient_stock
create or replace function erp_stock_apply(
  p_item_id uuid, p_warehouse_id uuid, p_qty numeric, p_unit_cost numeric,
  p_document_id uuid, p_line_id uuid, p_move_date date, p_is_reversal boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_qty numeric;
  v_item_code text;
  v_wh_code text;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;

  insert into erp_stock_levels as sl (item_id, warehouse_id, qty)
  values (p_item_id, p_warehouse_id, p_qty)
  on conflict (item_id, warehouse_id) do update set qty = sl.qty + excluded.qty
  returning sl.qty into v_qty;

  insert into erp_stock_moves (move_date, item_id, warehouse_id, qty, unit_cost, document_id, line_id, is_reversal)
  values (p_move_date, p_item_id, p_warehouse_id, p_qty, coalesce(p_unit_cost, 0), p_document_id, p_line_id, p_is_reversal);

  if p_qty < 0 and v_qty < 0 then
    select code into v_item_code from erp_items where id = p_item_id;
    select code into v_wh_code from erp_warehouses where id = p_warehouse_id;
    perform erp_raise('insufficient_stock',
      format('品項 %s 於倉庫 %s 庫存不足（異動後數量 %s）', v_item_code, v_wh_code, v_qty));
  end if;
end;
$$;

-- 機台是否已有保養紀錄（決策 4：mx_records 僅 office 可讀，故 security definer，只回 boolean）
create or replace function erp_machine_has_records(p_machine_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select has_module('erp')
     and exists (select 1 from mx_records r where r.machine_id = p_machine_id);
$$;

-- ============================================================
-- 10) 取號：prefix + 民國年(3) + 月(2) + 流水號(3，超過 999 自然變 4 位)
-- ============================================================
create or replace function erp_next_doc_no(p_prefix text, p_date date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_period text;
  v_no int;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if p_prefix is null or p_prefix not in ('Q','P','I','PR','S','SR','T','A','RC','PM') then
    perform erp_raise('validation', format('不支援的單號字首：%s', coalesce(p_prefix, '(空)')));
  end if;
  if p_date is null then
    perform erp_raise('validation', '取號需要單據日期');
  end if;

  v_period := lpad((extract(year from p_date)::int - 1911)::text, 3, '0')
              || to_char(p_date, 'MM');

  insert into erp_doc_sequences as s (prefix, period, last_no)
  values (p_prefix, v_period, 1)
  on conflict (prefix, period) do update set last_no = s.last_no + 1
  returning s.last_no into v_no;

  return p_prefix || v_period
         || case when v_no < 1000 then lpad(v_no::text, 3, '0') else v_no::text end;
end;
$$;

-- ============================================================
-- 11) 過帳（§5）
-- ============================================================
create or replace function erp_post_document(p_doc_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc        erp_documents%rowtype;
  v_src        erp_documents%rowtype;
  v_item       erp_items%rowtype;
  v_ser        erp_serials%rowtype;
  v_line       record;
  v_srcl       record;
  v_cust       record;
  v_vend       record;
  v_expect     text;
  v_cnt        int;
  v_sn         text;
  v_used       numeric;
  v_item_sum   numeric;
  v_disc_sum   numeric;
  v_tax        record;
  v_q0         numeric;
  v_c0         numeric;
  v_cost       numeric;
  v_amt        numeric;
  v_doc_no     text;
  v_serial_id  uuid;
  v_machine_id uuid;
  v_created    boolean;
  v_warnings   text[] := '{}';
  v_machines   uuid[] := '{}';
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;

  -- 1. 鎖定單據
  select * into v_doc from erp_documents where id = p_doc_id for update;
  if not found then
    perform erp_raise('validation', '找不到單據');
  end if;
  if v_doc.status <> 'draft' then
    perform erp_raise('not_draft', format('單據狀態為 %s，只能過帳草稿', v_doc.status));
  end if;

  -- 2. 表頭驗證
  if v_doc.doc_type in ('I','PR','S','SR','A','T') and v_doc.warehouse_id is null then
    perform erp_raise('validation', '請指定倉庫');
  end if;
  if v_doc.tax_rate < 0 or v_doc.exchange_rate <= 0 then
    perform erp_raise('validation', '稅率不可為負、匯率需大於 0');
  end if;

  if v_doc.source_doc_id is not null then
    select * into v_src from erp_documents where id = v_doc.source_doc_id;
    v_expect := case v_doc.doc_type when 'S' then 'Q' when 'I' then 'P'
                                    when 'SR' then 'S' when 'PR' then 'I' end;
    if not found or v_expect is null or v_src.doc_type <> v_expect then
      perform erp_raise('validation', '來源單據類型不符');
    end if;
    if v_src.status <> 'posted' then
      perform erp_raise('validation', format('來源單據 %s 尚未過帳或已作廢', coalesce(v_src.doc_no, '(草稿)')));
    end if;
    if v_src.customer_id is distinct from v_doc.customer_id
       or v_src.vendor_id is distinct from v_doc.vendor_id then
      perform erp_raise('validation', '來源單據的客戶／廠商與本單不同');
    end if;
  end if;

  if not exists (select 1 from erp_document_lines
                 where document_id = p_doc_id and line_type = 'item') then
    perform erp_raise('validation', '單據至少需要一個品項行');
  end if;

  -- 2. 行驗證
  for v_line in
    select l.*, i.code as item_code, i.track_serial, i.track_stock
    from erp_document_lines l
    left join erp_items i on i.id = l.item_id
    where l.document_id = p_doc_id
    order by l.line_no
  loop
    if v_line.line_type = 'item' then
      if v_line.item_id is null then
        perform erp_raise('validation', format('第 %s 行未指定品項', v_line.line_no));
      end if;
      if v_line.qty = 0 then
        perform erp_raise('validation', format('第 %s 行（%s）數量不可為 0', v_line.line_no, v_line.item_code));
      end if;
      if v_line.qty < 0 and v_doc.doc_type <> 'A' then
        perform erp_raise('validation', format('第 %s 行（%s）數量需為正數', v_line.line_no, v_line.item_code));
      end if;
      if v_doc.doc_type = 'A' and coalesce(btrim(v_line.description), '') = '' then
        perform erp_raise('validation', format('第 %s 行需填寫調整原因', v_line.line_no));
      end if;

      -- 序號數量
      if v_line.track_serial and v_doc.doc_type not in ('Q','P') then
        if abs(v_line.qty) <> trunc(abs(v_line.qty)) then
          perform erp_raise('validation', format('第 %s 行（%s）追蹤機號的品項數量需為整數', v_line.line_no, v_line.item_code));
        end if;
        if v_doc.doc_type = 'I' or (v_doc.doc_type = 'A' and v_line.qty > 0) then
          select count(*), count(distinct lower(btrim(x)))
            into v_cnt, v_used
            from unnest(coalesce(v_line.serial_nos, '{}'::text[])) as x
           where btrim(x) <> '';
          if v_cnt <> v_used or v_cnt <> coalesce(cardinality(v_line.serial_nos), 0) then
            perform erp_raise('validation', format('第 %s 行（%s）機號有空白或重複', v_line.line_no, v_line.item_code));
          end if;
          if v_cnt <> abs(v_line.qty) then
            perform erp_raise('validation', format('第 %s 行（%s）機號數 %s 與數量 %s 不符', v_line.line_no, v_line.item_code, v_cnt, v_line.qty));
          end if;
        else
          select count(*) into v_cnt from erp_document_line_serials where line_id = v_line.id;
          if v_cnt <> abs(v_line.qty) then
            perform erp_raise('validation', format('第 %s 行（%s）選取機號數 %s 與數量 %s 不符', v_line.line_no, v_line.item_code, v_cnt, v_line.qty));
          end if;
        end if;
      end if;

      -- 來源行
      if v_line.source_line_id is not null then
        select l.*, d.doc_type as src_doc_type, d.status as src_status,
               d.customer_id as src_customer_id, d.vendor_id as src_vendor_id
          into v_srcl
          from erp_document_lines l join erp_documents d on d.id = l.document_id
         where l.id = v_line.source_line_id;
        v_expect := case v_doc.doc_type when 'S' then 'Q' when 'I' then 'P'
                                        when 'SR' then 'S' when 'PR' then 'I' end;
        if v_srcl.id is null or v_expect is null or v_srcl.src_doc_type <> v_expect
           or v_srcl.src_status <> 'posted'
           or v_srcl.item_id is distinct from v_line.item_id
           or v_srcl.src_customer_id is distinct from v_doc.customer_id
           or v_srcl.src_vendor_id is distinct from v_doc.vendor_id
           or (v_doc.source_doc_id is not null and v_srcl.document_id <> v_doc.source_doc_id) then
          perform erp_raise('validation', format('第 %s 行的來源行不正確', v_line.line_no));
        end if;

        if v_doc.doc_type in ('I','SR','PR') then
          select coalesce(sum(l.qty), 0) into v_used
            from erp_document_lines l join erp_documents d on d.id = l.document_id
           where l.source_line_id = v_line.source_line_id
             and l.line_type = 'item'
             and (d.id = p_doc_id or (d.status = 'posted' and d.doc_type = v_doc.doc_type));
          if v_used > v_srcl.qty then
            if v_doc.doc_type = 'I' then
              perform erp_raise('over_receipt',
                format('品項 %s 累計進貨 %s 超過採購數量 %s', v_line.item_code, v_used, v_srcl.qty));
            else
              perform erp_raise('validation',
                format('品項 %s 累計退貨 %s 超過原單數量 %s', v_line.item_code, v_used, v_srcl.qty));
            end if;
          end if;
        end if;
      end if;
    end if;
  end loop;

  -- 3. 重算金額（§5.1）
  update erp_document_lines
     set amount = case line_type
                    when 'item' then round(qty * unit_price, 2)
                    when 'note' then 0
                    else round(-abs(amount), 2)   -- 折扣一律存負數（與 calc.ts 一致）
                  end
   where document_id = p_doc_id;

  select coalesce(sum(amount) filter (where line_type = 'item'), 0),
         coalesce(sum(amount) filter (where line_type = 'discount'), 0)
    into v_item_sum, v_disc_sum
    from erp_document_lines where document_id = p_doc_id;

  select * into v_tax
    from erp_calc_tax(v_item_sum + v_disc_sum, v_doc.tax_type, v_doc.tax_rate, v_doc.currency, v_doc.exchange_rate);

  -- 4. 取號
  v_doc_no := coalesce(v_doc.doc_no, erp_next_doc_no(v_doc.doc_type, v_doc.doc_date));

  -- 5. 快照客戶／廠商（空白才補）
  if v_doc.customer_id is not null then
    select * into v_cust from mx_customers where id = v_doc.customer_id;
    v_doc.party_name    := coalesce(v_doc.party_name, v_cust.invoice_title, v_cust.name);
    v_doc.party_tax_id  := coalesce(v_doc.party_tax_id, v_cust.tax_id);
    v_doc.party_contact := coalesce(v_doc.party_contact, v_cust.contact_person);
    v_doc.party_phone   := coalesce(v_doc.party_phone, v_cust.phone);
    v_doc.party_address := coalesce(v_doc.party_address, v_cust.delivery_address, v_cust.address);
    v_doc.sales_rep     := coalesce(v_doc.sales_rep, v_cust.sales_rep);
  elsif v_doc.vendor_id is not null then
    select * into v_vend from erp_vendors where id = v_doc.vendor_id;
    v_doc.party_name    := coalesce(v_doc.party_name, v_vend.name);
    v_doc.party_tax_id  := coalesce(v_doc.party_tax_id, v_vend.tax_id);
    v_doc.party_contact := coalesce(v_doc.party_contact, v_vend.contact_person);
    v_doc.party_phone   := coalesce(v_doc.party_phone, v_vend.phone);
    v_doc.party_address := coalesce(v_doc.party_address, v_vend.address);
  end if;

  update erp_documents
     set doc_no = v_doc_no,
         status = 'posted',
         posted_at = now(),
         posted_by = auth.uid(),
         amount_untaxed = v_tax.amount_untaxed,
         tax_amount = v_tax.tax_amount,
         total_amount = v_tax.total_amount,
         total_twd = v_tax.total_twd,
         party_name = v_doc.party_name,
         party_tax_id = v_doc.party_tax_id,
         party_contact = v_doc.party_contact,
         party_phone = v_doc.party_phone,
         party_address = v_doc.party_address,
         sales_rep = v_doc.sales_rep
   where id = p_doc_id;

  -- 6. 庫存／成本／序號（§5.2）
  if v_doc.doc_type in ('I','PR','S','SR','T','A') then
    for v_line in
      select l.*
      from erp_document_lines l
      join erp_items i on i.id = l.item_id
      where l.document_id = p_doc_id and l.line_type = 'item' and i.track_stock
      order by l.line_no
    loop
      select * into v_item from erp_items where id = v_line.item_id for update;
      select coalesce(sum(qty), 0) into v_q0 from erp_stock_levels where item_id = v_item.id;
      v_c0 := v_item.avg_cost;

      if v_doc.doc_type = 'I' then
        -- in_cost：折扣依行金額比例分攤（決策 2）
        v_amt := v_line.amount;
        if v_item_sum <> 0 then
          v_amt := v_amt + v_disc_sum * v_line.amount / v_item_sum;
        end if;
        v_cost := round(v_amt / v_line.qty * v_doc.exchange_rate, 4);

        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_in(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'SR' then
        v_cost := v_c0;
        if v_line.source_line_id is not null then
          select coalesce(unit_cost, v_c0) into v_cost from erp_document_lines where id = v_line.source_line_id;
        end if;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_in(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'PR' then
        v_cost := v_c0;
        if v_line.source_line_id is not null then
          select coalesce(unit_cost, v_c0) into v_cost from erp_document_lines where id = v_line.source_line_id;
        end if;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_out(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'S' then
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'T' then
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        perform erp_stock_apply(v_item.id, v_doc.to_warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'A' then
        -- 盤盈／盤虧皆以 C0 入出帳，avg 不變
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;
      end if;

      if not v_item.track_serial then
        continue;
      end if;

      -- 序號效果
      if v_doc.doc_type = 'I' or (v_doc.doc_type = 'A' and v_line.qty > 0) then
        foreach v_sn in array v_line.serial_nos loop
          v_sn := btrim(v_sn);
          if exists (select 1 from erp_serials
                     where item_id = v_item.id and lower(btrim(serial_no)) = lower(v_sn)) then
            perform erp_raise('serial_unavailable', format('品項 %s 機號 %s 已存在', v_item.code, v_sn));
          end if;
          insert into erp_serials (item_id, serial_no, status, warehouse_id, unit_cost, in_doc_id)
          values (v_item.id, v_sn, 'in_stock', v_doc.warehouse_id, v_cost, p_doc_id)
          returning id into v_serial_id;
          insert into erp_document_line_serials (line_id, serial_id) values (v_line.id, v_serial_id);
        end loop;
      else
        for v_ser in
          select s.* from erp_document_line_serials ls
          join erp_serials s on s.id = ls.serial_id
          where ls.line_id = v_line.id
          order by s.serial_no
          for update of s
        loop
          if v_ser.item_id <> v_item.id then
            perform erp_raise('serial_unavailable', format('機號 %s 不屬於品項 %s', v_ser.serial_no, v_item.code));
          end if;

          if v_doc.doc_type = 'SR' then
            if v_ser.status <> 'sold' or v_ser.customer_id is distinct from v_doc.customer_id then
              perform erp_raise('serial_unavailable', format('機號 %s 不是售予此客戶的機台', v_ser.serial_no));
            end if;
            update erp_serials
               set status = 'in_stock', warehouse_id = v_doc.warehouse_id, customer_id = null
             where id = v_ser.id;
          else
            -- S / PR / T / A 盤虧：須 in_stock 且在出庫倉
            if v_ser.status <> 'in_stock' or v_ser.warehouse_id is distinct from v_doc.warehouse_id then
              perform erp_raise('serial_unavailable', format('機號 %s 不在此倉庫存中', v_ser.serial_no));
            end if;

            if v_doc.doc_type = 'PR' then
              update erp_serials
                 set status = 'returned_to_vendor', warehouse_id = null, out_doc_id = p_doc_id
               where id = v_ser.id;
            elsif v_doc.doc_type = 'T' then
              update erp_serials set warehouse_id = v_doc.to_warehouse_id where id = v_ser.id;
            elsif v_doc.doc_type = 'A' then
              update erp_serials
                 set status = 'written_off', warehouse_id = null, out_doc_id = p_doc_id
               where id = v_ser.id;
            elsif v_doc.doc_type = 'S' then
              update erp_serials
                 set status = 'sold', warehouse_id = null, customer_id = v_doc.customer_id, out_doc_id = p_doc_id
               where id = v_ser.id;

              -- 保養卡機台：同客戶 + 卡別 + 機號的未封存機台直接連結，否則建立
              if v_item.mx_card_type is not null then
                v_machine_id := null;
                select m.id into v_machine_id
                  from mx_machines m
                 where m.customer_id = v_doc.customer_id
                   and m.card_type = v_item.mx_card_type
                   and m.archived_at is null
                   and m.serial_no is not null
                   and lower(btrim(m.serial_no)) = lower(btrim(v_ser.serial_no))
                 order by (m.machine_no is null or btrim(m.machine_no) = '') desc, m.created_at
                 limit 1;

                if v_machine_id is not null then
                  v_created := false;
                  v_warnings := v_warnings || format('機號 %s 已有保養卡機台，已直接連結', v_ser.serial_no);
                else
                  insert into mx_machines (customer_id, card_type, serial_no, model, purchased_at)
                  values (v_doc.customer_id, v_item.mx_card_type, btrim(v_ser.serial_no),
                          coalesce(v_item.model, v_item.name), v_doc.doc_date)
                  returning id into v_machine_id;
                  v_created := true;
                end if;

                update erp_serials set mx_machine_id = v_machine_id where id = v_ser.id;
                update erp_document_line_serials
                   set mx_machine_id = v_machine_id, mx_machine_created = v_created
                 where line_id = v_line.id and serial_id = v_ser.id;
                v_machines := v_machines || v_machine_id;
              end if;
            end if;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'doc_no', v_doc_no,
    'warnings', to_jsonb(v_warnings),
    'mx_machine_ids', to_jsonb(v_machines)
  );
end;
$$;

-- ============================================================
-- 12) 作廢（§5.3）
-- ============================================================
create or replace function erp_void_document(p_doc_id uuid, p_reason text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_doc      erp_documents%rowtype;
  v_item     erp_items%rowtype;
  v_ser      erp_serials%rowtype;
  v_ls       record;
  v_m        record;
  v_q0       numeric;
  v_rev      numeric;
  v_warnings text[] := '{}';
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    perform erp_raise('validation', '作廢需填寫原因');
  end if;

  select * into v_doc from erp_documents where id = p_doc_id for update;
  if not found then
    perform erp_raise('validation', '找不到單據');
  end if;
  if v_doc.status <> 'posted' then
    perform erp_raise('not_posted', format('單據狀態為 %s，只能作廢已過帳單據', v_doc.status));
  end if;

  -- 相依檢查
  if v_doc.doc_type = 'P' and exists (
       select 1 from erp_documents d
        where d.status = 'posted' and d.doc_type = 'I'
          and (d.source_doc_id = p_doc_id
               or exists (select 1 from erp_document_lines l
                          join erp_document_lines pl on pl.id = l.source_line_id
                          where l.document_id = d.id and pl.document_id = p_doc_id))) then
    perform erp_raise('has_dependents', '已有進貨單引用此採購單，請先作廢進貨單');
  end if;

  if v_doc.doc_type in ('S','SR','I','PR') and exists (
       select 1 from erp_payment_allocations a
       join erp_payments p on p.id = a.payment_id
       where a.document_id = p_doc_id and p.status = 'posted') then
    perform erp_raise('has_dependents', '此單據已有收付款沖銷，請先作廢或調整收付款');
  end if;

  if v_doc.doc_type in ('S','I') and exists (
       select 1 from erp_documents d
        where d.status = 'posted'
          and d.doc_type = case v_doc.doc_type when 'S' then 'SR' else 'PR' end
          and (d.source_doc_id = p_doc_id
               or exists (select 1 from erp_document_lines l
                          join erp_document_lines sl on sl.id = l.source_line_id
                          where l.document_id = d.id and sl.document_id = p_doc_id))) then
    perform erp_raise('has_dependents',
      case v_doc.doc_type when 'S' then '已有銷退單引用此銷貨單，請先作廢銷退單'
                          else '已有進退單引用此進貨單，請先作廢進退單' end);
  end if;

  -- 序號回復
  if v_doc.doc_type in ('I','A') then
    -- 由本單建立的機號：必須仍 in_stock、在原倉、且未被其他單據引用 → 刪除
    for v_ser in select * from erp_serials where in_doc_id = p_doc_id for update loop
      if v_ser.status <> 'in_stock'
         or v_ser.warehouse_id is distinct from v_doc.warehouse_id
         or exists (select 1 from erp_document_line_serials ls
                    join erp_document_lines l on l.id = ls.line_id
                    where ls.serial_id = v_ser.id and l.document_id <> p_doc_id) then
        perform erp_raise('serial_unavailable',
          format('機號 %s 已出庫、移倉或被其他單據使用，無法作廢', v_ser.serial_no));
      end if;
    end loop;
  end if;

  if v_doc.doc_type = 'A' then
    -- 盤虧的機號：written_off → in_stock
    for v_ser in
      select s.* from erp_serials s
      join erp_document_line_serials ls on ls.serial_id = s.id
      join erp_document_lines l on l.id = ls.line_id
      where l.document_id = p_doc_id and l.qty < 0
      for update of s
    loop
      if v_ser.status <> 'written_off' or v_ser.out_doc_id is distinct from p_doc_id then
        perform erp_raise('serial_unavailable', format('機號 %s 狀態已變更，無法作廢', v_ser.serial_no));
      end if;
      update erp_serials
         set status = 'in_stock', warehouse_id = v_doc.warehouse_id, out_doc_id = null
       where id = v_ser.id;
    end loop;
  end if;

  if v_doc.doc_type in ('I','A') then
    delete from erp_document_line_serials ls
     using erp_serials s
     where s.id = ls.serial_id and s.in_doc_id = p_doc_id;
    delete from erp_serials where in_doc_id = p_doc_id;
  end if;

  if v_doc.doc_type in ('S','SR','PR','T') then
    for v_ls in
      select ls.line_id, ls.serial_id, ls.mx_machine_id, ls.mx_machine_created
      from erp_document_line_serials ls
      join erp_document_lines l on l.id = ls.line_id
      where l.document_id = p_doc_id
    loop
      select * into v_ser from erp_serials where id = v_ls.serial_id for update;

      if v_doc.doc_type = 'S' then
        if v_ser.status <> 'sold' or v_ser.out_doc_id is distinct from p_doc_id then
          perform erp_raise('serial_unavailable', format('機號 %s 狀態已變更，無法作廢', v_ser.serial_no));
        end if;
        update erp_serials
           set status = 'in_stock', warehouse_id = v_doc.warehouse_id, customer_id = null,
               out_doc_id = null, mx_machine_id = null
         where id = v_ser.id;

        if v_ls.mx_machine_id is not null and v_ls.mx_machine_created then
          if erp_machine_has_records(v_ls.mx_machine_id) then
            v_warnings := v_warnings
              || format('機號 %s 的保養卡機台已有保養紀錄，保留機台僅解除連結', v_ser.serial_no);
          else
            delete from mx_machines where id = v_ls.mx_machine_id;
          end if;
        end if;

      elsif v_doc.doc_type = 'SR' then
        if v_ser.status <> 'in_stock' or v_ser.warehouse_id is distinct from v_doc.warehouse_id then
          perform erp_raise('serial_unavailable', format('機號 %s 已不在此倉庫存中，無法作廢', v_ser.serial_no));
        end if;
        update erp_serials
           set status = 'sold', warehouse_id = null, customer_id = v_doc.customer_id
         where id = v_ser.id;

      elsif v_doc.doc_type = 'PR' then
        if v_ser.status <> 'returned_to_vendor' or v_ser.out_doc_id is distinct from p_doc_id then
          perform erp_raise('serial_unavailable', format('機號 %s 狀態已變更，無法作廢', v_ser.serial_no));
        end if;
        update erp_serials
           set status = 'in_stock', warehouse_id = v_doc.warehouse_id, out_doc_id = null
         where id = v_ser.id;

      elsif v_doc.doc_type = 'T' then
        if v_ser.status <> 'in_stock' or v_ser.warehouse_id is distinct from v_doc.to_warehouse_id then
          perform erp_raise('serial_unavailable', format('機號 %s 已不在目的倉，無法作廢', v_ser.serial_no));
        end if;
        update erp_serials set warehouse_id = v_doc.warehouse_id where id = v_ser.id;
      end if;
    end loop;
  end if;

  -- 庫存反向 + 成本回推（近似法，決策見 spec §5.3）
  for v_m in
    select m.* from erp_stock_moves m
    where m.document_id = p_doc_id and not m.is_reversal
    order by m.moved_at, m.qty
  loop
    v_rev := -v_m.qty;
    if v_doc.doc_type in ('I','PR','S','SR') then
      select * into v_item from erp_items where id = v_m.item_id for update;
      select coalesce(sum(qty), 0) into v_q0 from erp_stock_levels where item_id = v_m.item_id;
      update erp_items
         set avg_cost = case when v_rev > 0
                             then erp_avg_in(v_q0, v_item.avg_cost, v_rev, v_m.unit_cost)
                             else erp_avg_out(v_q0, v_item.avg_cost, -v_rev, v_m.unit_cost) end
       where id = v_m.item_id;
    end if;
    perform erp_stock_apply(v_m.item_id, v_m.warehouse_id, v_rev, v_m.unit_cost,
                            p_doc_id, v_m.line_id, current_date, true);
  end loop;

  update erp_documents
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_doc_id;

  return jsonb_build_object('warnings', to_jsonb(v_warnings));
end;
$$;

-- ============================================================
-- 13) 收付款（§5.4）
-- ============================================================
create or replace function erp_allocate_payment(p_payment_id uuid, p_allocations jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pay   erp_payments%rowtype;
  v_doc   erp_documents%rowtype;
  v_a     record;
  v_total numeric;
  v_alloc numeric;
  v_new   numeric;
  v_sum   numeric;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;

  select * into v_pay from erp_payments where id = p_payment_id for update;
  if not found then
    perform erp_raise('validation', '找不到收付款');
  end if;
  if v_pay.status <> 'posted' then
    perform erp_raise('not_posted', '收付款已作廢');
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    perform erp_raise('validation', '沖銷明細格式錯誤');
  end if;

  for v_a in
    select * from jsonb_to_recordset(p_allocations) as x(document_id uuid, amount numeric)
  loop
    if v_a.document_id is null or v_a.amount is null or v_a.amount = 0 then
      perform erp_raise('validation', '沖銷明細需指定單據與非 0 金額');
    end if;

    select * into v_doc from erp_documents where id = v_a.document_id for update;
    if not found then
      perform erp_raise('validation', '找不到沖銷單據');
    end if;
    if v_doc.status <> 'posted' then
      perform erp_raise('not_posted', format('單據 %s 未過帳或已作廢', coalesce(v_doc.doc_no, '(草稿)')));
    end if;
    if v_pay.direction = 'in'
       and (v_doc.doc_type not in ('S','SR') or v_doc.customer_id is distinct from v_pay.customer_id) then
      perform erp_raise('validation', format('單據 %s 不是此客戶的銷貨／銷退單', v_doc.doc_no));
    end if;
    if v_pay.direction = 'out'
       and (v_doc.doc_type not in ('I','PR') or v_doc.vendor_id is distinct from v_pay.vendor_id) then
      perform erp_raise('validation', format('單據 %s 不是此廠商的進貨／進退單', v_doc.doc_no));
    end if;

    v_total := case when v_doc.doc_type in ('SR','PR') then -v_doc.total_twd else v_doc.total_twd end;
    select coalesce(sum(a.amount), 0) into v_alloc
      from erp_payment_allocations a join erp_payments p on p.id = a.payment_id
     where a.document_id = v_doc.id and p.status = 'posted';
    v_new := v_total - v_alloc - v_a.amount;

    if (v_total >= 0 and (v_new < 0 or v_new > v_total))
       or (v_total < 0 and (v_new > 0 or v_new < v_total)) then
      perform erp_raise('over_allocation',
        format('單據 %s 未沖餘額 %s，沖銷 %s 會超沖', v_doc.doc_no, v_total - v_alloc, v_a.amount));
    end if;

    insert into erp_payment_allocations (payment_id, document_id, amount)
    values (p_payment_id, v_doc.id, v_a.amount);
  end loop;

  select coalesce(sum(amount), 0) into v_sum from erp_payment_allocations where payment_id = p_payment_id;
  if v_sum > v_pay.amount or v_sum < 0 then
    perform erp_raise('over_allocation',
      format('沖銷合計 %s 超過收付款金額 %s', v_sum, v_pay.amount));
  end if;
end;
$$;

create or replace function erp_post_payment(p_payment jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dir      text;
  v_date     date;
  v_method   text;
  v_amount   numeric;
  v_customer uuid;
  v_vendor   uuid;
  v_check_no text;
  v_due      date;
  v_status   text;
  v_id       uuid;
  v_doc_no   text;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    perform erp_raise('validation', '收付款資料格式錯誤');
  end if;

  begin
    v_dir      := p_payment->>'direction';
    v_date     := nullif(p_payment->>'pay_date', '')::date;
    v_method   := p_payment->>'method';
    v_amount   := nullif(p_payment->>'amount', '')::numeric;
    v_customer := nullif(p_payment->>'customer_id', '')::uuid;
    v_vendor   := nullif(p_payment->>'vendor_id', '')::uuid;
    v_check_no := nullif(btrim(p_payment->>'check_no'), '');
    v_due      := nullif(p_payment->>'check_due_date', '')::date;
    v_status   := nullif(p_payment->>'check_status', '');
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform erp_raise('validation', '收付款欄位格式錯誤');
  end;

  if v_dir is null or v_dir not in ('in','out') then
    perform erp_raise('validation', '收付款方向需為 in 或 out');
  end if;
  if v_date is null then
    perform erp_raise('validation', '請填寫收付款日期');
  end if;
  if v_method is null or v_method not in ('cash','transfer','check','other') then
    perform erp_raise('validation', '付款方式不正確');
  end if;
  if v_amount is null or v_amount <= 0 then
    perform erp_raise('validation', '金額需大於 0');
  end if;
  if v_dir = 'in' and (v_customer is null or v_vendor is not null) then
    perform erp_raise('validation', '收款需指定客戶');
  end if;
  if v_dir = 'out' and (v_vendor is null or v_customer is not null) then
    perform erp_raise('validation', '付款需指定廠商');
  end if;
  if v_method = 'check' and (v_check_no is null or v_due is null) then
    perform erp_raise('validation', '支票需填寫票號與票期');
  end if;
  if v_status is not null and v_status not in ('pending','cleared','bounced') then
    perform erp_raise('validation', '支票狀態不正確');
  end if;
  if v_method = 'check' and v_status is null then
    v_status := 'pending';
  end if;

  v_doc_no := erp_next_doc_no(case v_dir when 'in' then 'RC' else 'PM' end, v_date);

  insert into erp_payments (direction, doc_no, pay_date, customer_id, vendor_id, method, amount,
                            check_no, check_due_date, bank, check_status, note)
  values (v_dir, v_doc_no, v_date, v_customer, v_vendor, v_method, v_amount,
          v_check_no, v_due, nullif(btrim(p_payment->>'bank'), ''), v_status,
          nullif(btrim(p_payment->>'note'), ''))
  returning id into v_id;

  if p_payment ? 'allocations' and jsonb_typeof(p_payment->'allocations') = 'array'
     and jsonb_array_length(p_payment->'allocations') > 0 then
    perform erp_allocate_payment(v_id, p_payment->'allocations');
  end if;

  return jsonb_build_object('id', v_id, 'doc_no', v_doc_no);
end;
$$;

create or replace function erp_void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pay erp_payments%rowtype;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    perform erp_raise('validation', '作廢需填寫原因');
  end if;

  select * into v_pay from erp_payments where id = p_payment_id for update;
  if not found then
    perform erp_raise('validation', '找不到收付款');
  end if;
  if v_pay.status <> 'posted' then
    perform erp_raise('not_posted', '收付款已作廢');
  end if;

  delete from erp_payment_allocations where payment_id = p_payment_id;
  update erp_payments
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_payment_id;
end;
$$;

-- ============================================================
-- 14) 函式權限：僅 authenticated 可執行
-- ============================================================
revoke execute on function erp_raise(text, text) from public, anon;
revoke execute on function erp_calc_tax(numeric, text, numeric, text, numeric) from public, anon;
revoke execute on function erp_avg_in(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function erp_avg_out(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function erp_stock_apply(uuid, uuid, numeric, numeric, uuid, uuid, date, boolean) from public, anon;
revoke execute on function erp_machine_has_records(uuid) from public, anon;
revoke execute on function erp_next_doc_no(text, date) from public, anon;
revoke execute on function erp_post_document(uuid) from public, anon;
revoke execute on function erp_void_document(uuid, text) from public, anon;
revoke execute on function erp_allocate_payment(uuid, jsonb) from public, anon;
revoke execute on function erp_post_payment(jsonb) from public, anon;
revoke execute on function erp_void_payment(uuid, text) from public, anon;

grant execute on function erp_raise(text, text) to authenticated;
grant execute on function erp_calc_tax(numeric, text, numeric, text, numeric) to authenticated;
grant execute on function erp_avg_in(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function erp_avg_out(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function erp_stock_apply(uuid, uuid, numeric, numeric, uuid, uuid, date, boolean) to authenticated;
grant execute on function erp_machine_has_records(uuid) to authenticated;
grant execute on function erp_next_doc_no(text, date) to authenticated;
grant execute on function erp_post_document(uuid) to authenticated;
grant execute on function erp_void_document(uuid, text) to authenticated;
grant execute on function erp_allocate_payment(uuid, jsonb) to authenticated;
grant execute on function erp_post_payment(jsonb) to authenticated;
grant execute on function erp_void_payment(uuid, text) to authenticated;

-- ============================================================
-- 15) Views（security_invoker：沿用呼叫者的 RLS）
-- ============================================================

-- 已過帳 S/SR/I/PR 的應收應付餘額；SR/PR 的 total_twd 為負值
create or replace view erp_document_balances
with (security_invoker = true) as
select d.id as document_id,
       d.doc_type,
       d.doc_no,
       d.doc_date,
       d.customer_id,
       d.vendor_id,
       case when d.doc_type in ('SR','PR') then -d.total_twd else d.total_twd end as total_twd,
       coalesce(a.allocated, 0) as allocated,
       case when d.doc_type in ('SR','PR') then -d.total_twd else d.total_twd end
         - coalesce(a.allocated, 0) as outstanding
from erp_documents d
left join (
  select pa.document_id, sum(pa.amount) as allocated
  from erp_payment_allocations pa
  join erp_payments p on p.id = pa.payment_id and p.status = 'posted'
  group by pa.document_id
) a on a.document_id = d.id
where d.status = 'posted' and d.doc_type in ('S','SR','I','PR');

-- 客戶／廠商：應收（付）餘額 = Σ 單據 outstanding；unallocated = 未沖銷預收（付）
create or replace view erp_party_balances
with (security_invoker = true) as
with docs as (
  select case when b.doc_type in ('S','SR') then 'customer' else 'vendor' end as party_type,
         coalesce(b.customer_id, b.vendor_id) as party_id,
         sum(b.outstanding) as balance
  from erp_document_balances b
  group by 1, 2
),
pays as (
  select case when p.direction = 'in' then 'customer' else 'vendor' end as party_type,
         coalesce(p.customer_id, p.vendor_id) as party_id,
         sum(p.amount - coalesce(a.allocated, 0)) as unallocated
  from erp_payments p
  left join (
    select payment_id, sum(amount) as allocated
    from erp_payment_allocations group by payment_id
  ) a on a.payment_id = p.id
  where p.status = 'posted'
  group by 1, 2
)
select coalesce(d.party_type, p.party_type) as party_type,
       coalesce(d.party_id, p.party_id) as party_id,
       coalesce(d.balance, 0) as balance,
       coalesce(p.unallocated, 0) as unallocated
from docs d
full outer join pays p on p.party_type = d.party_type and p.party_id = d.party_id;

-- 採購行到貨進度：已到貨量 = Σ 已過帳進貨行（source_line_id 指向該採購行）
create or replace view erp_purchase_line_progress
with (security_invoker = true) as
select l.id as line_id,
       l.document_id,
       l.item_id,
       l.qty,
       coalesce(r.received_qty, 0) as received_qty,
       greatest(l.qty - coalesce(r.received_qty, 0), 0) as remaining_qty
from erp_document_lines l
join erp_documents d on d.id = l.document_id
left join (
  select il.source_line_id, sum(il.qty) as received_qty
  from erp_document_lines il
  join erp_documents idoc on idoc.id = il.document_id
  where idoc.doc_type = 'I' and idoc.status = 'posted' and il.line_type = 'item'
  group by il.source_line_id
) r on r.source_line_id = l.id
where d.doc_type = 'P' and d.status = 'posted' and l.line_type = 'item';

-- 採購單狀態：open 未到貨 / partial 部分到貨 / closed 已結案
create or replace view erp_purchase_progress
with (security_invoker = true) as
select d.id as document_id,
       case
         when coalesce(bool_and(p.remaining_qty = 0), true) then 'closed'
         when coalesce(sum(p.received_qty), 0) > 0 then 'partial'
         else 'open'
       end as status
from erp_documents d
left join erp_purchase_line_progress p on p.document_id = d.id
where d.doc_type = 'P' and d.status = 'posted'
group by d.id;

revoke all on erp_document_balances, erp_party_balances,
              erp_purchase_line_progress, erp_purchase_progress from anon;
grant select on erp_document_balances, erp_party_balances,
                erp_purchase_line_progress, erp_purchase_progress to authenticated;
