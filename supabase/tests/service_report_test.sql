-- service_report_test.sql
-- 機台維護報告單 SQL 測試（issue #191，spec §8）。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。
-- 正式 DB 執行前需使用者確認。
--
-- 模擬方式：set local role authenticated + request.jwt.claims（sub = 測試使用者 id）。
-- 斷言：DO block 內 assert；預期錯誤以 sr_test.expect_error(sql, code) 檢查
--       （code 比對 SQLERRM，或比對 SQLSTATE，如權限不足 42501、重複 23505）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（以 postgres 身分建立）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'office@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000002', 'admin@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000003', 'sr-only@airexpert.com.tw');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-000000000001', 'office', 'office@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000002', 'admin',  'admin@airexpert.com.tw'),
  ('00000000-0000-0000-0000-000000000003', 'erp',    'sr-only@airexpert.com.tw');

-- 重跑 migration 的 seed 語句兩次（驗證冪等且只授權 office 帳號）
insert into admin_module_grants (user_id, module)
select id, 'service_report' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;
insert into admin_module_grants (user_id, module)
select id, 'service_report' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;
-- sr-only：只有 service_report、非 office、無 erp
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-000000000003', 'service_report');

create schema sr_test;

create function sr_test.expect_error(p_sql text, p_code text)
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

grant usage on schema sr_test to authenticated, anon, service_role;
grant execute on all functions in schema sr_test to authenticated, anon, service_role;

do $$ begin
  assert (select count(*) from admin_module_grants where module = 'service_report') = 2,
    'seed 冪等：office + 手動授權的 sr-only，共 2 列';
  assert (select count(*) from admin_module_grants
          where module = 'service_report' and user_id = '00000000-0000-0000-0000-000000000001') = 1,
    'office 應有 service_report';
end $$;

-- 模組檢查：未知模組被擋、erp 仍可
select sr_test.expect_error($q$insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-000000000002', 'bogus')$q$, '23514');
do $$ begin
  assert (select count(*) from pg_constraint
          where conrelid = 'admin_module_grants'::regclass and contype = 'c') = 1,
    'admin_module_grants 應只剩 1 個 check 約束';
end $$;

-- 保養卡資料（office 領域）
insert into mx_customers (id, name, code, phone, tax_id, contact_person, address) values
  ('00000000-0000-0000-0000-00000000d001', '華淨科技股份有限公司', 'KK855', '03-333-4444', '12345678', '林小姐', '桃園市中壢區測試路 1 號');
insert into mx_machines (id, customer_id, machine_no, serial_no, model, horsepower, voltage) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d001', '2', 'J751307001', 'SP50VH5', '50HP', '380V');

-- ============================================================
-- 1) office（有授權）：取號、新增、查詢、修改
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare v jsonb;
begin
  assert has_module('service_report'), 'office 應有 service_report';

  assert sr_next_report_no('2026-09-11') = 'X11509001', '第一號 X11509001';
  assert sr_next_report_no('2026-09-30') = 'X11509002', '同月遞增 X11509002';
  assert sr_next_report_no('2026-10-01') = 'X11510001', '跨月重新起算 X11510001';

  insert into sr_reports (id, report_no, report_date, customer_id, machine_id, customer_name, service_items)
  values ('00000000-0000-0000-0000-00000000e001', 'X11509001', '2026-09-11',
          '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000a1',
          '華淨科技股份有限公司', '{routine,periodic}');

  assert (select count(*) from sr_reports) = 1, 'office 可讀取報告單';
  assert (select status from sr_reports where id = '00000000-0000-0000-0000-00000000e001') = 'draft', '預設草稿';
  assert (select created_by from sr_reports where id = '00000000-0000-0000-0000-00000000e001')
         = '00000000-0000-0000-0000-000000000001', 'created_by 預設 auth.uid()';

  -- 預設料件 10 列
  v := (select parts from sr_reports where id = '00000000-0000-0000-0000-00000000e001');
  assert jsonb_array_length(v) = 10, 'parts 預設 10 列';
  assert (select array_agg(e->>'name' order by (e->>'no')::int) from jsonb_array_elements(v) e)
         = array['螺旋專用油','機油濾清器','空氣濾清器(外)','空氣濾清器(內)','油氣分離器',
                 '自動排水器','過濾器濾蕊','','','維護及保養工資'], 'parts 預設品名';
  assert (select array_agg((e->>'no')::int order by (e->>'no')::int) from jsonb_array_elements(v) e)
         = array[1,2,3,4,5,6,7,8,9,10], 'parts 編號 1–10';

  update sr_reports set summary = '更換機油', technician = '王師傅'
   where id = '00000000-0000-0000-0000-00000000e001';
  assert (select summary from sr_reports where id = '00000000-0000-0000-0000-00000000e001') = '更換機油', 'office 可修改';

  -- mx_* office 仍可讀
  assert (select count(*) from mx_customers) = 1 and (select count(*) from mx_machines) = 1, 'office 可讀 mx_*';
  raise notice 'ok  office 取號 / 新增 / 查詢 / 修改 / 預設料件';
end $$;

-- 單號 > 999 → 4 位
reset role;
update sr_sequences set last_no = 999 where period = '11509';
set local role authenticated;
do $$ begin
  assert sr_next_report_no('2026-09-11') = 'X115091000', '超過 999 → X115091000';
  raise notice 'ok  流水號超過 999 變 4 位';
end $$;

-- 單號重複（大小寫／前後空白不敏感）
select sr_test.expect_error($q$insert into sr_reports (report_no) values ('X11509001')$q$, '23505');
select sr_test.expect_error($q$insert into sr_reports (report_no) values ('  x11509001 ')$q$, '23505');

-- sr_sequences 用戶端不可直接存取
select sr_test.expect_error($q$select * from sr_sequences$q$, '42501');
select sr_test.expect_error($q$update sr_sequences set last_no = 0$q$, '42501');

-- 列舉檢查
-- status 列舉：API 角色會先被 insert 守門觸發器擋（validation），以受信任身分驗證 check 約束
select sr_test.expect_error($q$insert into sr_reports (report_no, status) values ('X-BAD-1', 'posted')$q$, 'validation');
reset role;
select sr_test.expect_error($q$insert into sr_reports (report_no, status) values ('X-BAD-1', 'posted')$q$, '23514');
set local role authenticated;
select sr_test.expect_error($q$insert into sr_reports (report_no, time_slot) values ('X-BAD-2', 'night')$q$, '23514');
select sr_test.expect_error($q$insert into sr_reports (report_no, machine_state) values ('X-BAD-3', 'broken')$q$, '23514');

-- ============================================================
-- 2) 刪除：未列印草稿可刪；已列印（或 print_count > 0）刪 0 列
-- ============================================================
insert into sr_reports (id, report_no) values
  ('00000000-0000-0000-0000-00000000e002', 'X11509101'),
  ('00000000-0000-0000-0000-00000000e003', 'X11509102'),
  ('00000000-0000-0000-0000-00000000e004', 'X11509103');
update sr_reports set status = 'printed', print_count = 1, first_printed_at = now(), last_printed_at = now()
 where id = '00000000-0000-0000-0000-00000000e003';
update sr_reports set print_count = 1 where id = '00000000-0000-0000-0000-00000000e004';  -- 草稿但已列印過

do $$
declare n int;
begin
  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e002';
  get diagnostics n = row_count;
  assert n = 1, '未列印草稿可刪除';

  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e003';
  get diagnostics n = row_count;
  assert n = 0, '已列印單不可刪除';

  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e004';
  get diagnostics n = row_count;
  assert n = 0, 'print_count > 0 的草稿不可刪除';
  raise notice 'ok  刪除限未列印草稿';
end $$;

-- ============================================================
-- 3) 作廢：需原因；作廢後不可修改；不可改 created_by／created_at
-- ============================================================
select sr_test.expect_error($q$update sr_reports set status = 'voided', voided_at = now() where id = '00000000-0000-0000-0000-00000000e003'$q$, '23514');
select sr_test.expect_error($q$update sr_reports set status = 'voided', voided_at = now(), void_reason = '   ' where id = '00000000-0000-0000-0000-00000000e003'$q$, '23514');
update sr_reports set status = 'voided', voided_at = now(), void_reason = '客戶取消'
 where id = '00000000-0000-0000-0000-00000000e003';
select sr_test.expect_error($q$update sr_reports set summary = 'x' where id = '00000000-0000-0000-0000-00000000e003'$q$, 'voided');
select sr_test.expect_error($q$update sr_reports set status = 'printed', void_reason = null where id = '00000000-0000-0000-0000-00000000e003'$q$, 'voided');
select sr_test.expect_error($q$update sr_reports set created_by = '00000000-0000-0000-0000-000000000002' where id = '00000000-0000-0000-0000-00000000e001'$q$, 'validation');
select sr_test.expect_error($q$update sr_reports set created_at = now() - interval '1 day' where id = '00000000-0000-0000-0000-00000000e001'$q$, 'validation');

do $$
declare n int;
begin
  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e003';
  get diagnostics n = row_count;
  assert n = 0, '作廢單不可刪除';
  assert (select status from sr_reports where id = '00000000-0000-0000-0000-00000000e003') = 'voided', '仍為作廢';
  raise notice 'ok  作廢需原因 / 作廢唯讀 / 建立者不可改';
end $$;

-- ============================================================
-- 4) 無授權使用者（admin）：看不到、不能寫、取號 forbidden
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare n int;
begin
  assert not has_module('service_report'), 'admin 不應有 service_report';
  assert (select count(*) from sr_reports) = 0, '無授權者看不到報告單';
  assert (select count(*) from mx_customers) = 0, '無授權者看不到 mx_customers';
  assert (select count(*) from mx_machines) = 0, '無授權者看不到 mx_machines';

  update sr_reports set summary = 'hack' where id = '00000000-0000-0000-0000-00000000e001';
  get diagnostics n = row_count;
  assert n = 0, '無授權者不能修改';
  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e004';
  get diagnostics n = row_count;
  assert n = 0, '無授權者不能刪除';
  raise notice 'ok  無授權者讀寫被擋';
end $$;
select sr_test.expect_error($q$insert into sr_reports (report_no) values ('X11509999')$q$, '42501');
select sr_test.expect_error($q$select sr_next_report_no('2026-09-11')$q$, 'forbidden');

-- anon：無表權限、無執行權限
set local role anon;
select sr_test.expect_error($q$select * from sr_reports$q$, '42501');
select sr_test.expect_error($q$select sr_next_report_no('2026-09-11')$q$, '42501');
set local role authenticated;

-- ============================================================
-- 5) sr-only（role 'erp'、只有 service_report 授權）：mx_* 只讀
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare n int;
begin
  assert has_module('service_report') and not has_module('erp') and not is_office(), 'sr-only 身分';
  assert (select count(*) from sr_reports) = 3, 'sr-only 可讀報告單（e001 / e003 / e004）';
  assert (select count(*) from mx_customers) = 1, 'sr-only 可讀 mx_customers';
  assert (select count(*) from mx_machines) = 1, 'sr-only 可讀 mx_machines';
  assert (select count(*) from mx_records) = 0, 'sr-only 看不到 mx_records';

  update mx_customers set name = 'hack' where id = '00000000-0000-0000-0000-00000000d001';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能修改 mx_customers';
  update mx_machines set model = 'hack' where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能修改 mx_machines';
  delete from mx_machines where id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能刪除 mx_machines';
  delete from mx_customers where id = '00000000-0000-0000-0000-00000000d001';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能刪除 mx_customers';

  -- 報告單可寫、可取號
  assert sr_next_report_no('2026-09-11') = 'X115091001', 'sr-only 取號接續';
  update sr_reports set technician = '李師傅' where id = '00000000-0000-0000-0000-00000000e001';
  get diagnostics n = row_count;
  assert n = 1, 'sr-only 可修改報告單';
  raise notice 'ok  sr-only：報告單可讀寫、mx_* 只讀';
end $$;
select sr_test.expect_error($q$insert into mx_customers (name) values ('hack')$q$, '42501');
select sr_test.expect_error($q$insert into mx_machines (customer_id, machine_no, serial_no) values ('00000000-0000-0000-0000-00000000d001', '9', 'HACK-1')$q$, '42501');

reset role;
do $$ begin
  assert (select name from mx_customers where id = '00000000-0000-0000-0000-00000000d001') = '華淨科技股份有限公司', 'mx_customers 未被改';
  assert (select model from mx_machines where id = '00000000-0000-0000-0000-0000000000a1') = 'SP50VH5', 'mx_machines 未被改';
  assert (select summary from sr_reports where id = '00000000-0000-0000-0000-00000000e001') = '更換機油', '無授權者修改未生效';
  assert exists (select 1 from sr_reports where id = '00000000-0000-0000-0000-00000000e004'), 'e004 未被刪';
end $$;
-- 作廢單唯讀對受信任身分同樣生效
select sr_test.expect_error($q$update sr_reports set note = 'x' where id = '00000000-0000-0000-0000-00000000e003'$q$, 'voided');

-- ============================================================
-- 6) 刪除被「作廢單」引用的機台／客戶：FK on delete set null 不被作廢唯讀擋下
-- ============================================================
insert into mx_customers (id, name, code) values
  ('00000000-0000-0000-0000-00000000d002', '測試客戶二', 'KK900'),
  ('00000000-0000-0000-0000-00000000d003', '測試客戶三', 'KK901');
insert into mx_machines (id, customer_id, machine_no, serial_no) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d002', '1', 'SR-DEL-A2'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000d003', '1', 'SR-DEL-A3');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into sr_reports (id, report_no, customer_id, machine_id) values
  ('00000000-0000-0000-0000-00000000e010', 'X11509201', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000e011', 'X11509202', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-0000000000a3');
update sr_reports set status = 'voided', voided_at = now(), void_reason = '測試作廢'
 where id in ('00000000-0000-0000-0000-00000000e010', '00000000-0000-0000-0000-00000000e011');

-- 作廢單其他修改仍擋（含夾帶 FK 欄位變更）
select sr_test.expect_error($q$update sr_reports set machine_id = null, summary = 'x' where id = '00000000-0000-0000-0000-00000000e010'$q$, 'voided');
select sr_test.expect_error($q$update sr_reports set customer_id = '00000000-0000-0000-0000-00000000d001' where id = '00000000-0000-0000-0000-00000000e010'$q$, 'voided');
select sr_test.expect_error($q$update sr_reports set status = 'draft', void_reason = null where id = '00000000-0000-0000-0000-00000000e010'$q$, 'voided');

do $$
declare n int;
begin
  -- office 永久刪除機台（保養卡）→ 作廢單 machine_id 變 NULL
  delete from mx_machines where id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 1, 'office 可刪除被作廢單引用的機台';
  assert (select machine_id from sr_reports where id = '00000000-0000-0000-0000-00000000e010') is null, '機台刪除 → machine_id NULL';
  assert (select customer_id from sr_reports where id = '00000000-0000-0000-0000-00000000e010')
         = '00000000-0000-0000-0000-00000000d002', 'customer_id 不受影響';

  -- 刪除客戶（連帶 cascade 刪除其機台）→ 作廢單 customer_id / machine_id 皆 NULL
  delete from mx_customers where id = '00000000-0000-0000-0000-00000000d003';
  get diagnostics n = row_count;
  assert n = 1, 'office 可刪除被作廢單引用的客戶';
  assert (select customer_id is null and machine_id is null from sr_reports
          where id = '00000000-0000-0000-0000-00000000e011'), '客戶刪除 → customer_id / machine_id NULL';
  assert (select status from sr_reports where id = '00000000-0000-0000-0000-00000000e011') = 'voided', '仍為作廢';
  raise notice 'ok  刪除作廢單引用的機台／客戶 → FK set null';
end $$;

reset role;
do $$
declare n int;
begin
  delete from mx_customers where id = '00000000-0000-0000-0000-00000000d002';
  get diagnostics n = row_count;
  assert n = 1, '受信任身分可刪除被作廢單引用的客戶';
  assert (select customer_id from sr_reports where id = '00000000-0000-0000-0000-00000000e010') is null, 'customer_id NULL';
end $$;

-- ============================================================
-- 7) 稽核軌跡：server action 流程可行；API 角色直接寫入竄改被擋
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- 新增：只能草稿、不可帶列印／結案／作廢紀錄；created_by 強制為 auth.uid()
select sr_test.expect_error($q$insert into sr_reports (report_no, status) values ('X-INS-1', 'printed')$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, status) values ('X-INS-2', 'completed')$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, status, void_reason) values ('X-INS-3', 'voided', 'x')$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, print_count) values ('X-INS-4', 99)$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, first_printed_at) values ('X-INS-5', now())$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, last_printed_at) values ('X-INS-6', now())$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, completed_at) values ('X-INS-7', now())$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, voided_at) values ('X-INS-8', now())$q$, 'validation');
select sr_test.expect_error($q$insert into sr_reports (report_no, void_reason) values ('X-INS-9', 'x')$q$, 'validation');

do $$
declare
  r sr_reports;
  n int;
  v_first timestamptz;
  v_last  timestamptz;
begin
  -- 新增草稿（server action 帶 status: 'draft'）；偽造 created_by 被改寫
  insert into sr_reports (id, report_no, status, created_by) values
    ('00000000-0000-0000-0000-00000000e020', 'X11509301', 'draft', '00000000-0000-0000-0000-00000000dead');
  select * into r from sr_reports where id = '00000000-0000-0000-0000-00000000e020';
  assert r.created_by = '00000000-0000-0000-0000-000000000001', 'created_by 強制為 auth.uid()';
  assert r.status = 'draft' and r.print_count = 0, '新增為未列印草稿';

  -- 編輯欄位（含草稿改單號）
  update sr_reports set summary = '編輯', report_no = 'X11509302'
   where id = r.id and status in ('draft','printed','completed');
  get diagnostics n = row_count;
  assert n = 1, '草稿可編輯（含單號）';

  -- 第一次列印：draft → printed
  update sr_reports set print_count = 1, first_printed_at = coalesce(first_printed_at, clock_timestamp()),
         last_printed_at = clock_timestamp(), status = 'printed'
   where id = r.id and status = 'draft' and print_count = 0;
  get diagnostics n = row_count;
  assert n = 1, '列印 draft → printed';
  select first_printed_at, last_printed_at into v_first, v_last from sr_reports where id = r.id;
  assert v_first is not null and v_last is not null, '列印時間已記錄';

  -- 第二次列印：first_printed_at 不變、last_printed_at 更新
  perform pg_sleep(0.01);
  update sr_reports set print_count = 2, first_printed_at = v_first,
         last_printed_at = clock_timestamp(), status = 'printed'
   where id = r.id and status = 'printed' and print_count = 1;
  get diagnostics n = row_count;
  assert n = 1, '再次列印';
  select * into r from sr_reports where id = r.id;
  assert r.print_count = 2 and r.first_printed_at = v_first and r.last_printed_at > v_last, '二次列印紀錄';

  -- 已列印仍可編輯內容（單號不變）
  update sr_reports set technician = '王師傅', report_no = 'X11509302' where id = r.id;

  -- 結案 → 結案後列印 → 重新開啟 → 再結案 → 作廢
  update sr_reports set status = 'completed', completed_at = now() where id = r.id and status = 'printed';
  get diagnostics n = row_count;
  assert n = 1, '結案 printed → completed';
  update sr_reports set print_count = 3, last_printed_at = clock_timestamp(), status = 'completed'
   where id = r.id and status = 'completed' and print_count = 2;
  get diagnostics n = row_count;
  assert n = 1, '結案後可列印（狀態不變）';
  update sr_reports set status = 'printed', completed_at = null where id = r.id and status = 'completed';
  get diagnostics n = row_count;
  assert n = 1, '重新開啟 completed → printed';
  update sr_reports set status = 'completed', completed_at = now() where id = r.id and status = 'printed';
  update sr_reports set status = 'voided', voided_at = now(), void_reason = '測試'
   where id = r.id and status in ('draft','printed','completed');
  get diagnostics n = row_count;
  assert n = 1, '作廢 completed → voided';

  -- 草稿直接作廢
  insert into sr_reports (id, report_no) values ('00000000-0000-0000-0000-00000000e021', 'X11509303');
  update sr_reports set status = 'voided', voided_at = now(), void_reason = '測試'
   where id = '00000000-0000-0000-0000-00000000e021';
  get diagnostics n = row_count;
  assert n = 1, '作廢 draft → voided';

  -- 刪除未列印草稿
  insert into sr_reports (id, report_no) values ('00000000-0000-0000-0000-00000000e022', 'X11509304');
  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e022' and status = 'draft' and print_count = 0;
  get diagnostics n = row_count;
  assert n = 1, '刪除未列印草稿';
  raise notice 'ok  server action 流程：新增 / 編輯 / 列印 / 結案 / 重新開啟 / 作廢 / 刪草稿';

  -- 竄改測試用：已列印 2 次的報告單 e023、草稿 e024
  insert into sr_reports (id, report_no) values
    ('00000000-0000-0000-0000-00000000e023', 'X11509305'),
    ('00000000-0000-0000-0000-00000000e024', 'X11509306');
  update sr_reports set print_count = 2, first_printed_at = now(), last_printed_at = now(), status = 'printed'
   where id = '00000000-0000-0000-0000-00000000e023';
end $$;

-- 列印紀錄不可竄改
select sr_test.expect_error($q$update sr_reports set print_count = 1 where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
select sr_test.expect_error($q$update sr_reports set first_printed_at = null where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
select sr_test.expect_error($q$update sr_reports set first_printed_at = now() - interval '1 day' where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
select sr_test.expect_error($q$update sr_reports set status = 'draft' where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
select sr_test.expect_error($q$update sr_reports set report_no = 'X11509399' where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
-- 審查者情境：重設為未列印草稿後刪除
select sr_test.expect_error($q$update sr_reports set status = 'draft', print_count = 0, first_printed_at = null, last_printed_at = null where id = '00000000-0000-0000-0000-00000000e023'$q$, 'validation');
-- 狀態轉換白名單
select sr_test.expect_error($q$update sr_reports set status = 'completed', completed_at = now() where id = '00000000-0000-0000-0000-00000000e024'$q$, 'validation');
update sr_reports set status = 'printed' where id = '00000000-0000-0000-0000-00000000e024';  -- draft → printed（未計次）
select sr_test.expect_error($q$update sr_reports set status = 'draft' where id = '00000000-0000-0000-0000-00000000e024'$q$, 'validation');
update sr_reports set status = 'completed' where id = '00000000-0000-0000-0000-00000000e024';
select sr_test.expect_error($q$update sr_reports set status = 'draft' where id = '00000000-0000-0000-0000-00000000e024'$q$, 'validation');

do $$
declare n int;
begin
  delete from sr_reports where id = '00000000-0000-0000-0000-00000000e023';
  get diagnostics n = row_count;
  assert n = 0, '已列印單竄改失敗後仍不可刪除';
  assert (select print_count = 2 and status = 'printed' and first_printed_at is not null
          from sr_reports where id = '00000000-0000-0000-0000-00000000e023'), 'e023 列印紀錄未被竄改';
  raise notice 'ok  API 角色竄改列印／狀態被擋';
end $$;

-- 受信任身分（service_role）不受稽核限制（維運修正用），但作廢單仍唯讀
set local role service_role;
do $$
declare n int;
begin
  update sr_reports set status = 'draft', print_count = 0, first_printed_at = null, last_printed_at = null
   where id = '00000000-0000-0000-0000-00000000e023';
  get diagnostics n = row_count;
  assert n = 1, 'service_role 可做維運修正';
  insert into sr_reports (report_no, status, print_count, first_printed_at, last_printed_at)
  values ('X11509307', 'printed', 1, now(), now());
  raise notice 'ok  受信任身分不受稽核限制';
end $$;
select sr_test.expect_error($q$update sr_reports set note = 'x' where id = '00000000-0000-0000-0000-00000000e021'$q$, 'voided');
reset role;

do $$ begin raise notice '==== service_report_test：全部斷言通過 ===='; end $$;

rollback;
