-- party_activity_test.sql
-- 客戶／廠商「相關單據」RPC erp_party_activity（issue #267，0036）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、TEST-*）。
--
-- 涵蓋：排序（日期 desc、建立時間 desc、id desc）、分頁 total（含超出頁數仍回 total）、單別篩選（含收付款類別）、
--       作廢預設隱藏／可顯示、客戶與廠商各類型皆出現（Q/S/SR/RC 含沖抵/RF；P/I/PR/PM 含沖抵/VR）、
--       未沖餘額與未沖銷（預收）計算、不混入其他對象、無 erp 權限看不到（RLS，security invoker）、
--       anon 不可執行、參數驗證（對象類型、不屬於該對象的單別）、limit 上下限、函式屬性（invoker + stable）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分，直接寫入；guard trigger 對非 API 角色放行）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'erp-activity@example.invalid'),
  ('00000000-0000-0000-0000-0000000004a2', 'noerp-activity@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'erp',   'erp-activity@example.invalid'),
  ('00000000-0000-0000-0000-0000000004a2', 'admin', 'noerp-activity@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000004a1', 'erp');

create schema pa_test;

create function pa_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code or sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, sqlerrm;
      return;
    end if;
    raise exception '預期 % 但得到 % (%): sql=%', p_code, sqlerrm, sqlstate, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

-- 取結果的 doc_no（草稿以 'draft:' || id 末四碼代替）陣列，方便比對順序
create function pa_test.keys(p jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(coalesce(r->>'doc_no', 'draft:' || right(r->>'id', 4)) order by ord), '{}')
    from jsonb_array_elements(p->'rows') with ordinality as t(r, ord);
$$;
create function pa_test.row_of(p jsonb, p_key text) returns jsonb language sql immutable as $$
  select r from jsonb_array_elements(p->'rows') r
   where coalesce(r->>'doc_no', 'draft:' || right(r->>'id', 4)) = p_key;
$$;
grant usage on schema pa_test to authenticated, anon;
grant execute on all functions in schema pa_test to authenticated, anon;

insert into mx_customers (id, name) values
  ('00000000-0000-0000-0000-0000000004c1', 'TEST-相關單據客戶'),
  ('00000000-0000-0000-0000-0000000004c2', 'TEST-其他客戶');
insert into erp_vendors (id, code, name) values
  ('00000000-0000-0000-0000-0000000004f1', 'TEST-V1', 'TEST-相關單據廠商');

-- 客戶 C1 的單據
insert into erp_documents (id, doc_type, doc_no, doc_date, status, customer_id, total_amount, total_twd, created_at) values
  ('00000000-0000-0000-0000-000000004a01', 'Q',  'Q11509001',  '2026-09-01', 'posted', '00000000-0000-0000-0000-0000000004c1', 1000, 1000, '2026-09-01 10:00+08'),
  -- 與 Q11509001 同日同建立時間：以 id desc 決定（a02 在前）
  ('00000000-0000-0000-0000-000000004a02', 'Q',  'Q11509002',  '2026-09-01', 'posted', '00000000-0000-0000-0000-0000000004c1', 1200, 1200, '2026-09-01 10:00+08'),
  ('00000000-0000-0000-0000-000000004a03', 'S',  'S11509001',  '2026-09-05', 'posted', '00000000-0000-0000-0000-0000000004c1', 5000, 5000, '2026-09-05 09:00+08'),
  -- 同日、較早建立的草稿排在 S11509001 之後（id 較大，用來確認排序先看建立時間、再看 id）
  ('00000000-0000-0000-0000-000000004a04', 'S',  null,         '2026-09-05', 'draft',  '00000000-0000-0000-0000-0000000004c1', 800,  800,  '2026-09-05 08:00+08'),
  ('00000000-0000-0000-0000-000000004a05', 'SR', 'SR11509001', '2026-09-10', 'posted', '00000000-0000-0000-0000-0000000004c1', 1000, 1000, '2026-09-10 09:00+08'),
  ('00000000-0000-0000-0000-000000004a06', 'S',  'S11509002',  '2026-09-12', 'voided', '00000000-0000-0000-0000-0000000004c1', 300,  300,  '2026-09-12 09:00+08'),
  -- 其他客戶：不可出現
  ('00000000-0000-0000-0000-000000004a07', 'S',  'S11509003',  '2026-09-30', 'posted', '00000000-0000-0000-0000-0000000004c2', 999,  999,  '2026-09-30 09:00+08');

-- 客戶 C1 的收付款：收款 RC1（沖 S1 2,000、被 RF1 退 500）、0 元沖抵單 RC2（沖 SR1 −1,000 → 預收 1,000）、退款 RF1、作廢收款 RC3
insert into erp_payments (id, direction, kind, doc_no, pay_date, customer_id, method, amount, status, created_at) values
  ('00000000-0000-0000-0000-000000004b01', 'in', 'payment', 'RC11509001', '2026-09-06', '00000000-0000-0000-0000-0000000004c1', 'transfer', 3000, 'posted', '2026-09-06 09:00+08'),
  ('00000000-0000-0000-0000-000000004b02', 'in', 'payment', 'RC11509002', '2026-09-11', '00000000-0000-0000-0000-0000000004c1', 'other',    0,    'posted', '2026-09-11 09:00+08'),
  ('00000000-0000-0000-0000-000000004b03', 'in', 'refund',  'RF11509001', '2026-09-15', '00000000-0000-0000-0000-0000000004c1', 'cash',     500,  'posted', '2026-09-15 09:00+08'),
  ('00000000-0000-0000-0000-000000004b04', 'in', 'payment', 'RC11509003', '2026-09-20', '00000000-0000-0000-0000-0000000004c1', 'cash',     100,  'voided', '2026-09-20 09:00+08');
insert into erp_payment_allocations (payment_id, document_id, amount) values
  ('00000000-0000-0000-0000-000000004b01', '00000000-0000-0000-0000-000000004a03', 2000),
  ('00000000-0000-0000-0000-000000004b02', '00000000-0000-0000-0000-000000004a05', -1000),
  -- 作廢收款殘留的沖銷（正常流程作廢即刪除；此處驗證與 erp_document_balances 一樣只計已過帳收付款）
  ('00000000-0000-0000-0000-000000004b04', '00000000-0000-0000-0000-000000004a03', 100);
insert into erp_refund_sources (refund_id, source_payment_id, amount) values
  ('00000000-0000-0000-0000-000000004b03', '00000000-0000-0000-0000-000000004b01', 500);

-- 廠商 V1：P、I（付款 PM1 沖 1,500）、PR（0 元沖抵單 PM2 沖 −200 → 預付 200）、廠商退款 VR1（退自 PM2 50）
insert into erp_documents (id, doc_type, doc_no, doc_date, status, vendor_id, total_amount, total_twd, created_at) values
  ('00000000-0000-0000-0000-000000004d01', 'P',  'P11509001',  '2026-09-02', 'posted', '00000000-0000-0000-0000-0000000004f1', 4000, 4000, '2026-09-02 09:00+08'),
  ('00000000-0000-0000-0000-000000004d02', 'I',  'I11509001',  '2026-09-03', 'posted', '00000000-0000-0000-0000-0000000004f1', 4000, 4000, '2026-09-03 09:00+08'),
  ('00000000-0000-0000-0000-000000004d03', 'PR', 'PR11509001', '2026-09-04', 'posted', '00000000-0000-0000-0000-0000000004f1', 200,  200,  '2026-09-04 09:00+08');
insert into erp_payments (id, direction, kind, doc_no, pay_date, vendor_id, method, amount, status, created_at) values
  ('00000000-0000-0000-0000-000000004e01', 'out', 'payment', 'PM11509001', '2026-09-07', '00000000-0000-0000-0000-0000000004f1', 'transfer', 1500, 'posted', '2026-09-07 09:00+08'),
  ('00000000-0000-0000-0000-000000004e02', 'out', 'payment', 'PM11509002', '2026-09-08', '00000000-0000-0000-0000-0000000004f1', 'other',    0,    'posted', '2026-09-08 09:00+08'),
  ('00000000-0000-0000-0000-000000004e03', 'out', 'refund',  'VR11509001', '2026-09-09', '00000000-0000-0000-0000-0000000004f1', 'transfer', 50,   'posted', '2026-09-09 09:00+08');
insert into erp_payment_allocations (payment_id, document_id, amount) values
  ('00000000-0000-0000-0000-000000004e01', '00000000-0000-0000-0000-000000004d02', 1500),
  ('00000000-0000-0000-0000-000000004e02', '00000000-0000-0000-0000-000000004d03', -200);
insert into erp_refund_sources (refund_id, source_payment_id, amount) values
  ('00000000-0000-0000-0000-000000004e03', '00000000-0000-0000-0000-000000004e02', 50);

-- 函式屬性：security invoker（沿用呼叫者 RLS）、stable
do $$ begin
  assert (select not prosecdef and provolatile = 's'
            from pg_proc where oid = 'public.erp_party_activity(text,uuid,text[],boolean,integer,integer)'::regprocedure),
         'erp_party_activity 應為 security invoker + stable';
end $$;

-- ============================================================
-- 1) 有 erp 權限的使用者
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}';

do $$
declare
  v jsonb;
  r jsonb;
begin
  -- 預設：不含作廢，新到舊
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1');
  assert (v->>'total')::int = 8, format('客戶預設 total 應為 8，得到 %s', v->>'total');
  assert pa_test.keys(v) = array['RF11509001','RC11509002','SR11509001','RC11509001','S11509001','draft:4a04','Q11509002','Q11509001'],
         format('客戶預設排序錯誤：%s', pa_test.keys(v));

  -- 含作廢
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, true);
  assert (v->>'total')::int = 10, '含作廢 total 應為 10';
  assert (pa_test.keys(v))[1:3] = array['RC11509003','RF11509001','S11509002'], format('含作廢排序錯誤：%s', pa_test.keys(v));
  assert pa_test.row_of(v, 'RC11509003')->>'status' = 'voided', '作廢收款 status = voided';
  assert pa_test.row_of(v, 'RC11509003')->'unallocated' = 'null'::jsonb, '作廢收款無未沖銷';
  assert pa_test.row_of(v, 'S11509002')->'outstanding' = 'null'::jsonb, '作廢銷貨無未沖餘額';

  -- 分頁：第 2 頁（每頁 3）＋ total 不變
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 3, 3);
  assert (v->>'total')::int = 8, '分頁 total 仍為全部筆數';
  assert pa_test.keys(v) = array['RC11509001','S11509001','draft:4a04'], format('第 2 頁錯誤：%s', pa_test.keys(v));
  -- 最後一頁不足一頁
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 3, 6);
  assert pa_test.keys(v) = array['Q11509002','Q11509001'], format('最後一頁錯誤：%s', pa_test.keys(v));
  -- 同日不同建立時間在頁邊界：建立時間 desc（S11509001 在草稿之前）
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 1, 4);
  assert pa_test.keys(v) = array['S11509001'], format('頁邊界第 5 筆：%s', pa_test.keys(v));
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 1, 5);
  assert pa_test.keys(v) = array['draft:4a04'], format('頁邊界第 6 筆：%s', pa_test.keys(v));
  -- 同日同建立時間的兩張報價在頁邊界：id desc 決定（每頁 1 筆時第 7、8 筆不重複不遺漏）
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 1, 6);
  assert pa_test.keys(v) = array['Q11509002'], format('頁邊界第 7 筆：%s', pa_test.keys(v));
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 1, 7);
  assert pa_test.keys(v) = array['Q11509001'], format('頁邊界第 8 筆：%s', pa_test.keys(v));
  -- 超出頁數：rows 空、total 仍回
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 3, 30);
  assert jsonb_array_length(v->'rows') = 0 and (v->>'total')::int = 8, '超出頁數應回空 rows 與 total';

  -- 篩選：單一單別
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', array['S']);
  assert (v->>'total')::int = 2 and pa_test.keys(v) = array['S11509001','draft:4a04'], format('篩 S 錯誤：%s', pa_test.keys(v));
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', array['S'], true);
  assert (v->>'total')::int = 3, '篩 S 含作廢應為 3';
  -- 篩選：收付款（收款含沖抵＋退款）
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', array['RC','RF']);
  assert pa_test.keys(v) = array['RF11509001','RC11509002','RC11509001'], format('篩收付款錯誤：%s', pa_test.keys(v));
  -- 空陣列 = 全部
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', '{}'::text[]);
  assert (v->>'total')::int = 8, '空陣列視為全部';

  -- 欄位值
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1');
  r := pa_test.row_of(v, 'S11509001');
  assert r->>'kind' = 'document' and r->>'doc_type' = 'S' and r->>'status' = 'posted', 'S1 kind/type/status';
  assert r->>'id' = '00000000-0000-0000-0000-000000004a03', 'S1 id';
  assert r->>'date' = '2026-09-05', 'S1 date';
  assert (r->>'amount_twd')::numeric = 5000 and (r->>'outstanding')::numeric = 3000, format('S1 金額／未沖：%s', r);
  assert r->'unallocated' = 'null'::jsonb, '單據無 unallocated';
  assert r->>'created_at' is not null, 'created_at';
  r := pa_test.row_of(v, 'SR11509001');
  assert (r->>'amount_twd')::numeric = 1000 and (r->>'outstanding')::numeric = 0, format('SR1：%s', r);
  r := pa_test.row_of(v, 'draft:4a04');
  assert r->>'status' = 'draft' and r->'doc_no' = 'null'::jsonb and r->'outstanding' = 'null'::jsonb, format('草稿：%s', r);
  r := pa_test.row_of(v, 'Q11509001');
  assert r->>'doc_type' = 'Q' and r->'outstanding' = 'null'::jsonb, '報價無未沖餘額';
  r := pa_test.row_of(v, 'RC11509001');
  assert r->>'kind' = 'payment' and r->>'doc_type' = 'RC' and (r->>'amount_twd')::numeric = 3000
         and (r->>'unallocated')::numeric = 500 and r->'outstanding' = 'null'::jsonb, format('RC1：%s', r);
  r := pa_test.row_of(v, 'RC11509002');
  assert r->>'doc_type' = 'RC' and (r->>'amount_twd')::numeric = 0 and (r->>'unallocated')::numeric = 1000, format('沖抵單：%s', r);
  r := pa_test.row_of(v, 'RF11509001');
  assert r->>'doc_type' = 'RF' and (r->>'amount_twd')::numeric = 500 and r->'unallocated' = 'null'::jsonb, format('RF1：%s', r);

  -- 與既有 view 一致：每張已過帳 S/SR 的 outstanding = erp_document_balances；Σ RC 未沖銷 = erp_party_balances.unallocated
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, true, 100, 0);
  assert not exists (
    select 1 from jsonb_array_elements(v->'rows') e
      join erp_document_balances b on b.document_id = (e->>'id')::uuid
     where (e->>'outstanding')::numeric is distinct from b.outstanding), '未沖餘額應等於 erp_document_balances';
  assert (select count(*) from jsonb_array_elements(v->'rows') e where e->'outstanding' <> 'null'::jsonb)
         = (select count(*) from erp_document_balances where customer_id = '00000000-0000-0000-0000-0000000004c1'),
         '有未沖餘額的列 = erp_document_balances 的列';
  assert (select sum((e->>'unallocated')::numeric) from jsonb_array_elements(v->'rows') e)
         = (select unallocated from erp_party_balances
             where party_type = 'customer' and party_id = '00000000-0000-0000-0000-0000000004c1'),
         'Σ 未沖銷應等於 erp_party_balances.unallocated';

  -- 其他客戶只看到自己的單
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c2');
  assert pa_test.keys(v) = array['S11509003'], format('其他客戶：%s', pa_test.keys(v));

  -- 廠商：各類型皆出現
  v := erp_party_activity('vendor', '00000000-0000-0000-0000-0000000004f1');
  assert (v->>'total')::int = 6, '廠商 total 應為 6';
  assert pa_test.keys(v) = array['VR11509001','PM11509002','PM11509001','PR11509001','I11509001','P11509001'],
         format('廠商排序錯誤：%s', pa_test.keys(v));
  assert (select array_agg(distinct e->>'doc_type' order by e->>'doc_type') from jsonb_array_elements(v->'rows') e)
         = array['I','P','PM','PR','VR'], '廠商各單別';
  r := pa_test.row_of(v, 'I11509001');
  assert (r->>'outstanding')::numeric = 2500, format('I1 未沖：%s', r);
  r := pa_test.row_of(v, 'PR11509001');
  assert (r->>'outstanding')::numeric = 0, format('PR1 未沖：%s', r);
  r := pa_test.row_of(v, 'PM11509001');
  assert (r->>'unallocated')::numeric = 0, format('PM1 未沖銷：%s', r);
  r := pa_test.row_of(v, 'PM11509002');
  assert (r->>'unallocated')::numeric = 150 and (r->>'amount_twd')::numeric = 0, format('PM2 沖抵：%s', r);
  r := pa_test.row_of(v, 'VR11509001');
  assert r->>'doc_type' = 'VR' and r->'unallocated' = 'null'::jsonb, format('VR1：%s', r);
  r := pa_test.row_of(v, 'P11509001');
  assert r->'outstanding' = 'null'::jsonb, '採購單無未沖餘額';
  v := erp_party_activity('vendor', '00000000-0000-0000-0000-0000000004f1', array['PM','VR']);
  assert pa_test.keys(v) = array['VR11509001','PM11509002','PM11509001'], '廠商篩收付款';

  -- 客戶 id 當廠商查：無資料
  v := erp_party_activity('vendor', '00000000-0000-0000-0000-0000000004c1');
  assert (v->>'total')::int = 0 and jsonb_array_length(v->'rows') = 0, '對象類型不符時無資料';

  -- limit：null → 20；超過上限 → 100；< 1 → 1；offset < 0 → 0
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, null, null);
  assert jsonb_array_length(v->'rows') = 8, 'limit null 用預設';
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, false, 0, -5);
  assert pa_test.keys(v) = array['RF11509001'], 'limit 0 → 1、offset 負數 → 0';
end $$;

-- 參數驗證
select pa_test.expect_error($q$select erp_party_activity('staff', '00000000-0000-0000-0000-0000000004c1')$q$, 'validation');
select pa_test.expect_error($q$select erp_party_activity(null, '00000000-0000-0000-0000-0000000004c1')$q$, 'validation');
select pa_test.expect_error($q$select erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', array['P'])$q$, 'validation');
select pa_test.expect_error($q$select erp_party_activity('vendor', '00000000-0000-0000-0000-0000000004f1', array['RC'])$q$, 'validation');

-- ============================================================
-- 2) 無 erp 權限：RLS 擋下，看不到任何列
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000004a2","role":"authenticated"}';
do $$
declare
  v jsonb;
begin
  v := erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1', null, true);
  assert (v->>'total')::int = 0 and jsonb_array_length(v->'rows') = 0, '無 erp 權限應看不到任何單據';
  v := erp_party_activity('vendor', '00000000-0000-0000-0000-0000000004f1', null, true);
  assert (v->>'total')::int = 0, '無 erp 權限應看不到廠商單據';
end $$;

-- anon 不可執行
set local role anon;
select pa_test.expect_error($q$select erp_party_activity('customer', '00000000-0000-0000-0000-0000000004c1')$q$, '42501');

reset role;

do $$ begin raise notice '==== party_activity_test：全部斷言通過 ===='; end $$;

rollback;
