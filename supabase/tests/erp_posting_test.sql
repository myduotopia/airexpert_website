-- erp_posting_test.sql
-- ERP 過帳引擎 SQL 測試（issue #172，spec §10）。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。
-- 正式 DB 執行前需使用者確認。
--
-- 模擬方式：set local role authenticated + request.jwt.claims（sub = 測試使用者 id）。
-- 斷言：DO block 內 assert；預期錯誤以 erp_test.expect_error(sql, code) 檢查
--       （code 比對 SQLERRM，或比對 SQLSTATE，如權限不足 42501）。

\set ON_ERROR_STOP 1
-- 隱藏 select 結果列（NOTICE 走 stderr 仍會顯示）
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（以 postgres 身分建立；rollback 後消失）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'office@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000002', 'admin@airexpert.com.tw');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-000000000001', 'office', 'office@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000002', 'admin',  'admin@airexpert.com.tw');

-- 重跑 migration 的 seed 語句，驗證只授權 office 帳號
insert into admin_module_grants (user_id, module)
select id, 'erp' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;

do $$ begin
  assert (select count(*) from admin_module_grants) = 1, 'seed 應只授權 1 個帳號';
  assert (select count(*) from erp_warehouses where code = 'MAIN' and is_default) = 1, '應有 MAIN 總倉 seed';
end $$;

create schema erp_test;

create function erp_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code then
      if coalesce(v_detail, '') = '' then
        raise exception 'error % 缺少中文 detail：%', p_code, p_sql;
      end if;
      raise notice 'ok  [%] %', p_code, v_detail;
      return;
    elsif sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, sqlerrm;
      return;
    end if;
    raise exception '預期 % 但得到 % (%): % / sql=%', p_code, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

create function erp_test.qty(p_item uuid, p_wh uuid) returns numeric language sql as $$
  select coalesce((select qty from erp_stock_levels where item_id = p_item and warehouse_id = p_wh), 0);
$$;
create function erp_test.main() returns uuid language sql as $$
  select id from erp_warehouses where code = 'MAIN';
$$;
create function erp_test.avg(p_item uuid) returns numeric language sql as $$
  select avg_cost from erp_items where id = p_item;
$$;
create function erp_test.serial(p_no text) returns erp_serials language sql as $$
  select * from erp_serials where serial_no = p_no;
$$;

-- 收付款帳務不變式（#249 review）：對象 p_type（customer／vendor）p_id
--   1. erp_party_balances.balance = Σ erp_document_balances.outstanding
--   2. balance − unallocated（淨額）= 對帳單全期期末 = Σ 單據（SR／PR 為負）− Σ 收付款 + Σ 退款
--   3. Σ 有效退款金額 = Σ 其退款來源；4. 每張單據 outstanding 在 [0, total] 或 [total, 0]
--   5. 每張有效收付款 unallocated（金額 − 沖銷 − 被退款）≥ 0；6. 作廢收付款不留沖銷／退款來源
create function erp_test.assert_ledger(p_type text, p_id uuid, p_label text) returns void language plpgsql as $$
declare
  v_dir text := case p_type when 'customer' then 'in' else 'out' end;
  v_bal numeric; v_unalloc numeric; v_out numeric; v_docs numeric; v_pay numeric; v_ref numeric; v_src numeric; v_bad int;
begin
  select coalesce(sum(balance), 0), coalesce(sum(unallocated), 0) into v_bal, v_unalloc
    from erp_party_balances where party_type = p_type and party_id = p_id;
  select coalesce(sum(outstanding), 0) into v_out
    from erp_document_balances where coalesce(customer_id, vendor_id) = p_id
     and doc_type in (select unnest(case p_type when 'customer' then array['S','SR'] else array['I','PR'] end));
  select coalesce(sum(case when doc_type in ('SR','PR') then -total_twd else total_twd end), 0) into v_docs
    from erp_documents where coalesce(customer_id, vendor_id) = p_id and status = 'posted'
     and doc_type in (select unnest(case p_type when 'customer' then array['S','SR'] else array['I','PR'] end));
  select coalesce(sum(amount) filter (where kind = 'payment'), 0), coalesce(sum(amount) filter (where kind = 'refund'), 0)
    into v_pay, v_ref
    from erp_payments where coalesce(customer_id, vendor_id) = p_id and direction = v_dir and status = 'posted';
  select coalesce(sum(rs.amount), 0) into v_src
    from erp_refund_sources rs join erp_payments r on r.id = rs.refund_id
   where coalesce(r.customer_id, r.vendor_id) = p_id and r.direction = v_dir and r.status = 'posted';
  assert v_bal = v_out, format('%s：balance %s ≠ Σ outstanding %s', p_label, v_bal, v_out);
  assert v_bal - v_unalloc = v_docs - v_pay + v_ref,
    format('%s：淨額 %s − %s ≠ 對帳單期末 %s − %s + %s', p_label, v_bal, v_unalloc, v_docs, v_pay, v_ref);
  assert v_ref = v_src, format('%s：退款 %s ≠ 退款來源 %s', p_label, v_ref, v_src);
  select count(*) into v_bad from erp_document_balances
   where coalesce(customer_id, vendor_id) = p_id
     and ((total_twd >= 0 and (outstanding < 0 or outstanding > total_twd))
       or (total_twd < 0 and (outstanding > 0 or outstanding < total_twd)));
  assert v_bad = 0, format('%s：%s 張單據超沖', p_label, v_bad);
  select count(*) into v_bad from erp_payments p
   where coalesce(p.customer_id, p.vendor_id) = p_id and p.direction = v_dir and p.status = 'posted' and p.kind = 'payment'
     and p.amount - coalesce((select sum(a.amount) from erp_payment_allocations a where a.payment_id = p.id), 0)
         - coalesce((select sum(rs.amount) from erp_refund_sources rs where rs.source_payment_id = p.id), 0) < 0;
  assert v_bad = 0, format('%s：%s 張收付款 unallocated < 0', p_label, v_bad);
  select count(*) into v_bad from erp_payments p
   where coalesce(p.customer_id, p.vendor_id) = p_id and p.status = 'voided'
     and (exists (select 1 from erp_payment_allocations a where a.payment_id = p.id)
          or exists (select 1 from erp_refund_sources rs where rs.refund_id = p.id));
  assert v_bad = 0, format('%s：作廢收付款仍有沖銷／退款來源', p_label);
end $$;

-- 預期錯誤碼 p_code，且 detail 依序包含 p_like 每一段文字（#253 退款上限訊息）
create function erp_test.expect_detail(p_sql text, p_code text, p_like text[]) returns void language plpgsql as $$
declare
  v_detail text;
  v_part   text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm <> p_code then
      raise exception '預期 % 但得到 % (%): % / sql=%', p_code, sqlerrm, sqlstate, v_detail, p_sql;
    end if;
    foreach v_part in array p_like loop
      if position(v_part in coalesce(v_detail, '')) = 0 then
        raise exception '% 的訊息缺少「%」：% / sql=%', p_code, v_part, v_detail, p_sql;
      end if;
    end loop;
    raise notice 'ok  [%] %', p_code, v_detail;
    return;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

grant usage on schema erp_test to authenticated, anon;
grant execute on all functions in schema erp_test to authenticated, anon;

-- ============================================================
-- 1) 以 office 使用者建立基本資料
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into erp_warehouses (id, code, name) values
  ('00000000-0000-0000-0000-00000000a002', 'WH2', '二倉');
insert into erp_vendors (id, code, name, contact_person, phone, tax_id) values
  ('00000000-0000-0000-0000-00000000b001', 'KA405', '開山壓縮機', '王先生', '02-1111-2222', '87654321');
-- 0042：horsepower／voltage 以 authenticated 寫入（驗證欄位級 insert 授權）；c001、c002 有值、其餘未填（null）
-- （c002 有值，用來驗證「連結既有機台」不回寫馬力／電壓）
insert into erp_items (id, code, name, kind, unit, track_serial, track_stock, mx_card_type, model, horsepower, voltage) values
  ('00000000-0000-0000-0000-00000000c001', 'ALH-15AI', '螺旋式空壓機 15HP', 'machine', '台', true,  true,  'compressor', 'ALH-15AI', ' 15HP ', '220V'),
  ('00000000-0000-0000-0000-00000000c002', 'EA350',    '過濾器組',          'machine', '組', true,  true,  'filter',     null,       '7.5HP',  '380V'),
  ('00000000-0000-0000-0000-00000000c003', 'OIL-20L',  '空壓機專用油 20L',  'part',    '桶', false, true,  null,         null,       null,     null),
  ('00000000-0000-0000-0000-00000000c004', 'SVC-INST', '安裝工資',          'service', '式', false, false, null,         null,       null,     null),
  ('00000000-0000-0000-0000-00000000c005', 'EXP-SHIP', '運費',              'expense', '式', false, false, null,         null,       null,     null);
insert into mx_customers (id, name, code, tax_id, contact_person, phone, delivery_address, sales_rep) values
  ('00000000-0000-0000-0000-00000000d001', '華淨科技股份有限公司', 'C001', '12345678', '林小姐', '03-333-4444', '桃園市中壢區測試路 1 號', '陳業務'),
  ('00000000-0000-0000-0000-00000000d002', '測試二號工廠',         'C002', null,       null,     null,          null,                     null);

-- 品項約束
select erp_test.expect_error($q$insert into erp_items (code, name, kind, track_stock) values ('X1','x','service',true)$q$, '23514');
select erp_test.expect_error($q$insert into erp_items (code, name, kind, mx_card_type) values ('X2','x','machine','compressor')$q$, '23514');

-- ============================================================
-- 2) 未授權使用者：RLS 看不到、RPC forbidden；anon 無執行權限
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  assert not has_module('erp'), 'admin 不應有 erp 模組';
  assert (select count(*) from erp_items) = 0, '未授權者不應看到 erp_items';
  assert (select count(*) from erp_warehouses) = 0, '未授權者不應看到 erp_warehouses';
  assert (select count(*) from admin_module_grants) = 0, '未授權者不應看到他人授權';
end $$;
select erp_test.expect_error($q$select erp_next_doc_no('S', '2026-09-11')$q$, '42501');
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e001')$q$, 'forbidden');
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e001', 'x')$q$, 'forbidden');
select erp_test.expect_error($q$select erp_post_payment('{}'::jsonb)$q$, 'forbidden');
select erp_test.expect_error($q$insert into erp_vendors (code, name) values ('Z', 'z')$q$, '42501');

set local role anon;
select erp_test.expect_error($q$select erp_next_doc_no('S', '2026-09-11')$q$, '42501');
select erp_test.expect_error($q$select * from erp_items$q$, '42501');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ============================================================
-- 3) 取號與稅額
--    取號、erp_avg_* 為內部函式（決策 15）：authenticated 不可直接呼叫，公式改以擁有者身分驗證
-- ============================================================
select erp_test.expect_error($q$select erp_next_doc_no('S', '2026-09-11')$q$, '42501');
select erp_test.expect_error($q$select erp_avg_in(1, 1, 1, 1)$q$, '42501');
reset role;
do $$ begin
  assert has_module('erp'), 'office 應有 erp 模組';
  assert erp_next_doc_no('S', '2026-09-11') = 'S11509001', 'S 第一號';
  assert erp_next_doc_no('S', '2026-09-30') = 'S11509002', 'S 流水號遞增';
  assert erp_next_doc_no('Q', '2026-01-05') = 'Q11501001', '民國年月 11501';
  insert into erp_doc_sequences (prefix, period, last_no) values ('A', '11412', 999);
  assert erp_next_doc_no('A', '2025-12-01') = 'A114121000', '超過 999 變 4 位';
  raise notice 'ok  取號';
end $$;
select erp_test.expect_error($q$select erp_next_doc_no('ZZ', '2026-09-11')$q$, 'validation');

do $$
declare r record;
begin
  select * into r from erp_calc_tax(213400, 'excluded', 0.05, 'TWD', 1);
  assert r.amount_untaxed = 213400 and r.tax_amount = 10670 and r.total_amount = 224070 and r.total_twd = 224070,
    format('外加稅 %s', r);
  select * into r from erp_calc_tax(235000, 'included', 0.05, 'TWD', 1);
  assert r.amount_untaxed = 223810 and r.tax_amount = 11190 and r.total_amount = 235000 and r.total_twd = 235000,
    format('內含稅 %s', r);
  select * into r from erp_calc_tax(235000, 'exempt', 0.05, 'TWD', 1);
  assert r.amount_untaxed = 235000 and r.tax_amount = 0 and r.total_amount = 235000, format('免稅 %s', r);
  select * into r from erp_calc_tax(100.55, 'excluded', 0.05, 'USD', 30.5);
  assert r.tax_amount = 5.03 and r.total_amount = 105.58 and r.total_twd = 3220, format('外幣 %s', r);
  assert erp_avg_in(-1, 100, 3, 50) = 50 and erp_avg_in(2, 100, 2, 200) = 150, 'erp_avg_in';
  assert erp_avg_out(1, 100, 1, 80) = 100 and erp_avg_out(3, 160000, 1, 170000) = 155000, 'erp_avg_out';
  raise notice 'ok  稅額 / 平均成本公式';
end $$;
set local role authenticated;
do $$ begin
  assert (select total_amount from erp_calc_tax(100, 'excluded', 0.05, 'TWD', 1)) = 105, 'erp_calc_tax 仍開放 authenticated';
end $$;

-- ============================================================
-- 4) 採購 P → 進貨 I（分批）
-- ============================================================
insert into erp_documents (id, doc_type, doc_date, vendor_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e001', 'P', '2026-09-01', '00000000-0000-0000-0000-00000000b001', 'excluded');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0010001', '00000000-0000-0000-0000-00000000e001', 1, 'item', '00000000-0000-0000-0000-00000000c001', 2, 150000),
  ('00000000-0000-0000-0000-0000f0010002', '00000000-0000-0000-0000-00000000e001', 2, 'item', '00000000-0000-0000-0000-00000000c003', 10, 8000);

do $$
declare v jsonb; d erp_documents;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e001');
  assert v->>'doc_no' = 'P11509001', format('P 單號 %s', v);
  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e001';
  assert d.status = 'posted' and d.amount_untaxed = 380000 and d.tax_amount = 19000 and d.total_twd = 399000, format('P 金額 %s', d);
  assert d.party_name = '開山壓縮機' and d.party_tax_id = '87654321' and d.posted_by = '00000000-0000-0000-0000-000000000001', 'P 快照';
  assert (select count(*) from erp_stock_moves where document_id = d.id) = 0, 'P 無庫存異動';
  assert (select status from erp_purchase_progress where document_id = d.id) = 'open', 'P open';
  raise notice 'ok  P 過帳';
end $$;
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e001')$q$, 'not_draft');

-- 0023：報價單自由輸入品項行（item_id 為 null，需填品名規格）；其他單別仍需品項
insert into erp_documents (id, doc_type, doc_date, customer_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e030', 'Q', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded'),
  ('00000000-0000-0000-0000-00000000e031', 'Q', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded'),
  ('00000000-0000-0000-0000-00000000e032', 'S', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded'),
  ('00000000-0000-0000-0000-00000000e033', 'Q', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded');
insert into erp_document_lines (document_id, line_no, line_type, item_id, description, qty, unit_price) values
  ('00000000-0000-0000-0000-00000000e030', 1, 'item', null, 'LS-20 機型保養', 2, 5000),
  ('00000000-0000-0000-0000-00000000e031', 1, 'item', null, '  ', 1, 100),
  ('00000000-0000-0000-0000-00000000e032', 1, 'item', null, 'LS-20 機型保養', 1, 100);
-- 0024：只有品項文字（item_text）、品名規格空白也可確認
insert into erp_document_lines (document_id, line_no, line_type, item_text, qty, unit_price) values
  ('00000000-0000-0000-0000-00000000e033', 1, 'item', 'LS-30', 1, 100);
update erp_documents set warehouse_id = erp_test.main() where id = '00000000-0000-0000-0000-00000000e032';
do $$
declare v jsonb; d erp_documents;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e030');
  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e030';
  assert d.status = 'posted' and d.amount_untaxed = 10000 and d.total_amount = 10500, format('Q 自由輸入 %s', d);
  v := erp_post_document('00000000-0000-0000-0000-00000000e033');
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e033') = 'posted', 'Q 只有 item_text';
  raise notice 'ok  Q 自由輸入品項行可確認';
end $$;
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e031')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e032')$q$, 'validation');

-- 0025：報價單小計／總價款行（顯示用，金額存 0、不計入合計稅額；僅報價單）
insert into erp_documents (id, doc_type, doc_date, customer_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e034', 'Q', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded'),
  ('00000000-0000-0000-0000-00000000e035', 'S', '2026-09-01', '00000000-0000-0000-0000-00000000d001', 'excluded');
update erp_documents set warehouse_id = erp_test.main() where id = '00000000-0000-0000-0000-00000000e035';
insert into erp_document_lines (document_id, line_no, line_type, item_id, item_text, description, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-00000000e034', 1, 'item',     null, 'AL-010N', E'乾燥機\n含安裝', 1, 320000, 0),
  ('00000000-0000-0000-0000-00000000e034', 2, 'item',     '00000000-0000-0000-0000-00000000c003', null, null, 2, 4000, 0),
  ('00000000-0000-0000-0000-00000000e034', 3, 'subtotal', null, null, '總價款', 0, 0, 0),
  ('00000000-0000-0000-0000-00000000e034', 4, 'item',     '00000000-0000-0000-0000-00000000c004', null, null, 1, 10000, 0),
  ('00000000-0000-0000-0000-00000000e034', 5, 'discount', null, null, '優惠', 0, 0, -1500),
  ('00000000-0000-0000-0000-00000000e034', 6, 'subtotal', null, null, null, 0, 0, 0),
  ('00000000-0000-0000-0000-00000000e035', 1, 'subtotal', null, null, '小計', 0, 0, 0),
  ('00000000-0000-0000-0000-00000000e035', 2, 'item',     '00000000-0000-0000-0000-00000000c004', null, null, 1, 100, 0);
-- 形狀約束：小計行不可帶金額 / 數量 / 品項；未知類型仍擋
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type, amount) values ('00000000-0000-0000-0000-00000000e034', 90, 'subtotal', 328000)$q$, '23514');
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type, qty) values ('00000000-0000-0000-0000-00000000e034', 91, 'subtotal', 1)$q$, '23514');
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type, item_id) values ('00000000-0000-0000-0000-00000000e034', 92, 'subtotal', '00000000-0000-0000-0000-00000000c004')$q$, '23514');
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type) values ('00000000-0000-0000-0000-00000000e034', 93, 'total')$q$, '23514');
do $$
declare v jsonb; d erp_documents;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e034');
  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e034';
  -- 320000 + 8000 + 10000 − 1500 = 336500；小計行（328000 / 8500）不重複計入
  assert d.status = 'posted' and d.amount_untaxed = 336500 and d.tax_amount = 16825 and d.total_amount = 353325,
    format('Q 含小計行 %s', d);
  assert (select count(*) from erp_document_lines
           where document_id = d.id and line_type = 'subtotal' and amount = 0) = 2, 'Q 小計行金額維持 0';
  assert (select description from erp_document_lines where document_id = d.id and line_no = 1) = E'乾燥機\n含安裝',
    'Q 多行品名規格保留換行';
  assert (select count(*) from erp_stock_moves where document_id = d.id) = 0, 'Q 不動庫存';
  raise notice 'ok  Q 小計行：可確認、不計入合計稅額';
end $$;
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e035')$q$, 'validation');
do $$ begin
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e035') = 'draft', 'S 含小計行不可過帳';
  raise notice 'ok  小計行只限報價單';
end $$;

-- I1：部分到貨（ALH-15AI 1 台 + 油 4 桶）
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id) values
  ('00000000-0000-0000-0000-00000000e002', 'I', '2026-09-05', '00000000-0000-0000-0000-00000000b001', erp_test.main(), '00000000-0000-0000-0000-00000000e001');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, source_line_id, serial_nos) values
  ('00000000-0000-0000-0000-0000f0020001', '00000000-0000-0000-0000-00000000e002', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 150000, '00000000-0000-0000-0000-0000f0010001', array['26-PM15060010']),
  ('00000000-0000-0000-0000-0000f0020002', '00000000-0000-0000-0000-00000000e002', 2, 'item', '00000000-0000-0000-0000-00000000c003', 4, 8000,   '00000000-0000-0000-0000-0000f0010002', null);

do $$
declare v jsonb; s erp_serials; p record;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e002');
  assert v->>'doc_no' = 'I11509001', format('I 單號 %s', v);
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 1, 'I1 機台 +1';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 150000, 'I1 機台 avg';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 4, 'I1 油 +4';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8000, 'I1 油 avg';
  s := erp_test.serial('26-PM15060010');
  assert s.status = 'in_stock' and s.warehouse_id = erp_test.main() and s.unit_cost = 150000
     and s.in_doc_id = '00000000-0000-0000-0000-00000000e002', format('I1 機號 %s', s);
  assert (select count(*) from erp_document_line_serials where line_id = '00000000-0000-0000-0000-0000f0020001') = 1, 'I1 行序號';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0020002') = 8000, 'I1 行 unit_cost';
  assert (select status from erp_purchase_progress where document_id = '00000000-0000-0000-0000-00000000e001') = 'partial', 'P partial';
  select * into p from erp_purchase_line_progress where line_id = '00000000-0000-0000-0000-0000f0010002';
  assert p.received_qty = 4 and p.remaining_qty = 6, format('P 行進度 %s', p);
  raise notice 'ok  I1 部分到貨';
end $$;

-- I2：到齊
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id) values
  ('00000000-0000-0000-0000-00000000e003', 'I', '2026-09-06', '00000000-0000-0000-0000-00000000b001', erp_test.main(), '00000000-0000-0000-0000-00000000e001');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, source_line_id, serial_nos) values
  ('00000000-0000-0000-0000-0000f0030001', '00000000-0000-0000-0000-00000000e003', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 160000, '00000000-0000-0000-0000-0000f0010001', array['26-PM15060011']),
  ('00000000-0000-0000-0000-0000f0030002', '00000000-0000-0000-0000-00000000e003', 2, 'item', '00000000-0000-0000-0000-00000000c003', 6, 9000,   '00000000-0000-0000-0000-0000f0010002', null);

do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e003');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 2, 'I2 機台 2';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000, 'I2 機台 avg 155000';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 10, 'I2 油 10';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8600, 'I2 油 avg 8600';
  assert (select status from erp_purchase_progress where document_id = '00000000-0000-0000-0000-00000000e001') = 'closed', 'P closed';
  raise notice 'ok  I2 到齊、移動平均';
end $$;

-- 超收
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e004', 'I', '2026-09-07', '00000000-0000-0000-0000-00000000b001', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000f0040001', '00000000-0000-0000-0000-00000000e004', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 8000, '00000000-0000-0000-0000-0000f0010002');
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e004')$q$, 'over_receipt');

-- 機號數與數量不符
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e005', 'I', '2026-09-07', '00000000-0000-0000-0000-00000000b001', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, serial_nos) values
  ('00000000-0000-0000-0000-0000f0050001', '00000000-0000-0000-0000-00000000e005', 1, 'item', '00000000-0000-0000-0000-00000000c001', 2, 150000, array['X-1']);
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e005')$q$, 'validation');
-- 機號重複（已存在）
update erp_document_lines set qty = 1, serial_nos = array['26-pm15060010 '] where id = '00000000-0000-0000-0000-0000f0050001';
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e005')$q$, 'serial_unavailable');
do $$ begin
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e004') = 'draft', '失敗後仍為草稿';
  assert (select count(*) from erp_stock_moves where document_id in ('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000e005')) = 0, '失敗不留異動';
end $$;

-- I3：無來源、外加稅、折扣分攤
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e006', 'I', '2026-09-08', '00000000-0000-0000-0000-00000000b001', erp_test.main(), 'excluded');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, amount, serial_nos) values
  ('00000000-0000-0000-0000-0000f0060001', '00000000-0000-0000-0000-00000000e006', 1, 'item',     '00000000-0000-0000-0000-00000000c002', 1,  40000, 0, array['F-100HA-01']),
  ('00000000-0000-0000-0000-0000f0060002', '00000000-0000-0000-0000-00000000e006', 2, 'item',     '00000000-0000-0000-0000-00000000c003', 10, 10000, 0, null),
  ('00000000-0000-0000-0000-0000f0060003', '00000000-0000-0000-0000-00000000e006', 3, 'discount', null,                                    0,  0, -14000, null);

do $$
declare d erp_documents;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e006');
  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e006';
  assert d.amount_untaxed = 126000 and d.tax_amount = 6300 and d.total_twd = 132300, format('I3 金額 %s', d);
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0060001') = 36000, 'I3 折扣分攤 過濾器';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0060002') = 9000, 'I3 折扣分攤 油';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8800, 'I3 油 avg 8800';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 20, 'I3 油 20';
  assert (erp_test.serial('F-100HA-01')).unit_cost = 36000, 'I3 機號成本';
  raise notice 'ok  I3 折扣分攤';
end $$;

-- ============================================================
-- 5) 銷貨 S：重現 S11509047 合計
-- ============================================================
-- 庫存不足
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e007', 'S', '2026-09-10', '00000000-0000-0000-0000-00000000d001', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0070001', '00000000-0000-0000-0000-00000000e007', 1, 'item', '00000000-0000-0000-0000-00000000c003', 100, 1);
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e007')$q$, 'insufficient_stock');

-- 機台未選機號
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e008', 'S', '2026-09-10', '00000000-0000-0000-0000-00000000d001', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0080001', '00000000-0000-0000-0000-00000000e008', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 195000);
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e008')$q$, 'validation');

-- 同客戶已有過濾器卡（F-100HA-01）→ 應直接連結、不重建
insert into mx_machines (id, customer_id, card_type, serial_no, model) values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-00000000d001', 'filter', 'F-100HA-01', 'EA350');

insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type, note) values
  ('00000000-0000-0000-0000-00000000e009', 'S', '2026-09-11', '00000000-0000-0000-0000-00000000d001', erp_test.main(), 'included', '備庫 / 預轉華淨科技');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, description, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-0000f0090001', '00000000-0000-0000-0000-00000000e009', 1, 'item',     '00000000-0000-0000-0000-00000000c001', '螺旋式空壓機 15HP', 1, 195000, 0),
  ('00000000-0000-0000-0000-0000f0090002', '00000000-0000-0000-0000-00000000e009', 2, 'item',     '00000000-0000-0000-0000-00000000c002', '過濾器組',          1, 50000,  0),
  ('00000000-0000-0000-0000-0000f0090003', '00000000-0000-0000-0000-00000000e009', 3, 'item',     '00000000-0000-0000-0000-00000000c003', '專用油',            2, 10000,  0),
  ('00000000-0000-0000-0000-0000f0090004', '00000000-0000-0000-0000-00000000e009', 4, 'item',     '00000000-0000-0000-0000-00000000c004', '安裝工資',          1, 8000,   0),
  ('00000000-0000-0000-0000-0000f0090005', '00000000-0000-0000-0000-00000000e009', 5, 'item',     '00000000-0000-0000-0000-00000000c005', '運費（贈送）',      1, 0,      0),
  ('00000000-0000-0000-0000-0000f0090006', '00000000-0000-0000-0000-00000000e009', 6, 'discount', null,                                    '特別折讓',          0, 0,      -38000),
  ('00000000-0000-0000-0000-0000f0090007', '00000000-0000-0000-0000-00000000e009', 7, 'note',     null,                                    '09/02 已匯訂金 $70,000', 0, 0, 999),
  ('00000000-0000-0000-0000-0000f0090008', '00000000-0000-0000-0000-00000000e009', 8, 'note',     null,                                    '貨款未全部兌現前，貨物所有權仍歸本公司所有', 0, 0, 0);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0090001', id from erp_serials where serial_no = '26-PM15060010';
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0090002', id from erp_serials where serial_no = 'F-100HA-01';

do $$
declare v jsonb; d erp_documents; s erp_serials; m mx_machines;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e009');
  assert v->>'doc_no' = 'S11509003', format('S 單號 %s', v);
  assert jsonb_array_length(v->'mx_machine_ids') = 2, format('S mx_machine_ids %s', v);
  assert jsonb_array_length(v->'warnings') = 1, format('S warnings %s', v);

  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e009';
  assert d.total_amount = 235000 and d.total_twd = 235000 and d.amount_untaxed = 223810 and d.tax_amount = 11190,
    format('S11509047 合計 %s', d);
  assert d.party_name = '華淨科技股份有限公司' and d.party_tax_id = '12345678' and d.party_contact = '林小姐'
     and d.party_address = '桃園市中壢區測試路 1 號' and d.sales_rep = '陳業務', 'S 表頭快照';
  assert (select sum(amount) from erp_document_lines where document_id = d.id) = 235000, 'S 行合計';
  assert (select amount from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090007') = 0, 'note 行金額歸 0';

  -- 成本
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090001') = 155000, 'S 機台成本';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090002') = 36000, 'S 過濾器成本';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090003') = 8800, 'S 油成本';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090004') is null, '服務不寫成本';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000, 'S 不改 avg';

  -- 庫存
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 1, 'S 機台 −1';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c002', erp_test.main()) = 0, 'S 過濾器 −1';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 18, 'S 油 −2';
  assert (select count(*) from erp_stock_moves where document_id = d.id) = 3, 'S 僅 3 筆庫存帳（服務/費用不入帳）';
  assert (select count(*) from erp_stock_levels where item_id in ('00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000c005')) = 0, '服務無存量';

  -- 機號 + 保養卡機台
  s := erp_test.serial('26-PM15060010');
  assert s.status = 'sold' and s.customer_id = '00000000-0000-0000-0000-00000000d001' and s.warehouse_id is null
     and s.out_doc_id = d.id and s.mx_machine_id is not null, format('S 機號 %s', s);
  select * into m from mx_machines where id = s.mx_machine_id;
  assert m.customer_id = '00000000-0000-0000-0000-00000000d001' and m.card_type = 'compressor'
     and m.serial_no = '26-PM15060010' and m.model = 'ALH-15AI' and m.purchased_at = '2026-09-11', format('mx_machine %s', m);
  -- 0042：品項馬力／電壓帶入新建機台（去前後空白）
  assert m.horsepower = '15HP' and m.voltage = '220V', format('mx_machine 馬力／電壓 %s／%s', m.horsepower, m.voltage);
  -- 連結既有機台時不回寫馬力／電壓
  assert (select horsepower is null and voltage is null from mx_machines where id = '00000000-0000-0000-0000-000000009001'),
    '連結既有機台不回寫馬力／電壓';
  assert (v->'mx_machine_ids') ? m.id::text, '回傳含新建機台';

  assert (erp_test.serial('F-100HA-01')).mx_machine_id = '00000000-0000-0000-0000-000000009001', '連結既有過濾器卡';
  assert (select count(*) from mx_machines where customer_id = '00000000-0000-0000-0000-00000000d001' and card_type = 'filter') = 1, '不重建過濾器卡';
  assert (select mx_machine_created from erp_document_line_serials where line_id = '00000000-0000-0000-0000-0000f0090001') = true, '記錄新建';
  assert (select mx_machine_created from erp_document_line_serials where line_id = '00000000-0000-0000-0000-0000f0090002') = false, '記錄連結';
  raise notice 'ok  S 過帳（S11509047 合計 235000）';
end $$;

-- 已售出機號再賣 → serial_unavailable
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e00a', 'S', '2026-09-11', '00000000-0000-0000-0000-00000000d001', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f00a0001', '00000000-0000-0000-0000-00000000e00a', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 195000);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f00a0001', id from erp_serials where serial_no = '26-PM15060010';
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e00a')$q$, 'serial_unavailable');

-- ============================================================
-- 6) I4 → SR（重算 avg）→ PR → T → A
-- ============================================================
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e00b', 'I', '2026-09-12', '00000000-0000-0000-0000-00000000b001', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, serial_nos) values
  ('00000000-0000-0000-0000-0000f00b0001', '00000000-0000-0000-0000-00000000e00b', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 170000, array['26-PM15060012']);
do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e00b');
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 162500, 'I4 avg 162500';
end $$;

-- SR：退回 26-PM15060010，入庫成本 = 原銷貨成本 155000
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e00c', 'SR', '2026-09-12', '00000000-0000-0000-0000-00000000d001', erp_test.main(), '00000000-0000-0000-0000-00000000e009', 'included');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000f00c0001', '00000000-0000-0000-0000-00000000e00c', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 195000, '00000000-0000-0000-0000-0000f0090001');
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f00c0001', id from erp_serials where serial_no = '26-PM15060010';

do $$
declare v jsonb; s erp_serials;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e00c');
  assert v->>'doc_no' = 'SR11509001', format('SR 單號 %s', v);
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 3, 'SR 機台 +1';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 160000, 'SR avg 重算 160000';
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f00c0001') = 155000, 'SR 成本取原銷貨行';
  s := erp_test.serial('26-PM15060010');
  assert s.status = 'in_stock' and s.warehouse_id = erp_test.main() and s.customer_id is null, format('SR 機號 %s', s);
  assert exists (select 1 from mx_machines where serial_no = '26-PM15060010'), 'SR 不刪保養卡機台';
  raise notice 'ok  SR 過帳';
end $$;
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e009', '測試')$q$, 'has_dependents');
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e001', '測試')$q$, 'has_dependents');

-- PR：退回 26-PM15060012（原進貨成本 170000）
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e00d', 'PR', '2026-09-13', '00000000-0000-0000-0000-00000000b001', erp_test.main(), '00000000-0000-0000-0000-00000000e00b', 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000f00d0001', '00000000-0000-0000-0000-00000000e00d', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 170000, '00000000-0000-0000-0000-0000f00b0001');
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f00d0001', id from erp_serials where serial_no = '26-PM15060012';

do $$
declare s erp_serials;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e00d');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 2, 'PR 機台 −1';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000, 'PR avg 155000';
  s := erp_test.serial('26-PM15060012');
  assert s.status = 'returned_to_vendor' and s.warehouse_id is null
     and s.out_doc_id = '00000000-0000-0000-0000-00000000e00d', format('PR 機號 %s', s);
  raise notice 'ok  PR 過帳';
end $$;

-- T：26-PM15060011 + 油 5 桶 MAIN → WH2
insert into erp_documents (id, doc_type, doc_date, warehouse_id, to_warehouse_id) values
  ('00000000-0000-0000-0000-00000000e00e', 'T', '2026-09-13', erp_test.main(), '00000000-0000-0000-0000-00000000a002');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty) values
  ('00000000-0000-0000-0000-0000f00e0001', '00000000-0000-0000-0000-00000000e00e', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1),
  ('00000000-0000-0000-0000-0000f00e0002', '00000000-0000-0000-0000-00000000e00e', 2, 'item', '00000000-0000-0000-0000-00000000c003', 5);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f00e0001', id from erp_serials where serial_no = '26-PM15060011';

do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e00e');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 1, 'T 來源倉 −1';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a002') = 1, 'T 目的倉 +1';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 13, 'T 油來源倉';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000a002') = 5, 'T 油目的倉';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000 and erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8800, 'T 不改 avg';
  assert (erp_test.serial('26-PM15060011')).warehouse_id = '00000000-0000-0000-0000-00000000a002', 'T 機號換倉';
  assert (select count(*) from erp_stock_moves where document_id = '00000000-0000-0000-0000-00000000e00e') = 4, 'T 4 筆庫存帳';
  raise notice 'ok  T 過帳';
end $$;

-- T：機號已不在來源倉
insert into erp_documents (id, doc_type, doc_date, warehouse_id, to_warehouse_id) values
  ('00000000-0000-0000-0000-00000000e00f', 'T', '2026-09-13', erp_test.main(), '00000000-0000-0000-0000-00000000a002');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty) values
  ('00000000-0000-0000-0000-0000f00f0001', '00000000-0000-0000-0000-00000000e00f', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f00f0001', id from erp_serials where serial_no = '26-PM15060011';
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e00f')$q$, 'serial_unavailable');

-- A：盤盈 / 盤虧
insert into erp_documents (id, doc_type, doc_date, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e010', 'A', '2026-09-14', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, description, qty, serial_nos) values
  ('00000000-0000-0000-0000-0000f0100001', '00000000-0000-0000-0000-00000000e010', 1, 'item', '00000000-0000-0000-0000-00000000c003', '盤盈', 2, null),
  ('00000000-0000-0000-0000-0000f0100002', '00000000-0000-0000-0000-00000000e010', 2, 'item', '00000000-0000-0000-0000-00000000c003', '盤虧', -1, null),
  ('00000000-0000-0000-0000-0000f0100003', '00000000-0000-0000-0000-00000000e010', 3, 'item', '00000000-0000-0000-0000-00000000c001', '盤盈', 1, array['A-NEW-01']);

do $$
declare s erp_serials;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e010');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 14, 'A 油 +2 −1';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 2, 'A 機台 +1';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000 and erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8800, 'A 不改 avg';
  s := erp_test.serial('A-NEW-01');
  assert s.status = 'in_stock' and s.unit_cost = 155000 and s.in_doc_id = '00000000-0000-0000-0000-00000000e010', format('A 機號 %s', s);
  assert (select unit_cost from erp_document_lines where id = '00000000-0000-0000-0000-0000f0100002') = 8800, 'A 盤虧以 C0 出帳';
  raise notice 'ok  A 過帳';
end $$;

insert into erp_documents (id, doc_type, doc_date, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e011', 'A', '2026-09-14', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty) values
  ('00000000-0000-0000-0000-0000f0110001', '00000000-0000-0000-0000-00000000e011', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1);
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e011')$q$, 'validation');

-- ============================================================
-- 7) 作廢
-- ============================================================
-- S3：售出 A-NEW-01 給二號工廠 → 作廢（無保養紀錄 → 刪除自動建立的機台）
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e012', 'S', '2026-09-14', '00000000-0000-0000-0000-00000000d002', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0120001', '00000000-0000-0000-0000-00000000e012', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 200000);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0120001', id from erp_serials where serial_no = 'A-NEW-01';
-- 0042：品項未填馬力、電壓只有空白（以 authenticated 更新，驗證欄位級 update 授權）→ 仍可過帳，機台兩欄為 null
update erp_items set horsepower = null, voltage = '  ' where id = '00000000-0000-0000-0000-00000000c001';

do $$
declare v jsonb; w jsonb; mid uuid; s erp_serials; d erp_documents;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e012');
  mid := (v->'mx_machine_ids'->>0)::uuid;
  assert mid is not null and exists (select 1 from mx_machines where id = mid), 'S3 建立機台';
  assert (select horsepower is null and voltage is null from mx_machines where id = mid), 'S3 品項未填馬力／電壓 → 機台為 null';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 1, 'S3 −1';

  w := erp_void_document('00000000-0000-0000-0000-00000000e012', '客戶取消訂單');
  assert jsonb_array_length(w->'warnings') = 0, format('S3 作廢 warnings %s', w);
  assert not exists (select 1 from mx_machines where id = mid), 'S3 作廢刪除無紀錄機台';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 2, 'S3 作廢庫存回復';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c001') = 155000, 'S3 作廢 avg';
  s := erp_test.serial('A-NEW-01');
  assert s.status = 'in_stock' and s.warehouse_id = erp_test.main() and s.customer_id is null
     and s.out_doc_id is null and s.mx_machine_id is null, format('S3 作廢機號 %s', s);
  select * into d from erp_documents where id = '00000000-0000-0000-0000-00000000e012';
  assert d.status = 'voided' and d.void_reason = '客戶取消訂單' and d.voided_by is not null and d.doc_no = 'S11509004', format('S3 作廢表頭 %s', d);
  assert (select count(*) from erp_stock_moves where document_id = d.id and is_reversal and qty = 1) = 1, 'S3 反向庫存帳';
  raise notice 'ok  S 作廢（刪除機台）';
end $$;
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e012', '再一次')$q$, 'not_posted');
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e012')$q$, 'not_draft');
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e00e', '  ')$q$, 'validation');

-- S4：再賣一次 → 建立保養紀錄 → 作廢（保留機台、回傳警告）
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e013', 'S', '2026-09-14', '00000000-0000-0000-0000-00000000d002', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0130001', '00000000-0000-0000-0000-00000000e013', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1, 200000);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0130001', id from erp_serials where serial_no = 'A-NEW-01';

do $$
declare v jsonb; w jsonb; mid uuid;
begin
  v := erp_post_document('00000000-0000-0000-0000-00000000e013');
  mid := (v->'mx_machine_ids'->>0)::uuid;
  insert into mx_records (machine_id, service_date, note) values (mid, '2026-09-15', '首次保養');
  w := erp_void_document('00000000-0000-0000-0000-00000000e013', '開錯客戶');
  assert jsonb_array_length(w->'warnings') = 1, format('S4 作廢應有警告 %s', w);
  assert exists (select 1 from mx_machines where id = mid), 'S4 有紀錄 → 保留機台';
  assert (erp_test.serial('A-NEW-01')).mx_machine_id is null, 'S4 解除機號連結';
  assert (erp_test.serial('A-NEW-01')).status = 'in_stock', 'S4 機號回庫';
  raise notice 'ok  S 作廢（保留有紀錄機台）';
end $$;

-- A2：盤虧 A-NEW-01 → 作廢
insert into erp_documents (id, doc_type, doc_date, warehouse_id) values
  ('00000000-0000-0000-0000-00000000e014', 'A', '2026-09-14', erp_test.main());
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, description, qty) values
  ('00000000-0000-0000-0000-0000f0140001', '00000000-0000-0000-0000-00000000e014', 1, 'item', '00000000-0000-0000-0000-00000000c001', '報廢', -1);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0140001', id from erp_serials where serial_no = 'A-NEW-01';

do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e014');
  assert (erp_test.serial('A-NEW-01')).status = 'written_off', 'A2 written_off';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 1, 'A2 −1';
  perform erp_void_document('00000000-0000-0000-0000-00000000e014', '盤點錯誤');
  assert (erp_test.serial('A-NEW-01')).status = 'in_stock', 'A2 作廢 → in_stock';
  assert (erp_test.serial('A-NEW-01')).warehouse_id = erp_test.main(), 'A2 作廢回原倉';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c001', erp_test.main()) = 2, 'A2 作廢 +1';
  raise notice 'ok  A 作廢';
end $$;

-- A1 作廢：盤盈建立的 A-NEW-01 已被其他單據（S3/S4/A2）引用 → serial_unavailable
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e010', '測試')$q$, 'serial_unavailable');

-- I5：進貨後作廢，avg 回推
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e015', 'I', '2026-09-14', '00000000-0000-0000-0000-00000000b001', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0150001', '00000000-0000-0000-0000-00000000e015', 1, 'item', '00000000-0000-0000-0000-00000000c003', 3, 5000);
do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e015');
  assert erp_test.avg('00000000-0000-0000-0000-00000000c003') = 8281.8182, format('I5 avg %s', erp_test.avg('00000000-0000-0000-0000-00000000c003'));
  perform erp_void_document('00000000-0000-0000-0000-00000000e015', '重複輸入');
  assert abs(erp_test.avg('00000000-0000-0000-0000-00000000c003') - 8800) < 0.01, format('I5 作廢 avg %s', erp_test.avg('00000000-0000-0000-0000-00000000c003'));
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 14, 'I5 作廢庫存';
  raise notice 'ok  I 作廢';
end $$;

-- ============================================================
-- 8) 收付款與沖銷
-- ============================================================
do $$
declare v jsonb; pid uuid; b record; pb record;
begin
  -- 預收訂金（不沖銷）
  v := erp_post_payment(jsonb_build_object(
    'direction', 'in', 'pay_date', '2026-09-02', 'customer_id', '00000000-0000-0000-0000-00000000d001',
    'method', 'transfer', 'amount', 70000, 'note', '訂金'));
  assert v->>'doc_no' = 'RC11509001', format('RC 單號 %s', v);
  pid := (v->>'id')::uuid;
  perform set_config('erp_test.rc1', pid::text, true);

  select * into pb from erp_party_balances
   where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d001';
  assert pb.unallocated = 70000, format('預收 %s', pb);
  assert pb.balance = 40000, format('客戶應收（235000 − 銷退 195000）%s', pb);

  select * into b from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e00c';
  assert b.total_twd = -195000 and b.outstanding = -195000, format('SR 餘額為負 %s', b);

  -- 補沖銷到 S
  perform erp_allocate_payment(pid, jsonb_build_array(jsonb_build_object(
    'document_id', '00000000-0000-0000-0000-00000000e009', 'amount', 70000)));
  select * into b from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e009';
  assert b.total_twd = 235000 and b.allocated = 70000 and b.outstanding = 165000, format('S 沖銷後 %s', b);
  select * into pb from erp_party_balances
   where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d001';
  assert pb.unallocated = 0, format('沖銷後預收 %s', pb);
  raise notice 'ok  收款 / 沖銷 / 餘額';
end $$;

-- 超沖：收款已用完
select erp_test.expect_error(format($q$select erp_allocate_payment(%L, '[{"document_id":"00000000-0000-0000-0000-00000000e009","amount":1}]')$q$, current_setting('erp_test.rc1')), 'over_allocation');
-- 超沖：單據餘額只剩 165000
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d001","method":"transfer","amount":200000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e009","amount":170000}]}')$q$, 'over_allocation');
-- 反向超沖：銷退單以正數沖銷
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d001","method":"cash","amount":10000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e00c","amount":10000}]}')$q$, 'over_allocation');
-- 不同客戶的單據
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d002","method":"cash","amount":100,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e009","amount":100}]}')$q$, 'validation');
-- 支票缺票號
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d001","method":"check","amount":100}')$q$, 'validation');
-- 有沖銷的單據不可作廢
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e009', '測試')$q$, 'has_dependents');

do $$
declare v jsonb; b record;
begin
  assert (select count(*) from erp_payments where amount in (200000, 10000, 100)) = 0, '失敗的收款不應留下';

  -- 支票：預設 pending
  v := erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d001","method":"check","amount":50000,"check_no":"AB1234567","check_due_date":"2026-11-15","bank":"台灣銀行","allocations":[{"document_id":"00000000-0000-0000-0000-00000000e009","amount":50000}]}');
  assert v->>'doc_no' = 'RC11509002', format('RC2 %s', v);
  assert (select check_status from erp_payments where id = (v->>'id')::uuid) = 'pending', '支票預設 pending';
  select * into b from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e009';
  assert b.outstanding = 115000, format('S 兩筆沖銷後 %s', b);

  -- 作廢收款 → 沖銷移除
  perform erp_void_payment(current_setting('erp_test.rc1')::uuid, '匯款退回');
  assert (select status from erp_payments where id = current_setting('erp_test.rc1')::uuid) = 'voided', 'RC1 voided';
  assert (select count(*) from erp_payment_allocations where payment_id = current_setting('erp_test.rc1')::uuid) = 0, 'RC1 沖銷刪除';
  select * into b from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e009';
  -- 235000 − RC2 支票 50000（RC1 70000 已隨作廢移除）
  assert b.outstanding = 185000 and b.allocated = 50000, format('RC1 作廢後 %s', b);
  raise notice 'ok  支票 / 作廢收款';
end $$;
select erp_test.expect_error(format($q$select erp_void_payment(%L, '再一次')$q$, current_setting('erp_test.rc1')), 'not_posted');
select erp_test.expect_error(format($q$select erp_allocate_payment(%L, '[]')$q$, current_setting('erp_test.rc1')), 'not_posted');

-- S5：沖銷擋作廢 → 作廢收款後可作廢
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e016', 'S', '2026-09-15', '00000000-0000-0000-0000-00000000d002', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f0160001', '00000000-0000-0000-0000-00000000e016', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 12000);

do $$
declare v jsonb;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e016');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 13, 'S5 −1';
  v := erp_post_payment('{"direction":"in","pay_date":"2026-09-15","customer_id":"00000000-0000-0000-0000-00000000d002","method":"cash","amount":12000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e016","amount":12000}]}');
  perform set_config('erp_test.rc_s5', v->>'id', true);
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e016') = 0, 'S5 已沖清';
end $$;
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e016', '測試')$q$, 'has_dependents');
do $$ begin
  perform erp_void_payment(current_setting('erp_test.rc_s5')::uuid, '退款');
  perform erp_void_document('00000000-0000-0000-0000-00000000e016', '取消');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 14, 'S5 作廢庫存回復';
  assert not exists (select 1 from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e016'), '作廢單不列入餘額';
  raise notice 'ok  沖銷擋作廢';
end $$;

-- 付款（廠商）
do $$
declare v jsonb; b record; pb record;
begin
  v := erp_post_payment('{"direction":"out","pay_date":"2026-09-15","vendor_id":"00000000-0000-0000-0000-00000000b001","method":"transfer","amount":100000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e002","amount":100000}]}');
  assert v->>'doc_no' = 'PM11509001', format('PM 單號 %s', v);
  select * into b from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e002';
  assert b.total_twd = 191100 and b.outstanding = 91100, format('I1 付款後 %s', b);
  select * into pb from erp_party_balances where party_type = 'vendor' and party_id = '00000000-0000-0000-0000-00000000b001';
  assert pb.unallocated = 0 and pb.balance is not null, format('廠商餘額 %s', pb);
  raise notice 'ok  付款';
end $$;
select erp_test.expect_error($q$select erp_post_payment('{"direction":"out","pay_date":"2026-09-15","vendor_id":"00000000-0000-0000-0000-00000000b001","method":"cash","amount":10,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e009","amount":10}]}')$q$, 'validation');

-- ============================================================
-- 9) 繞過防護（issue #172 review）：有 erp 授權、非 office 的使用者直接經 PostgREST 寫表
-- ============================================================
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000003', 'erp-only@airexpert.com.tw');
insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-000000000003', 'erp');
-- 保養卡既有資料（office 領域，erp-only 使用者看不到 mx_records）
insert into mx_customers (id, name) values ('00000000-0000-0000-0000-00000000d009', '既有保養客戶');
insert into mx_machines (id, customer_id, card_type, serial_no) values
  ('00000000-0000-0000-0000-00000000aa09', '00000000-0000-0000-0000-00000000d009', 'compressor', 'OLD-1');
insert into mx_records (machine_id, service_date, note) values
  ('00000000-0000-0000-0000-00000000aa09', '2026-01-01', '保養歷史');

-- 決策 17 的前提：security definer 內 current_user = 函式擁有者（≠ authenticated）
create function erp_test.whoami_definer() returns text language sql security definer as $$ select current_user::text $$;
grant execute on function erp_test.whoami_definer() to authenticated;

do $$
declare f text;
begin
  foreach f in array array['erp_post_document(uuid)','erp_void_document(uuid,text)','erp_post_payment(jsonb)',
                           'erp_allocate_payment(uuid,jsonb)','erp_void_payment(uuid,text)','erp_post_refund(jsonb)'] loop
    assert (select prosecdef and array_to_string(proconfig, ',') like '%search_path=public, pg_temp%'
              from pg_proc where oid = f::regprocedure), format('%s 應為 security definer + search_path', f);
    assert has_function_privilege('authenticated', f, 'execute'), format('%s 應開放 authenticated', f);
  end loop;
  foreach f in array array['erp_stock_apply(uuid,uuid,numeric,numeric,uuid,uuid,date,boolean)','erp_next_doc_no(text,date)',
                           'erp_avg_in(numeric,numeric,numeric,numeric)','erp_avg_out(numeric,numeric,numeric,numeric)',
                           'erp_raise(text,text)','erp_machine_has_records(uuid)'] loop
    assert not has_function_privilege('authenticated', f, 'execute'), format('%s 不應開放 authenticated', f);
    assert not has_function_privilege('anon', f, 'execute'), format('%s 不應開放 anon', f);
  end loop;
  raise notice 'ok  RPC security definer / 內部函式權限';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$ begin
  assert has_module('erp') and not is_office(), 'erp-only 使用者：有 erp、非 office';
  assert current_user = 'authenticated', '用戶端 current_user = authenticated';
  assert erp_test.whoami_definer() = (select pg_get_userbyid(proowner)::text from pg_proc
                                        where oid = 'erp_post_document(uuid)'::regprocedure),
    format('definer 內 current_user 應為擁有者，得到 %s', erp_test.whoami_definer());
  assert erp_test.whoami_definer() not in ('authenticated', 'anon'), 'definer 內不是 API 角色';
  raise notice 'ok  RPC 內 current_user = %', erp_test.whoami_definer();
end $$;

-- 9.1 已過帳／已作廢單據：翻回草稿、改金額、刪除
select erp_test.expect_error($q$update erp_documents set status = 'draft' where id = '00000000-0000-0000-0000-00000000e009'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_documents set total_twd = 1 where id = '00000000-0000-0000-0000-00000000e009'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_documents set status = 'posted' where id = '00000000-0000-0000-0000-00000000e012'$q$, 'not_draft');
select erp_test.expect_error($q$delete from erp_documents where id = '00000000-0000-0000-0000-00000000e009'$q$, 'not_draft');
select erp_test.expect_error($q$delete from erp_documents where id = '00000000-0000-0000-0000-00000000e012'$q$, 'not_draft');
-- 9.2 直接新增已過帳／帶 RPC 專屬欄位的單據
select erp_test.expect_error($q$insert into erp_documents (doc_type, doc_no, status, customer_id, total_twd) values ('S', 'FAKE1', 'posted', '00000000-0000-0000-0000-00000000d001', 999999)$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_documents (doc_type, doc_no, customer_id) values ('S', 'FAKE2', '00000000-0000-0000-0000-00000000d001')$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_documents (doc_type, customer_id, posted_at) values ('S', '00000000-0000-0000-0000-00000000d001', now())$q$, 'not_draft');
-- 9.3 已過帳明細／行序號
select erp_test.expect_error($q$update erp_document_lines set unit_price = 1, amount = 1 where id = '00000000-0000-0000-0000-0000f0090003'$q$, 'not_draft');
select erp_test.expect_error($q$delete from erp_document_lines where id = '00000000-0000-0000-0000-0000f0090003'$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type, description) values ('00000000-0000-0000-0000-00000000e009', 99, 'note', 'x')$q$, 'not_draft');
select erp_test.expect_error($q$update erp_document_lines set document_id = '00000000-0000-0000-0000-00000000e009', line_no = 98 where id = '00000000-0000-0000-0000-0000f0040001'$q$, 'not_draft');
select erp_test.expect_error($q$delete from erp_document_line_serials where line_id = '00000000-0000-0000-0000-0000f0090001'$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_document_line_serials (line_id, serial_id) select '00000000-0000-0000-0000-0000f0090003', id from erp_serials where serial_no = '26-PM15060011'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_document_line_serials set mx_machine_created = false where line_id = '00000000-0000-0000-0000-0000f0090001'$q$, 'not_draft');
-- 9.4 帳務表：用戶端不可寫
select erp_test.expect_error($q$update erp_stock_levels set qty = 9999$q$, '42501');
select erp_test.expect_error($q$insert into erp_stock_levels (item_id, warehouse_id, qty) values ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-00000000a002', 5)$q$, '42501');
select erp_test.expect_error($q$delete from erp_stock_levels$q$, '42501');
select erp_test.expect_error($q$update erp_stock_moves set qty = 0$q$, '42501');
select erp_test.expect_error($q$delete from erp_stock_moves where document_id = '00000000-0000-0000-0000-00000000e002'$q$, '42501');
select erp_test.expect_error($q$insert into erp_stock_moves (move_date, item_id, warehouse_id, qty, unit_cost, document_id) values (current_date, '00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000a002', 100, 0, '00000000-0000-0000-0000-00000000e002')$q$, '42501');
select erp_test.expect_error($q$update erp_serials set status = 'in_stock' where serial_no = '26-PM15060012'$q$, '42501');
select erp_test.expect_error($q$insert into erp_serials (item_id, serial_no, status, warehouse_id) values ('00000000-0000-0000-0000-00000000c001', 'FAKE-SN', 'in_stock', '00000000-0000-0000-0000-00000000a002')$q$, '42501');
select erp_test.expect_error($q$delete from erp_serials where serial_no = '26-PM15060012'$q$, '42501');
select erp_test.expect_error($q$update erp_doc_sequences set last_no = 0$q$, '42501');
select erp_test.expect_error($q$insert into erp_doc_sequences (prefix, period, last_no) values ('S', '11510', 0)$q$, '42501');
select erp_test.expect_error($q$delete from erp_doc_sequences$q$, '42501');
select erp_test.expect_error($q$insert into erp_payment_allocations (payment_id, document_id, amount) select id, '00000000-0000-0000-0000-00000000e009', 1 from erp_payments limit 1$q$, '42501');
select erp_test.expect_error($q$delete from erp_payment_allocations$q$, '42501');
select erp_test.expect_error($q$insert into erp_payments (direction, pay_date, customer_id, method, amount) values ('in', current_date, '00000000-0000-0000-0000-00000000d001', 'cash', 1)$q$, '42501');
select erp_test.expect_error($q$update erp_payments set amount = 1$q$, '42501');
select erp_test.expect_error($q$update erp_payments set status = 'posted'$q$, '42501');
select erp_test.expect_error($q$delete from erp_payments$q$, '42501');
-- 0029：kind 與退款來源只能經 RPC 寫入
select erp_test.expect_error($q$update erp_payments set kind = 'refund'$q$, '42501');
select erp_test.expect_error($q$insert into erp_refund_sources (refund_id, source_payment_id, amount) select id, id, 1 from erp_payments limit 1$q$, '42501');
select erp_test.expect_error($q$delete from erp_refund_sources$q$, '42501');
-- 9.5 avg_cost 只能由過帳寫入
select erp_test.expect_error($q$update erp_items set avg_cost = 1$q$, '42501');
select erp_test.expect_error($q$insert into erp_items (code, name, kind, avg_cost) values ('HACK', 'x', 'part', 1)$q$, '42501');
-- 9.6 內部函式不可直接呼叫
select erp_test.expect_error($q$select erp_stock_apply('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000a002', 500, 0, '00000000-0000-0000-0000-00000000e002', null, current_date, false)$q$, '42501');
select erp_test.expect_error($q$select erp_next_doc_no('S', '2026-09-15')$q$, '42501');
select erp_test.expect_error($q$select erp_avg_out(1, 1, 1, 1)$q$, '42501');
select erp_test.expect_error($q$select erp_raise('forbidden', 'x')$q$, '42501');
select erp_test.expect_error($q$select erp_machine_has_records('00000000-0000-0000-0000-00000000aa09')$q$, '42501');

do $$
declare n int;
begin
  -- 以上皆未生效
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e009') = 'posted', '9.x S 仍 posted';
  assert (select total_twd from erp_documents where id = '00000000-0000-0000-0000-00000000e009') = 235000, '9.x S 金額不變';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 14, '9.x 存量不變';
  assert erp_test.avg('00000000-0000-0000-0000-00000000c003') between 8799.99 and 8800.01, '9.x avg 不變';
  assert not exists (select 1 from erp_documents where doc_no like 'FAKE%'), '9.x 無偽造單據';
  assert (select count(*) from erp_stock_moves where document_id = '00000000-0000-0000-0000-00000000e002') = 2, '9.x 庫存帳不變';

  -- 允許：支票狀態／備註、品項一般欄位（avg_cost 走預設 0）
  update erp_payments set check_status = 'cleared', note = '已兌現' where check_no = 'AB1234567';
  get diagnostics n = row_count;
  assert n = 1 and (select check_status from erp_payments where check_no = 'AB1234567') = 'cleared', '可更新支票狀態';
  insert into erp_items (id, code, name, kind) values ('00000000-0000-0000-0000-00000000c009', 'NEW-PART', '新零件', 'part');
  update erp_items set name = '新零件（改）', sale_price = 100 where id = '00000000-0000-0000-0000-00000000c009';
  assert (select avg_cost from erp_items where id = '00000000-0000-0000-0000-00000000c009') = 0, '新品項 avg_cost = 0';

  -- 決策（#2）：erp 對 mx_* 無 delete；可讀、可新增、可修改
  assert (select count(*) from mx_records) = 0, 'erp-only 看不到 mx_records';
  assert exists (select 1 from mx_customers where id = '00000000-0000-0000-0000-00000000d009'), 'erp 可讀客戶';
  delete from mx_customers where id = '00000000-0000-0000-0000-00000000d009';
  get diagnostics n = row_count;
  assert n = 0, 'erp 不可刪 mx_customers';
  delete from mx_machines where id = '00000000-0000-0000-0000-00000000aa09';
  get diagnostics n = row_count;
  assert n = 0, 'erp 不可刪 mx_machines';
  update mx_customers set tax_id = '99999999' where id = '00000000-0000-0000-0000-00000000d009';
  get diagnostics n = row_count;
  assert n = 1, 'erp 可改 mx_customers';
  insert into mx_customers (id, name) values ('00000000-0000-0000-0000-00000000d00a', 'ERP 新客戶');
  -- 0026：erp 可寫客戶傳真／收信人／Email（#222）
  update mx_customers set fax = '02-1234-5678', mail_recipient = '會計 王小姐', email = 'ap@example.com'
   where id = '00000000-0000-0000-0000-00000000d00a';
  get diagnostics n = row_count;
  assert n = 1, 'erp 可改 mx_customers 傳真／收信人／Email';
  assert (select email from mx_customers where id = '00000000-0000-0000-0000-00000000d00a') = 'ap@example.com',
    'mx_customers.email 已寫入';
  raise notice 'ok  繞過防護：帳務表 / 已過帳單據 / mx_* 刪除皆被擋';
end $$;

-- 9.7 草稿流程（documents.ts saveDraftDocument / deleteDraftDocument 的寫法）仍可用
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, status, party_name, sales_rep,
                           amount_untaxed, tax_amount, total_amount, total_twd) values
  ('00000000-0000-0000-0000-00000000e020', 'S', '2026-09-15', '00000000-0000-0000-0000-00000000d002', erp_test.main(), 'draft',
   '測試二號工廠', null, 12000, 0, 12000, 12000);
update erp_documents set note = '改備註', tax_type = 'exempt', total_twd = 12500, party_phone = '02-0000-0000'
 where id = '00000000-0000-0000-0000-00000000e020' and status = 'draft';
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-0000f0200001', '00000000-0000-0000-0000-00000000e020', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 12000, 12000),
  ('00000000-0000-0000-0000-0000f0200002', '00000000-0000-0000-0000-00000000e020', 2, 'item', '00000000-0000-0000-0000-00000000c001', 1, 200000, 200000);
update erp_document_lines set unit_price = 12500, amount = 12500 where id = '00000000-0000-0000-0000-0000f0200001';
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0200002', id from erp_serials where serial_no = 'A-NEW-01';
delete from erp_document_line_serials where line_id = '00000000-0000-0000-0000-0000f0200002';
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0200002', id from erp_serials where serial_no = 'A-NEW-01';
-- 整批重建明細（刪舊行，行序號隨 cascade 刪除）
delete from erp_document_lines where document_id = '00000000-0000-0000-0000-00000000e020';
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-0000f0200003', '00000000-0000-0000-0000-00000000e020', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 12500, 12500);

-- 草稿：RPC 專屬欄位仍不可寫
select erp_test.expect_error($q$update erp_documents set doc_no = 'S11509999' where id = '00000000-0000-0000-0000-00000000e020'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_documents set status = 'posted' where id = '00000000-0000-0000-0000-00000000e020'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_documents set posted_at = now(), posted_by = auth.uid() where id = '00000000-0000-0000-0000-00000000e020'$q$, 'not_draft');
select erp_test.expect_error($q$update erp_document_lines set unit_cost = 1 where id = '00000000-0000-0000-0000-0000f0200003'$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_cost) values ('00000000-0000-0000-0000-00000000e020', 5, 'item', '00000000-0000-0000-0000-00000000c003', 1, 1)$q$, 'not_draft');
select erp_test.expect_error($q$insert into erp_document_line_serials (line_id, serial_id, mx_machine_id, mx_machine_created) select '00000000-0000-0000-0000-0000f0200003', id, '00000000-0000-0000-0000-00000000aa09', true from erp_serials where serial_no = 'A-NEW-01'$q$, 'not_draft');

-- 刪除草稿（明細、行序號隨 cascade 刪除）
insert into erp_documents (id, doc_type, doc_date, warehouse_id, to_warehouse_id) values
  ('00000000-0000-0000-0000-00000000e021', 'T', '2026-09-15', erp_test.main(), '00000000-0000-0000-0000-00000000a002');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty) values
  ('00000000-0000-0000-0000-0000f0210001', '00000000-0000-0000-0000-00000000e021', 1, 'item', '00000000-0000-0000-0000-00000000c001', 1);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000f0210001', id from erp_serials where serial_no = 'A-NEW-01';
delete from erp_documents where id = '00000000-0000-0000-0000-00000000e021' and status = 'draft';

do $$
declare v jsonb; pid uuid;
begin
  assert not exists (select 1 from erp_documents where id = '00000000-0000-0000-0000-00000000e021'), '草稿已刪除';
  assert not exists (select 1 from erp_document_lines where document_id = '00000000-0000-0000-0000-00000000e021'), '草稿明細隨之刪除';
  assert (select total_twd from erp_documents where id = '00000000-0000-0000-0000-00000000e020') = 12500, '草稿合計可寫';

  -- erp-only 使用者過帳 → 作廢（definer RPC 穿過守門觸發器）
  v := erp_post_document('00000000-0000-0000-0000-00000000e020');
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e020') = 'posted', 'erp-only 過帳';
  assert (select total_twd from erp_documents where id = '00000000-0000-0000-0000-00000000e020') = 12500, '過帳重算合計';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 13, 'erp-only 過帳扣庫存';
  perform erp_void_document('00000000-0000-0000-0000-00000000e020', '測試作廢');
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e020') = 'voided', 'erp-only 作廢';
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = 14, 'erp-only 作廢回庫存';

  -- 收付款仍可用
  v := erp_post_payment('{"direction":"out","pay_date":"2026-09-15","vendor_id":"00000000-0000-0000-0000-00000000b001","method":"cash","amount":1000}');
  pid := (v->>'id')::uuid;
  perform erp_allocate_payment(pid, '[{"document_id":"00000000-0000-0000-0000-00000000e002","amount":1000}]');
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e002') = 90100, 'erp-only 沖銷';
  perform erp_void_payment(pid, '測試');
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e002') = 91100, 'erp-only 作廢付款';
  raise notice 'ok  草稿存取 / 刪除 / 過帳 / 作廢 / 收付款（erp-only 使用者）';
end $$;

-- ============================================================
-- 10) 銷退累計金額上限（#233，0028）：Σ 已過帳銷退 + 本單 明細合計 ≤ 原銷貨單明細合計
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- S（外加 5%）：油 3 × 1,000 + 安裝 1 × 7,000 + 折扣 −1,000 → 明細合計 9,000
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e0a1', 'S', '2026-09-20', '00000000-0000-0000-0000-00000000d002', erp_test.main(), 'excluded');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-0000f0a10001', '00000000-0000-0000-0000-00000000e0a1', 1, 'item',     '00000000-0000-0000-0000-00000000c003', 3, 1000, 0),
  ('00000000-0000-0000-0000-0000f0a10002', '00000000-0000-0000-0000-00000000e0a1', 2, 'item',     '00000000-0000-0000-0000-00000000c004', 1, 7000, 0),
  ('00000000-0000-0000-0000-0000f0a10003', '00000000-0000-0000-0000-00000000e0a1', 3, 'discount', null,                                   0, 0,    -1000);
do $$ begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e0a1');
  assert (select amount_untaxed from erp_documents where id = '00000000-0000-0000-0000-00000000e0a1') = 9000, 'S 未稅 9,000';
end $$;

-- 銷退草稿：e0a2 原價全退 10,000（超過）、e0a3 稅別不同、e0a4 幣別不同、e0a5 淨價退油 3 @ 900、
-- e0a6 安裝 1 @ 6,301、e0a7 安裝 1 @ 6,400 + 折扣 −100、e0a8 作廢 e0a5 後再退油 3 @ 900
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id, tax_type, currency, exchange_rate) values
  ('00000000-0000-0000-0000-00000000e0a2', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'TWD', 1),
  ('00000000-0000-0000-0000-00000000e0a3', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'included', 'TWD', 1),
  ('00000000-0000-0000-0000-00000000e0a4', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'USD', 30),
  ('00000000-0000-0000-0000-00000000e0a5', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'TWD', 1),
  ('00000000-0000-0000-0000-00000000e0a6', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'TWD', 1),
  ('00000000-0000-0000-0000-00000000e0a7', 'SR', '2026-09-21', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'TWD', 1),
  ('00000000-0000-0000-0000-00000000e0a8', 'SR', '2026-09-22', '00000000-0000-0000-0000-00000000d002', erp_test.main(), '00000000-0000-0000-0000-00000000e0a1', 'excluded', 'TWD', 1);
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, amount, source_line_id) values
  ('00000000-0000-0000-0000-00000000e0a2', 1, 'item', '00000000-0000-0000-0000-00000000c003', 3, 1000, 0, '00000000-0000-0000-0000-0000f0a10001'),
  ('00000000-0000-0000-0000-00000000e0a2', 2, 'item', '00000000-0000-0000-0000-00000000c004', 1, 7000, 0, '00000000-0000-0000-0000-0000f0a10002'),
  ('00000000-0000-0000-0000-00000000e0a3', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 900,  0, '00000000-0000-0000-0000-0000f0a10001'),
  ('00000000-0000-0000-0000-00000000e0a4', 1, 'item', '00000000-0000-0000-0000-00000000c003', 1, 30,   0, '00000000-0000-0000-0000-0000f0a10001'),
  ('00000000-0000-0000-0000-00000000e0a5', 1, 'item', '00000000-0000-0000-0000-00000000c003', 3, 900,  0, '00000000-0000-0000-0000-0000f0a10001'),
  ('00000000-0000-0000-0000-00000000e0a6', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 6301, 0, '00000000-0000-0000-0000-0000f0a10002'),
  ('00000000-0000-0000-0000-00000000e0a7', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 6400, 0, '00000000-0000-0000-0000-0000f0a10002'),
  ('00000000-0000-0000-0000-00000000e0a8', 1, 'item', '00000000-0000-0000-0000-00000000c003', 3, 900,  0, '00000000-0000-0000-0000-0000f0a10001');
insert into erp_document_lines (document_id, line_no, line_type, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-00000000e0a7', 2, 'discount', 0, 0, -100);

-- 原價全退：10,000 > 9,000
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e0a2')$q$, 'validation');
-- 稅別、幣別需與原單相同
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e0a3')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_document('00000000-0000-0000-0000-00000000e0a4')$q$, 'validation');

do $$
declare v_detail text; v_oil numeric;
begin
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e0a2') = 'draft', '超額銷退維持草稿';
  begin
    perform erp_post_document('00000000-0000-0000-0000-00000000e0a3');
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail like '銷退單的幣別、稅別需與原銷貨單 S% 相同（TWD／外加稅）', format('稅別訊息 %s', v_detail);
  end;

  -- 淨價退油 3 @ 900 = 2,700：過帳成功（另一張超額草稿 e0a2 不計入累計）
  v_oil := erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main());
  perform erp_post_document('00000000-0000-0000-0000-00000000e0a5');
  assert erp_test.qty('00000000-0000-0000-0000-00000000c003', erp_test.main()) = v_oil + 3, '淨價銷退入庫';

  -- 安裝 1 @ 6,301 → 累計 9,001 > 9,000
  begin
    perform erp_post_document('00000000-0000-0000-0000-00000000e0a6');
    raise exception '應被擋下';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert sqlerrm = 'validation'
       and v_detail like '累計銷退金額 9001.00 超過原銷貨單 S% 的金額 9000.00（本單 6301.00、其他已過帳銷退 2700.00）%',
      format('累計超額訊息 %s / %s', sqlerrm, v_detail);
  end;
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e0a6') = 'draft', '超額銷退維持草稿';

  -- 安裝 1 @ 6,400 + 本單折扣 −100 = 6,300 → 累計 9,000 = 上限：成功（折扣行計入）
  perform erp_post_document('00000000-0000-0000-0000-00000000e0a7');
  assert (select amount_untaxed from erp_documents where id = '00000000-0000-0000-0000-00000000e0a7') = 6300, '銷退含折扣行';

  -- 作廢的銷退單不計：作廢 e0a5 後再退油 3 @ 900 → 累計 6,300 + 2,700 = 9,000，成功
  perform erp_void_document('00000000-0000-0000-0000-00000000e0a5', '測試');
  perform erp_post_document('00000000-0000-0000-0000-00000000e0a8');
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000e0a8') = 'posted', '作廢後可再退';
  raise notice 'ok  銷退累計金額上限（0028）';
end $$;

-- ============================================================
-- 11) 0 元沖抵單、溢收轉預收、退款單（#249，0029）——#238 §4 N-2 完整重現
--     S 321,300 收 20,000（沖 S）→ 全退 SR 7,650 + 313,650；另 S3 10,500 未收 → 客戶淨額 −9,500
-- ============================================================
insert into mx_customers (id, name, code) values ('00000000-0000-0000-0000-00000000d238', '兆泰測試', 'KK897');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e238', 'S', '2026-10-01', '00000000-0000-0000-0000-00000000d238', erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-00000000e23b', 'S', '2026-10-02', '00000000-0000-0000-0000-00000000d238', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f2380001', '00000000-0000-0000-0000-00000000e238', 1, 'item', '00000000-0000-0000-0000-00000000c004', 2, 160650),
  ('00000000-0000-0000-0000-0000f23b0001', '00000000-0000-0000-0000-00000000e23b', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 10500);
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e239', 'SR', '2026-10-05', '00000000-0000-0000-0000-00000000d238', erp_test.main(), '00000000-0000-0000-0000-00000000e238', 'exempt'),
  ('00000000-0000-0000-0000-00000000e23a', 'SR', '2026-10-05', '00000000-0000-0000-0000-00000000d238', erp_test.main(), '00000000-0000-0000-0000-00000000e238', 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-00000000e239', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 7650,   '00000000-0000-0000-0000-0000f2380001'),
  ('00000000-0000-0000-0000-00000000e23a', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 313650, '00000000-0000-0000-0000-0000f2380001');

do $$
declare v jsonb; pb record;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e238');
  perform erp_post_document('00000000-0000-0000-0000-00000000e23b');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-00000000d238","method":"transfer","amount":20000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e238","amount":20000}]}');
  perform set_config('erp_test.rc238', v->>'id', true);
  perform erp_post_document('00000000-0000-0000-0000-00000000e239');
  perform erp_post_document('00000000-0000-0000-0000-00000000e23a');

  -- 重現：應收 −9,500、預收 0
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.balance = -9500 and pb.unallocated = 0, format('沖抵前 %s', pb);
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e238') = 301300, 'S 未沖 301,300';
  raise notice 'ok  #238 重現：應收 −9,500、預收 0';
end $$;

-- 金額為負：擋
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":-1}')$q$, 'validation');
-- 金額 0 但沒有沖銷：擋
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0}')$q$, 'validation');
-- 金額 0 但沒有負數單據（只沖 S）：擋
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":10500}]}')$q$, 'validation');
-- 不可憑空產生預收：只沖 SR（S、S3 仍未沖清）→ 擋
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e239","amount":-7650}]}')$q$, 'validation');
-- 不可憑空產生預收：SR 全部 + S，但 S3 未沖 → 擋（訊息列出 S3）
do $$
declare v_detail text;
begin
  begin
    perform erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e239","amount":-7650},{"document_id":"00000000-0000-0000-0000-00000000e23a","amount":-313650},{"document_id":"00000000-0000-0000-0000-00000000e238","amount":301300}]}');
    raise exception '預期 validation 但成功';
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert sqlerrm = 'validation' and v_detail like '%須先沖清所有未結銷貨單%' and v_detail like '%S11510002%',
      format('R3 訊息 %s / %s', sqlerrm, v_detail);
  end;
end $$;
-- 沖抵合計為正（> 金額 0）：超沖
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e239","amount":-7650},{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":10500}]}')$q$, 'over_allocation');
-- 沒有預收時不能退款（SR 的負數餘額不能直接退）
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"transfer","amount":1}')$q$, 'over_allocation');

do $$
declare v jsonb; pb record; p record;
begin
  assert (select count(*) from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d238') = 1, '失敗的沖抵單不應留下';

  -- 0 元沖抵：SR 7,650 + SR 313,650 沖 S 301,300 + S3 10,500，合計 −9,500 → 預收 9,500
  -- 傳入 check 也會被正規化為 other、不存票號
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"check","check_no":"X","check_due_date":"2026-11-01","bank":"B","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e239","amount":-7650},{"document_id":"00000000-0000-0000-0000-00000000e23a","amount":-313650},{"document_id":"00000000-0000-0000-0000-00000000e238","amount":301300},{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":10500}]}');
  perform set_config('erp_test.offset238', v->>'id', true);
  select * into p from erp_payments where id = (v->>'id')::uuid;
  assert p.amount = 0 and p.kind = 'payment' and p.method = 'other' and p.check_no is null and p.bank is null
     and p.check_status is null and p.doc_no like 'RC11510%', format('沖抵單 %s', row_to_json(p));

  assert not exists (select 1 from erp_document_balances where customer_id = '00000000-0000-0000-0000-00000000d238' and outstanding <> 0),
    '沖抵後所有單據沖清';
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.balance = 0 and pb.unallocated = 9500, format('沖抵後應收 0、預收 9,500：%s', pb);
  -- 原收款與其沖銷不動
  assert (select sum(amount) from erp_payment_allocations where payment_id = current_setting('erp_test.rc238')::uuid) = 20000, 'RC 沖銷不變';
  raise notice 'ok  0 元沖抵 → 應收 0、預收 9,500';
end $$;

-- 沖抵單已無可沖額度；補沖銷消耗預收不受 R3 限制（另見下方）
-- 退款：方式需為匯款／現金／支票；金額需 > 0；超過預收擋
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":100}')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"transfer","amount":0}')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"check","amount":100}')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","vendor_id":"00000000-0000-0000-0000-00000000b001","method":"cash","amount":100}')$q$, 'validation');
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"transfer","amount":9500.01}')$q$, 'over_allocation');

do $$
declare v jsonb; pb record; r record;
begin
  -- 退款 9,500 → 預收 0
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"transfer","amount":9500,"bank":"台灣銀行","note":"退還溢收"}');
  assert v->>'doc_no' = 'RF11510001', format('RF 單號 %s', v);
  perform set_config('erp_test.rf238', v->>'id', true);
  select * into r from erp_payments where id = (v->>'id')::uuid;
  assert r.kind = 'refund' and r.direction = 'in' and r.amount = 9500 and r.status = 'posted', format('退款單 %s', row_to_json(r));
  assert (select count(*) from erp_refund_sources where refund_id = r.id) = 1
     and (select source_payment_id from erp_refund_sources where refund_id = r.id) = current_setting('erp_test.offset238')::uuid,
    '退款來源 = 沖抵單';
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.balance = 0 and pb.unallocated = 0, format('退款後預收 0：%s', pb);
  raise notice 'ok  退款 9,500 → 預收 0';
end $$;

-- 預收已用完：再退 1 元擋；退款單不能沖銷；沖抵單已退款不能作廢；沖抵單無額度可補沖
select erp_test.expect_error($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"cash","amount":1}')$q$, 'over_allocation');
select erp_test.expect_error(format($q$select erp_allocate_payment(%L, '[{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":1}]')$q$, current_setting('erp_test.rf238')), 'validation');
select erp_test.expect_error(format($q$select erp_void_payment(%L, '測試')$q$, current_setting('erp_test.offset238')), 'has_dependents');
-- 有沖抵單沖銷的 S / SR 不可作廢
select erp_test.expect_error($q$select erp_void_document('00000000-0000-0000-0000-00000000e23a', '測試')$q$, 'has_dependents');

do $$
declare pb record;
begin
  -- 作廢退款單 → 預收還原 9,500
  perform erp_void_payment(current_setting('erp_test.rf238')::uuid, '退款取消');
  assert (select count(*) from erp_refund_sources where refund_id = current_setting('erp_test.rf238')::uuid) = 0, '退款來源刪除';
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.balance = 0 and pb.unallocated = 9500, format('作廢退款後預收 9,500：%s', pb);

  -- 作廢沖抵單 → 回到沖抵前：應收 −9,500、預收 0
  perform erp_void_payment(current_setting('erp_test.offset238')::uuid, '沖抵重做');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.balance = -9500 and pb.unallocated = 0, format('作廢沖抵後 %s', pb);
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e238') = 301300, 'S 還原';
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e23a') = -313650, 'SR 還原';
  raise notice 'ok  作廢退款 / 沖抵單後還原';
end $$;
select erp_test.expect_error(format($q$select erp_void_payment(%L, '再一次')$q$, current_setting('erp_test.rf238')), 'not_posted');

-- 補沖銷產生預收也適用 R3；FIFO 退款橫跨多張來源
do $$
declare v jsonb; pid uuid; pb record; n int;
begin
  -- 0 元沖抵只沖 SR 7,650 對 S3 7,650（合計 0，不產生預收；S3 剩 2,850）
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d238","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e239","amount":-7650},{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":7650}]}');
  pid := (v->>'id')::uuid;
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.unallocated = 0 and pb.balance = -9500, format('純沖抵不產生預收 %s', pb);
  -- 補沖銷：SR2 −313,650 沖 S 301,300 + S3 2,850 → 本次合計 −9,500，S 全清 → 預收 9,500
  perform erp_allocate_payment(pid, '[{"document_id":"00000000-0000-0000-0000-00000000e23a","amount":-313650},{"document_id":"00000000-0000-0000-0000-00000000e238","amount":301300},{"document_id":"00000000-0000-0000-0000-00000000e23b","amount":2850}]');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.unallocated = 9500 and pb.balance = 0, format('補沖銷後 %s', pb);
  assert (select amount - (select sum(amount) from erp_payment_allocations where payment_id = pid) from erp_payments where id = pid) = 9500,
    '預收掛在沖抵單上';

  -- 另收一筆預收 1,000（較晚）→ 退款 10,000：先扣沖抵單 9,500，再扣 RC 500
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-14","customer_id":"00000000-0000-0000-0000-00000000d238","method":"cash","amount":1000}');
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-15","customer_id":"00000000-0000-0000-0000-00000000d238","method":"check","amount":10000,"check_no":"RF-CHK","check_due_date":"2026-10-30","bank":"一銀"}');
  assert (select check_status from erp_payments where id = (v->>'id')::uuid) = 'pending', '退款支票預設 pending';
  select count(*) into n from erp_refund_sources where refund_id = (v->>'id')::uuid;
  assert n = 2, format('退款來源 2 筆，得 %s', n);
  assert (select amount from erp_refund_sources where refund_id = (v->>'id')::uuid and source_payment_id = pid) = 9500, 'FIFO 先扣沖抵單';
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.unallocated = 500, format('剩預收 500：%s', pb);
  -- 被部分退款的 RC 補沖銷：可用額度只剩 500（1,000 − 退 500）
  perform set_config('erp_test.rc_late', (select id::text from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d238' and pay_date = '2026-10-14'), true);
  raise notice 'ok  補沖銷轉預收 / FIFO 退款';
end $$;

-- 新銷貨 600：被退款 500 的 RC（1,000）只剩 500 可沖 → 沖 600 超過
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e23c', 'S', '2026-10-16', '00000000-0000-0000-0000-00000000d238', erp_test.main(), 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-00000000e23c', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 600);
select erp_post_document('00000000-0000-0000-0000-00000000e23c');
select erp_test.expect_error(format($q$select erp_allocate_payment(%L, '[{"document_id":"00000000-0000-0000-0000-00000000e23c","amount":600}]')$q$, current_setting('erp_test.rc_late')), 'over_allocation');
do $$
declare pb record;
begin
  perform erp_allocate_payment(current_setting('erp_test.rc_late')::uuid, '[{"document_id":"00000000-0000-0000-0000-00000000e23c","amount":500}]');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d238';
  assert pb.unallocated = 0 and pb.balance = 100, format('沖 500 後 %s', pb);
  raise notice 'ok  被退款的收款可沖額度扣除已退款';
end $$;

-- 付款端比照：0 元沖抵（PR 沖 I）、廠商退款 VR
insert into erp_vendors (id, code, name) values ('00000000-0000-0000-0000-00000000b249', 'V249', '退款測試廠商');
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e249', 'I', '2026-10-01', '00000000-0000-0000-0000-00000000b249', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f2490001', '00000000-0000-0000-0000-00000000e249', 1, 'item', '00000000-0000-0000-0000-00000000c003', 10, 1000);
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e24a', 'PR', '2026-10-05', '00000000-0000-0000-0000-00000000b249', erp_test.main(), '00000000-0000-0000-0000-00000000e249', 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-00000000e24a', 1, 'item', '00000000-0000-0000-0000-00000000c003', 10, 1000, '00000000-0000-0000-0000-0000f2490001');

do $$
declare v jsonb; pb record;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e249');
  -- 付 3,000（沖 I）→ 全數退貨 PR 10,000 → 淨額 −3,000（預付 0、應付 −3,000）
  v := erp_post_payment('{"direction":"out","pay_date":"2026-10-02","vendor_id":"00000000-0000-0000-0000-00000000b249","method":"transfer","amount":3000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e249","amount":3000}]}');
  perform erp_post_document('00000000-0000-0000-0000-00000000e24a');
  select * into pb from erp_party_balances where party_type = 'vendor' and party_id = '00000000-0000-0000-0000-00000000b249';
  assert pb.balance = -3000 and pb.unallocated = 0, format('付款端沖抵前 %s', pb);
  -- 0 元沖抵：PR −10,000 沖 I 7,000 → 預付 3,000
  v := erp_post_payment('{"direction":"out","pay_date":"2026-10-13","vendor_id":"00000000-0000-0000-0000-00000000b249","method":"transfer","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e24a","amount":-10000},{"document_id":"00000000-0000-0000-0000-00000000e249","amount":7000}]}');
  assert v->>'doc_no' like 'PM11510%', format('付款沖抵單號 %s', v);
  select * into pb from erp_party_balances where party_type = 'vendor' and party_id = '00000000-0000-0000-0000-00000000b249';
  assert pb.balance = 0 and pb.unallocated = 3000, format('付款端沖抵後 %s', pb);
  -- 廠商退款 3,000 → 預付 0
  v := erp_post_refund('{"direction":"out","pay_date":"2026-10-13","vendor_id":"00000000-0000-0000-0000-00000000b249","method":"transfer","amount":3000}');
  assert v->>'doc_no' = 'VR11510001', format('VR 單號 %s', v);
  select * into pb from erp_party_balances where party_type = 'vendor' and party_id = '00000000-0000-0000-0000-00000000b249';
  assert pb.balance = 0 and pb.unallocated = 0, format('廠商退款後 %s', pb);
  raise notice 'ok  付款端 0 元沖抵 / 廠商退款';
end $$;
select erp_test.expect_error($q$select erp_post_refund('{"direction":"out","pay_date":"2026-10-13","vendor_id":"00000000-0000-0000-0000-00000000b249","method":"cash","amount":1}')$q$, 'over_allocation');
select erp_test.assert_ledger('vendor', '00000000-0000-0000-0000-00000000b249', '付款端 #249 結束');
select erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d238', '#238 結束');

-- ============================================================
-- 12) #249 review：沖銷與單據同號、操作序列後帳務不變式
--     S1 100,000、S2 50,000；支票 RC 20,000 沖 S1 → SR 30,000（退 S1）→ 0 元沖抵（SR 沖 S1、S2，合計 −20,000 → 預收）
--     → 退款 → 作廢退款 → 補沖銷 → 作廢沖抵單 → 退票作廢原收款；每一步檢查 erp_test.assert_ledger
-- ============================================================
insert into mx_customers (id, name, code) values ('00000000-0000-0000-0000-00000000d24a', '不變式測試', 'INV249');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e250', 'S', '2026-10-01', '00000000-0000-0000-0000-00000000d24a', erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-00000000e251', 'S', '2026-10-02', '00000000-0000-0000-0000-00000000d24a', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000f2500001', '00000000-0000-0000-0000-00000000e250', 1, 'item', '00000000-0000-0000-0000-00000000c004', 10, 10000),
  ('00000000-0000-0000-0000-0000f2510001', '00000000-0000-0000-0000-00000000e251', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 50000);
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-00000000e252', 'SR', '2026-10-05', '00000000-0000-0000-0000-00000000d24a', erp_test.main(), '00000000-0000-0000-0000-00000000e250', 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-00000000e252', 1, 'item', '00000000-0000-0000-0000-00000000c004', 3, 10000, '00000000-0000-0000-0000-0000f2500001');

do $$
declare v jsonb;
begin
  perform erp_post_document('00000000-0000-0000-0000-00000000e250');
  perform erp_post_document('00000000-0000-0000-0000-00000000e251');
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '銷貨');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"check","check_no":"INV-1","check_due_date":"2026-11-30","amount":20000,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e250","amount":20000}]}');
  perform set_config('erp_test.inv_rc', v->>'id', true);
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '支票收款沖銷');
  perform erp_post_document('00000000-0000-0000-0000-00000000e252');
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '銷退');
end $$;

-- 同號：沒有銷退時，以 S1 負數沖銷「搬走」RC 的沖銷來湊成 0 元沖抵單 → 擋（否則作廢 RC 後 S1 會超沖）
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e250","amount":-20000},{"document_id":"00000000-0000-0000-0000-00000000e251","amount":20000}]}')$q$, 'over_allocation');
-- 一般收款也不可對 S 負數沖銷；SR 不可正數沖銷
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"cash","amount":100,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e250","amount":-1000},{"document_id":"00000000-0000-0000-0000-00000000e251","amount":1100}]}')$q$, 'over_allocation');
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"cash","amount":100,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e252","amount":100}]}')$q$, 'over_allocation');
-- 沖銷金額四捨五入到分：0.004 視為 0
select erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"cash","amount":100,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e251","amount":0.004}]}')$q$, 'validation');

do $$
declare v jsonb; pb record; v_off uuid;
begin
  assert (select count(*) from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d24a') = 1, '失敗的收款不應留下';
  -- 0 元沖抵：SR −30,000 沖 S1 80,000？不行（合計為正 > 0）；SR −30,000 沖 S2 10,000 → 合計 −20,000，S1 未清 → R3 擋
  perform erp_test.expect_error($q$select erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e252","amount":-30000},{"document_id":"00000000-0000-0000-0000-00000000e251","amount":10000}]}')$q$, 'validation');
  -- 純沖抵（合計 0）：SR −30,000 沖 S2 30,000
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-13","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-00000000e252","amount":-30000},{"document_id":"00000000-0000-0000-0000-00000000e251","amount":30000}]}');
  v_off := (v->>'id')::uuid;
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '純沖抵');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d24a';
  assert pb.balance = 100000 and pb.unallocated = 0, format('純沖抵後 %s', pb);

  -- 另收預收 5,000（不沖銷）→ 退款 3,000 被擋（#253：未結應收 100,000 ≥ 預收，可退上限 0）→ 補沖銷 S2 5,000
  -- （退款 → 作廢退款的不變式改在第 13 節的無未結應收情境檢查）
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-14","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"cash","amount":5000}');
  perform set_config('erp_test.inv_adv', v->>'id', true);
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '預收');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-15","customer_id":"00000000-0000-0000-0000-00000000d24a","method":"cash","amount":3000}')$q$,
    'validation', array['可退上限 0.00', '預收 5,000.00', '未結應收 100,000.00']);
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '退款被擋');
  perform erp_allocate_payment(current_setting('erp_test.inv_adv')::uuid, '[{"document_id":"00000000-0000-0000-0000-00000000e251","amount":5000}]');
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '補沖銷');

  -- 作廢沖抵單 → SR、S2 還原
  perform erp_void_payment(v_off, '重做');
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '作廢沖抵單');
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e252') = -30000, 'SR 還原';

  -- 支票退票 → 作廢原收款：S1 回到 100,000（不超沖），淨額仍一致
  update erp_payments set check_status = 'bounced' where id = current_setting('erp_test.inv_rc')::uuid;
  perform erp_void_payment(current_setting('erp_test.inv_rc')::uuid, '退票');
  perform erp_test.assert_ledger('customer', '00000000-0000-0000-0000-00000000d24a', '退票作廢原收款');
  assert (select outstanding from erp_document_balances where document_id = '00000000-0000-0000-0000-00000000e250') = 100000, 'S1 還原';
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d24a';
  -- 單據 100,000 + 50,000 − 30,000 = 120,000；收款 5,000（已沖 S2）→ 淨額 115,000
  assert pb.balance = 115000 and pb.unallocated = 0, format('最後 %s', pb);
  raise notice 'ok  #249 review：同號規則、操作序列後帳務不變式';
end $$;

-- ============================================================
-- 13) #253 退款上限 = max(0, 預收 − 未結應收淨額)（0030）；未結應收淨額 ≤ 0 時上限即預收（R5）
--     每一步檢查 erp_test.assert_ledger
-- ============================================================
insert into mx_customers (id, name, code) values
  ('00000000-0000-0000-0000-0000253d0001', '退款上限測試', 'CAP253'),
  ('00000000-0000-0000-0000-0000253d0002', '負數應收測試', 'NEG253'),
  ('00000000-0000-0000-0000-0000253d0003', 'D1 重現', 'D1253');
insert into erp_vendors (id, code, name) values ('00000000-0000-0000-0000-0000253b0001', 'V253', '退款上限廠商');
insert into erp_documents (id, doc_type, doc_date, customer_id, vendor_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-0000253e0001', 'S', '2026-10-01', '00000000-0000-0000-0000-0000253d0001', null, erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-0000253e0002', 'S', '2026-10-02', '00000000-0000-0000-0000-0000253d0001', null, erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-0000253e0011', 'S', '2026-10-01', '00000000-0000-0000-0000-0000253d0002', null, erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-0000253e0021', 'S', '2026-10-01', '00000000-0000-0000-0000-0000253d0003', null, erp_test.main(), 'exempt'),
  ('00000000-0000-0000-0000-0000253e0031', 'I', '2026-10-01', null, '00000000-0000-0000-0000-0000253b0001', erp_test.main(), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000253f0001', '00000000-0000-0000-0000-0000253e0001', 1, 'item', '00000000-0000-0000-0000-00000000c004', 10, 1000),
  ('00000000-0000-0000-0000-0000253f0002', '00000000-0000-0000-0000-0000253e0002', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 3000),
  ('00000000-0000-0000-0000-0000253f0011', '00000000-0000-0000-0000-0000253e0011', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 1000),
  ('00000000-0000-0000-0000-0000253f0021', '00000000-0000-0000-0000-0000253e0021', 1, 'item', '00000000-0000-0000-0000-00000000c004', 2, 15000),
  ('00000000-0000-0000-0000-0000253f0031', '00000000-0000-0000-0000-0000253e0031', 1, 'item', '00000000-0000-0000-0000-00000000c003', 5, 1000);
insert into erp_documents (id, doc_type, doc_date, customer_id, vendor_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-0000253e0003', 'SR', '2026-10-05', '00000000-0000-0000-0000-0000253d0001', null, erp_test.main(), '00000000-0000-0000-0000-0000253e0001', 'exempt'),
  ('00000000-0000-0000-0000-0000253e0012', 'SR', '2026-10-05', '00000000-0000-0000-0000-0000253d0002', null, erp_test.main(), '00000000-0000-0000-0000-0000253e0011', 'exempt'),
  ('00000000-0000-0000-0000-0000253e0022', 'SR', '2026-10-05', '00000000-0000-0000-0000-0000253d0003', null, erp_test.main(), '00000000-0000-0000-0000-0000253e0021', 'exempt'),
  ('00000000-0000-0000-0000-0000253e0032', 'PR', '2026-10-05', null, '00000000-0000-0000-0000-0000253b0001', erp_test.main(), '00000000-0000-0000-0000-0000253e0031', 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000253e0003', 1, 'item', '00000000-0000-0000-0000-00000000c004', 4, 1000,  '00000000-0000-0000-0000-0000253f0001'),
  ('00000000-0000-0000-0000-0000253e0012', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 1000,  '00000000-0000-0000-0000-0000253f0011'),
  ('00000000-0000-0000-0000-0000253e0022', 1, 'item', '00000000-0000-0000-0000-00000000c004', 1, 15000, '00000000-0000-0000-0000-0000253f0021'),
  ('00000000-0000-0000-0000-0000253e0032', 1, 'item', '00000000-0000-0000-0000-00000000c003', 2, 1000,  '00000000-0000-0000-0000-0000253f0031');

-- 13a 客戶：無未結應收 → 可全退；有未結應收 → 上限 = 預收 − 未結應收；SR 負數降低未結應收
do $$
declare v jsonb; pb record; c constant uuid := '00000000-0000-0000-0000-0000253d0001';
begin
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-01","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"cash","amount":5000}');
  perform erp_test.assert_ledger('customer', c, '13a 預收 5,000');
  -- 無未結應收：全額 5,000 可退 → 作廢退款還原
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-02","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":5000}');
  perform erp_test.assert_ledger('customer', c, '13a 無未結應收全退');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 0 and pb.unallocated = 0, format('13a 全退後 %s', pb);
  perform erp_void_payment((v->>'id')::uuid, '測試');
  perform erp_test.assert_ledger('customer', c, '13a 作廢退款');

  -- 銷貨 3,000 未收：預收 5,000 − 未結應收 3,000 → 上限 2,000
  perform erp_post_document('00000000-0000-0000-0000-0000253e0002');
  perform erp_test.assert_ledger('customer', c, '13a 銷貨 3,000');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":2000.01}')$q$,
    'validation', array['退款金額 2,000.01', '可退上限 2,000.00', '預收 5,000.00', '未結應收 3,000.00', '補沖銷']);
  -- 同時超過預收：仍給上限訊息（一次給齊）
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":6000}')$q$,
    'validation', array['可退上限 2,000.00']);
  perform erp_test.assert_ledger('customer', c, '13a 超過上限被擋');
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":2000}');
  perform erp_test.assert_ledger('customer', c, '13a 退到上限');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 3000 and pb.unallocated = 3000, format('13a 退 2,000 後 %s', pb);
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-03","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"cash","amount":0.01}')$q$,
    'validation', array['可退上限 0.00', '預收 3,000.00', '未結應收 3,000.00']);

  -- 再銷貨 10,000、銷退 4,000（SR 未沖，負數）、另收預收 8,000：
  -- 未結應收 = 3,000 + 10,000 − 4,000 = 9,000；預收 3,000 + 8,000 = 11,000 → 上限 2,000（不計 SR 時會是 0）
  perform erp_post_document('00000000-0000-0000-0000-0000253e0001');
  perform erp_post_document('00000000-0000-0000-0000-0000253e0003');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-06","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"cash","amount":8000}');
  perform erp_test.assert_ledger('customer', c, '13a 銷退未沖 + 預收');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 9000 and pb.unallocated = 11000, format('13a SR 後 %s', pb);
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":2000.01}')$q$,
    'validation', array['可退上限 2,000.00', '預收 11,000.00', '未結應收 9,000.00']);
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0001","method":"transfer","amount":2000}');
  perform erp_test.assert_ledger('customer', c, '13a SR 負數計入後退到上限');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 9000 and pb.unallocated = 9000, format('13a 最後 %s', pb);
  raise notice 'ok  #253 客戶退款上限（無未結全退／有未結上限／SR 負數）';
end $$;

-- 13b 客戶：未結應收淨額為負（銷退貸項未轉預收）→ 上限仍為預收（R5，over_allocation）
do $$
declare v jsonb; pb record; c constant uuid := '00000000-0000-0000-0000-0000253d0002';
begin
  perform erp_post_document('00000000-0000-0000-0000-0000253e0011');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-02","customer_id":"00000000-0000-0000-0000-0000253d0002","method":"cash","amount":1000,"allocations":[{"document_id":"00000000-0000-0000-0000-0000253e0011","amount":1000}]}');
  perform erp_post_document('00000000-0000-0000-0000-0000253e0012');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-06","customer_id":"00000000-0000-0000-0000-0000253d0002","method":"cash","amount":500}');
  perform erp_test.assert_ledger('customer', c, '13b 應收 −1,000、預收 500');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = -1000 and pb.unallocated = 500, format('13b %s', pb);
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0002","method":"cash","amount":500.01}')$q$,
    'over_allocation', array['超過預收餘額']);
  v := erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0002","method":"cash","amount":500}');
  perform erp_test.assert_ledger('customer', c, '13b 退到預收');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0002","method":"cash","amount":1}')$q$,
    'over_allocation', array['超過預收餘額']);
  raise notice 'ok  #253 未結應收為負時上限為預收';
end $$;

-- 13c D1 重現：沖抵轉預收 5,000 後作廢原收款 → 應收回到 20,000，0029 仍可退 5,000，0030 擋下
do $$
declare v jsonb; pb record; v_rc uuid; c constant uuid := '00000000-0000-0000-0000-0000253d0003';
begin
  perform erp_post_document('00000000-0000-0000-0000-0000253e0021');
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-02","customer_id":"00000000-0000-0000-0000-0000253d0003","method":"transfer","amount":20000,"allocations":[{"document_id":"00000000-0000-0000-0000-0000253e0021","amount":20000}]}');
  v_rc := (v->>'id')::uuid;
  perform erp_post_document('00000000-0000-0000-0000-0000253e0022');
  -- 0 元沖抵：SR −15,000 沖 S 10,000 → 預收 5,000
  v := erp_post_payment('{"direction":"in","pay_date":"2026-10-06","customer_id":"00000000-0000-0000-0000-0000253d0003","method":"other","amount":0,"allocations":[{"document_id":"00000000-0000-0000-0000-0000253e0022","amount":-15000},{"document_id":"00000000-0000-0000-0000-0000253e0021","amount":10000}]}');
  perform erp_test.assert_ledger('customer', c, '13c 沖抵後');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 0 and pb.unallocated = 5000, format('13c 沖抵後 %s', pb);
  perform erp_void_payment(v_rc, '退票');
  perform erp_test.assert_ledger('customer', c, '13c 作廢原收款');
  select * into pb from erp_party_balances where party_type = 'customer' and party_id = c;
  assert pb.balance = 20000 and pb.unallocated = 5000, format('13c 作廢原收款後 %s', pb);
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"in","pay_date":"2026-10-07","customer_id":"00000000-0000-0000-0000-0000253d0003","method":"transfer","amount":5000}')$q$,
    'validation', array['可退上限 0.00', '預收 5,000.00', '未結應收 20,000.00']);
  perform erp_test.assert_ledger('customer', c, '13c 退款被擋');
  raise notice 'ok  #253 D1 重現：作廢原收款後不可退款';
end $$;

-- 13d 廠商比照：預付 − 未結應付；PR 負數降低未結應付
do $$
declare v jsonb; pb record; b constant uuid := '00000000-0000-0000-0000-0000253b0001';
begin
  perform erp_post_document('00000000-0000-0000-0000-0000253e0031');
  v := erp_post_payment('{"direction":"out","pay_date":"2026-10-02","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"transfer","amount":8000}');
  perform erp_test.assert_ledger('vendor', b, '13d 應付 5,000、預付 8,000');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"out","pay_date":"2026-10-03","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"transfer","amount":3000.01}')$q$,
    'validation', array['退款金額 3,000.01', '可退上限 3,000.00', '預付 8,000.00', '未結應付 5,000.00', '把預付沖到未結單據']);
  v := erp_post_refund('{"direction":"out","pay_date":"2026-10-03","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"transfer","amount":3000}');
  perform erp_test.assert_ledger('vendor', b, '13d 退到上限');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"out","pay_date":"2026-10-03","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"cash","amount":1}')$q$,
    'validation', array['可退上限 0.00', '預付 5,000.00', '未結應付 5,000.00']);
  -- 進退 2,000（PR 未沖）→ 未結應付 3,000、預付 5,000 → 上限 2,000
  perform erp_post_document('00000000-0000-0000-0000-0000253e0032');
  perform erp_test.assert_ledger('vendor', b, '13d 進退');
  perform erp_test.expect_detail($q$select erp_post_refund('{"direction":"out","pay_date":"2026-10-06","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"cash","amount":2000.01}')$q$,
    'validation', array['可退上限 2,000.00', '未結應付 3,000.00']);
  v := erp_post_refund('{"direction":"out","pay_date":"2026-10-06","vendor_id":"00000000-0000-0000-0000-0000253b0001","method":"cash","amount":2000}');
  perform erp_test.assert_ledger('vendor', b, '13d PR 負數計入後退到上限');
  select * into pb from erp_party_balances where party_type = 'vendor' and party_id = b;
  assert pb.balance = 3000 and pb.unallocated = 3000, format('13d 最後 %s', pb);
  raise notice 'ok  #253 廠商退款上限';
end $$;

-- 未授權：退款 RPC forbidden；anon 無執行權限、看不到退款來源
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select erp_test.expect_error($q$select erp_post_refund('{}'::jsonb)$q$, 'forbidden');
do $$ begin
  assert (select count(*) from erp_refund_sources) = 0, '未授權者看不到退款來源';
end $$;
set local role anon;
select erp_test.expect_error($q$select erp_post_refund('{}'::jsonb)$q$, '42501');
select erp_test.expect_error($q$select * from erp_refund_sources$q$, '42501');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  assert (select count(*) from erp_refund_sources) > 0, 'erp 使用者看得到退款來源';
  raise notice 'ok  退款權限';
end $$;

reset role;
do $$ begin
  assert exists (select 1 from mx_customers where id = '00000000-0000-0000-0000-00000000d009'), 'mx_customers 未被刪';
  assert exists (select 1 from mx_machines where id = '00000000-0000-0000-0000-00000000aa09'), 'mx_machines 未被刪';
  assert (select count(*) from mx_records where machine_id = '00000000-0000-0000-0000-00000000aa09') = 1, 'mx_records 未被 cascade 刪除';
  -- 受信任身分（postgres / service_role）不受草稿觸發器限制
  update erp_documents set note = '維運備註' where id = '00000000-0000-0000-0000-00000000e009';
end $$;

do $$ begin raise notice '==== erp_posting_test：全部斷言通過 ===='; end $$;

rollback;
