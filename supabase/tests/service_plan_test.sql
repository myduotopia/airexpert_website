-- service_plan_test.sql
-- 保養方案與到期提醒 SQL 測試（issue #200，spec §8）。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。
-- 正式 DB 執行前需使用者確認。
--
-- 模擬方式：set local role authenticated + request.jwt.claims（sub = 測試使用者 id），同 service_report_test.sql。
-- 涵蓋：RLS（有／無授權、anon）、mx_records 只讀、FK 連動（刪方案 → 階段／指定；刪階段 → 報告單快照）、
--       唯一（方案名稱大小寫空白不敏感、同方案時數）、parts 形狀驗證、報告單 plan_stage_* 寫入與列印後清除。

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
-- office 由 0022 之前的 seed 取得授權；sr-only 為「只有模組授權」的帳號
insert into admin_module_grants (user_id, module)
select id, 'service_report' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-000000000003', 'service_report');

create schema sp_test;

create function sp_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code then
      raise notice 'ok  [%] %', p_code, coalesce(v_detail, '');
      return;
    elsif sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, sqlerrm;
      return;
    end if;
    raise exception '預期 % 但得到 % (%): % / sql=%', p_code, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

grant usage on schema sp_test to authenticated, anon, service_role;
grant execute on all functions in schema sp_test to authenticated, anon, service_role;

-- 保養卡資料（office 領域）
insert into mx_customers (id, name, code) values
  ('00000000-0000-0000-0000-00000000d001', '華淨科技股份有限公司', 'KK855');
insert into mx_machines (id, customer_id, machine_no, serial_no, model, horsepower) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000d001', '2', 'J751307001', 'SP50VH5', '20HP'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000d001', '3', 'J751307002', 'SP50VH5', '50HP');
insert into mx_records (id, machine_id, service_date, hours) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1', '2026-06-01', '3,850'),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a1', '2026-09-01', '4100 小時');

-- ============================================================
-- 1) 有授權（office）：方案 / 階段 / 逐台指定 CRUD
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  n     int;
  v_old constant timestamptz := timestamptz '2000-01-01 00:00:00+08';
begin
  assert has_module('service_report'), 'office 應有 service_report';

  insert into sr_service_plans (id, name, hp_tags, note) values
    ('00000000-0000-0000-0000-00000000f001', '20HP 空壓機', '{20HP,20}', '測試方案'),
    ('00000000-0000-0000-0000-00000000f002', '50HP 空壓機', '{50HP,50}', null);
  assert (select count(*) from sr_service_plans) = 2, 'office 可新增／讀取方案';
  assert (select active from sr_service_plans where id = '00000000-0000-0000-0000-00000000f001'), 'active 預設 true';
  assert (select created_by from sr_service_plans where id = '00000000-0000-0000-0000-00000000f001')
         = '00000000-0000-0000-0000-000000000001', 'created_by 預設 auth.uid()';

  insert into sr_service_plan_stages (id, plan_id, hours, label, parts) values
    ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000f001', 2000, '基礎保養',
     '[{"name":"螺旋專用油","qty":"1","unit":"桶"},{"name":"機油濾清器","qty":"1"}]'),
    ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-00000000f001', 4000, '基礎保養＋空氣濾清器', '[]'),
    ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-00000000f001', 6000, '年度保養', '[]');
  assert (select count(*) from sr_service_plan_stages
          where plan_id = '00000000-0000-0000-0000-00000000f001') = 3, '方案有 3 個階段';
  assert (select parts from sr_service_plan_stages
          where id = '00000000-0000-0000-0000-0000000f0002') = '[]'::jsonb, 'parts 預設空陣列';

  insert into sr_machine_plans (machine_id, plan_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001');
  assert (select plan_id from sr_machine_plans
          where machine_id = '00000000-0000-0000-0000-0000000000a1')
         = '00000000-0000-0000-0000-00000000f001', '逐台指定可寫入／讀取';

  -- update + set_updated_at
  -- 注意：now() 在同一交易內固定，無法用「更新後變新」比較；改以「呼叫端自帶的 updated_at 會被觸發器覆寫」驗證。
  update sr_service_plans set active = false, hp_tags = '{20HP,20,20 HP}', updated_at = v_old
   where id = '00000000-0000-0000-0000-00000000f001';
  get diagnostics n = row_count;
  assert n = 1, 'office 可修改方案';
  assert (select updated_at from sr_service_plans where id = '00000000-0000-0000-0000-00000000f001') > v_old,
    'sr_service_plans.updated_at 觸發器生效（覆寫呼叫端指定值）';

  update sr_service_plan_stages set label = '基礎保養（改）', updated_at = v_old
   where id = '00000000-0000-0000-0000-0000000f0001';
  assert (select updated_at from sr_service_plan_stages where id = '00000000-0000-0000-0000-0000000f0001') > v_old,
    'sr_service_plan_stages.updated_at 觸發器生效';

  update sr_machine_plans set plan_id = '00000000-0000-0000-0000-00000000f002', updated_at = v_old
   where machine_id = '00000000-0000-0000-0000-0000000000a1';
  assert (select updated_at from sr_machine_plans where machine_id = '00000000-0000-0000-0000-0000000000a1') > v_old,
    'sr_machine_plans.updated_at 觸發器生效';
  update sr_machine_plans set plan_id = '00000000-0000-0000-0000-00000000f001'
   where machine_id = '00000000-0000-0000-0000-0000000000a1';

  -- 清除指定（delete）
  insert into sr_machine_plans (machine_id, plan_id) values
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f002');
  delete from sr_machine_plans where machine_id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 1, 'office 可清除逐台指定';

  update sr_service_plans set active = true where id = '00000000-0000-0000-0000-00000000f001';
  raise notice 'ok  office：方案／階段／逐台指定 CRUD';
end $$;

-- ============================================================
-- 2) 唯一約束：方案名稱（大小寫／空白不敏感）、同方案時數
-- ============================================================
select sp_test.expect_error($q$insert into sr_service_plans (name) values ('20HP 空壓機')$q$, '23505');
select sp_test.expect_error($q$insert into sr_service_plans (name) values ('  20hp 空壓機  ')$q$, '23505');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label) values ('00000000-0000-0000-0000-00000000f001', 4000, '重複時數')$q$, '23505');
-- 不同方案的相同時數合法
do $$ begin
  insert into sr_service_plan_stages (id, plan_id, hours, label)
  values ('00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-00000000f002', 4000, '基礎保養');
  raise notice 'ok  唯一：方案名稱正規化、(plan_id, hours)';
end $$;

-- 階段時數範圍
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label) values ('00000000-0000-0000-0000-00000000f001', 0, 'x')$q$, '23514');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label) values ('00000000-0000-0000-0000-00000000f001', 1000001, 'x')$q$, '23514');

-- ============================================================
-- 3) parts 形狀驗證（CHECK：jsonb 陣列，每個元素為物件且 name 非空白）
-- ============================================================
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label, parts) values ('00000000-0000-0000-0000-00000000f001', 8000, 'x', '{"name":"油"}')$q$, '23514');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label, parts) values ('00000000-0000-0000-0000-00000000f001', 8000, 'x', '"油"')$q$, '23514');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label, parts) values ('00000000-0000-0000-0000-00000000f001', 8000, 'x', '["油"]')$q$, '23514');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label, parts) values ('00000000-0000-0000-0000-00000000f001', 8000, 'x', '[{"qty":"1"}]')$q$, '23514');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label, parts) values ('00000000-0000-0000-0000-00000000f001', 8000, 'x', '[{"name":"  ","qty":"1"}]')$q$, '23514');
select sp_test.expect_error($q$update sr_service_plan_stages set parts = '[{"qty":"1"}]' where id = '00000000-0000-0000-0000-0000000f0001'$q$, '23514');

do $$ begin
  insert into sr_service_plan_stages (id, plan_id, hours, label, parts)
  values ('00000000-0000-0000-0000-0000000f0005', '00000000-0000-0000-0000-00000000f001', 8000, '基礎保養',
          '[{"name":"螺旋專用油","qty":"1","unit":"桶"},{"name":"空氣濾清器(外)","qty":"1"}]');
  update sr_service_plan_stages set parts = '[]' where id = '00000000-0000-0000-0000-0000000f0005';
  delete from sr_service_plan_stages where id = '00000000-0000-0000-0000-0000000f0005';
  raise notice 'ok  parts 形狀驗證（非陣列／非物件／缺 name／空白 name 皆擋）';
end $$;

-- ============================================================
-- 4) 報告單 plan_stage_*：草稿寫入、列印後仍可清除（spec §4.1）
-- ============================================================
do $$
declare
  n int;
  r sr_reports;
begin
  insert into sr_reports (id, report_no, report_date, customer_id, machine_id, customer_name,
                          plan_stage_id, plan_stage_hours, plan_stage_label)
  values ('00000000-0000-0000-0000-00000000e001', 'X11509001', '2026-09-11',
          '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-0000000000a1',
          '華淨科技股份有限公司',
          '00000000-0000-0000-0000-0000000f0002', 4000, '基礎保養＋空氣濾清器');
  select * into r from sr_reports where id = '00000000-0000-0000-0000-00000000e001';
  assert r.status = 'draft' and r.plan_stage_hours = 4000, '草稿可帶入階段快照';

  -- 草稿改套用另一個階段
  update sr_reports set plan_stage_id = '00000000-0000-0000-0000-0000000f0003',
         plan_stage_hours = 6000, plan_stage_label = '年度保養'
   where id = r.id;
  get diagnostics n = row_count;
  assert n = 1, '草稿可改套用階段';

  -- 列印後（API 角色）仍可改／清除階段：稽核觸發器只限制單號／列印／狀態
  update sr_reports set print_count = 1, first_printed_at = now(), last_printed_at = now(), status = 'printed'
   where id = r.id and status = 'draft';
  update sr_reports set plan_stage_id = '00000000-0000-0000-0000-0000000f0002',
         plan_stage_hours = 4000, plan_stage_label = '基礎保養＋空氣濾清器'
   where id = r.id;
  get diagnostics n = row_count;
  assert n = 1, '已列印仍可改套用階段';
  update sr_reports set plan_stage_id = null where id = r.id;
  get diagnostics n = row_count;
  assert n = 1, '已列印仍可清除階段（清除後該階段視為未開過）';
  assert (select plan_stage_hours = 4000 and plan_stage_label is not null
          from sr_reports where id = r.id), '清除 plan_stage_id 不影響快照欄位';

  update sr_reports set plan_stage_id = '00000000-0000-0000-0000-0000000f0002' where id = r.id;
  raise notice 'ok  報告單 plan_stage_*：草稿寫入、已列印可改可清除';
end $$;

-- ============================================================
-- 5) FK 行為：刪階段 → 報告單轉 null 但快照仍在；刪方案 → 階段／逐台指定連動刪
-- ============================================================
do $$
declare n int;
begin
  -- 作廢單也引用階段（驗證作廢單唯讀的 FK set null 例外涵蓋 plan_stage_id）
  insert into sr_reports (id, report_no, machine_id, plan_stage_id, plan_stage_hours, plan_stage_label)
  values ('00000000-0000-0000-0000-00000000e002', 'X11509002', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-0000000f0001', 2000, '基礎保養');
  update sr_reports set status = 'voided', voided_at = now(), void_reason = '測試作廢'
   where id = '00000000-0000-0000-0000-00000000e002';

  -- 刪階段 f0002（被未作廢的 e001 引用）
  delete from sr_service_plan_stages where id = '00000000-0000-0000-0000-0000000f0002';
  get diagnostics n = row_count;
  assert n = 1, '有授權者可刪除階段';
  assert (select plan_stage_id from sr_reports where id = '00000000-0000-0000-0000-00000000e001') is null,
    '刪階段 → 報告單 plan_stage_id 轉 null';
  assert (select plan_stage_hours = 4000 and plan_stage_label = '基礎保養＋空氣濾清器'
          from sr_reports where id = '00000000-0000-0000-0000-00000000e001'),
    '刪階段 → 報告單快照仍在';

  -- 刪階段 f0001（被作廢單 e002 引用）
  delete from sr_service_plan_stages where id = '00000000-0000-0000-0000-0000000f0001';
  get diagnostics n = row_count;
  assert n = 1, '被作廢單引用的階段仍可刪除（FK set null 例外）';
  assert (select plan_stage_id is null and plan_stage_hours = 2000 and status = 'voided'
          from sr_reports where id = '00000000-0000-0000-0000-00000000e002'),
    '作廢單 plan_stage_id 轉 null、快照仍在、狀態不變';

  -- 刪方案 → 階段與逐台指定連動刪
  assert (select count(*) from sr_service_plan_stages
          where plan_id = '00000000-0000-0000-0000-00000000f001') = 1, '方案 f001 尚餘 1 個階段';
  delete from sr_service_plans where id = '00000000-0000-0000-0000-00000000f001';
  get diagnostics n = row_count;
  assert n = 1, '有授權者可刪除方案';
  assert (select count(*) from sr_service_plan_stages
          where plan_id = '00000000-0000-0000-0000-00000000f001') = 0, '刪方案 → 階段連動刪';
  assert (select count(*) from sr_machine_plans
          where machine_id = '00000000-0000-0000-0000-0000000000a1') = 0, '刪方案 → 逐台指定連動刪';
  assert (select count(*) from sr_reports) = 2, '報告單未被刪除';
  raise notice 'ok  FK：刪階段轉 null 保快照、刪方案連動刪階段與指定';
end $$;

-- 刪機台 → 逐台指定連動刪（以受信任身分刪，避免動到 office 的保養卡 policy 討論）
do $$ begin
  insert into sr_machine_plans (machine_id, plan_id) values
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f002');
end $$;
reset role;
do $$
declare n int;
begin
  delete from mx_machines where id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics n = row_count;
  assert n = 1, '刪除機台';
  assert (select count(*) from sr_machine_plans
          where machine_id = '00000000-0000-0000-0000-0000000000a2') = 0, '刪機台 → 逐台指定連動刪';
  raise notice 'ok  FK：刪機台連動刪逐台指定';
end $$;
set local role authenticated;

-- ============================================================
-- 6) 無授權使用者（admin）：看不到、不能寫
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare n int;
begin
  assert not has_module('service_report'), 'admin 不應有 service_report';
  assert (select count(*) from sr_service_plans) = 0, '無授權者看不到方案';
  assert (select count(*) from sr_service_plan_stages) = 0, '無授權者看不到階段';
  assert (select count(*) from sr_machine_plans) = 0, '無授權者看不到逐台指定';

  update sr_service_plans set name = 'hack' where id = '00000000-0000-0000-0000-00000000f002';
  get diagnostics n = row_count;
  assert n = 0, '無授權者不能修改方案';
  delete from sr_service_plans where id = '00000000-0000-0000-0000-00000000f002';
  get diagnostics n = row_count;
  assert n = 0, '無授權者不能刪除方案';
  delete from sr_service_plan_stages where plan_id = '00000000-0000-0000-0000-00000000f002';
  get diagnostics n = row_count;
  assert n = 0, '無授權者不能刪除階段';
  raise notice 'ok  無授權者讀寫被擋';
end $$;
select sp_test.expect_error($q$insert into sr_service_plans (name) values ('hack 方案')$q$, '42501');
select sp_test.expect_error($q$insert into sr_service_plan_stages (plan_id, hours, label) values ('00000000-0000-0000-0000-00000000f002', 2000, 'hack')$q$, '42501');
select sp_test.expect_error($q$insert into sr_machine_plans (machine_id, plan_id) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f002')$q$, '42501');

-- anon：無表權限
set local role anon;
select sp_test.expect_error($q$select * from sr_service_plans$q$, '42501');
select sp_test.expect_error($q$select * from sr_service_plan_stages$q$, '42501');
select sp_test.expect_error($q$select * from sr_machine_plans$q$, '42501');
select sp_test.expect_error($q$insert into sr_service_plans (name) values ('anon 方案')$q$, '42501');
set local role authenticated;

-- ============================================================
-- 7) sr-only（role 'erp'、只有 service_report 授權）：方案可讀寫、mx_records 只讀
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare n int;
begin
  assert has_module('service_report') and not is_office(), 'sr-only 身分';
  assert (select count(*) from sr_service_plans) = 1, 'sr-only 可讀方案';
  assert (select count(*) from mx_records) = 2, 'sr-only 可讀 mx_records（0022 新增 select policy）';
  assert (select hours from mx_records where id = '00000000-0000-0000-0000-00000000c002') = '4100 小時',
    'mx_records 內容可讀';

  -- 方案／階段／指定 CRUD
  insert into sr_service_plans (id, name, hp_tags) values
    ('00000000-0000-0000-0000-00000000f003', '30HP 空壓機', '{30HP}');
  insert into sr_service_plan_stages (id, plan_id, hours, label) values
    ('00000000-0000-0000-0000-0000000f0010', '00000000-0000-0000-0000-00000000f003', 2000, '基礎保養');
  insert into sr_machine_plans (machine_id, plan_id) values
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f003');
  update sr_service_plans set note = 'sr-only 改' where id = '00000000-0000-0000-0000-00000000f003';
  get diagnostics n = row_count;
  assert n = 1, 'sr-only 可修改方案';
  delete from sr_machine_plans where machine_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  assert n = 1, 'sr-only 可清除逐台指定';
  delete from sr_service_plans where id = '00000000-0000-0000-0000-00000000f003';
  get diagnostics n = row_count;
  assert n = 1, 'sr-only 可刪除方案';

  -- mx_records 只讀
  update mx_records set hours = '9999' where id = '00000000-0000-0000-0000-00000000c001';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能修改 mx_records';
  delete from mx_records where id = '00000000-0000-0000-0000-00000000c001';
  get diagnostics n = row_count;
  assert n = 0, 'sr-only 不能刪除 mx_records';
  raise notice 'ok  sr-only：方案可讀寫、mx_records 只讀';
end $$;
select sp_test.expect_error($q$insert into mx_records (machine_id, service_date, hours) values ('00000000-0000-0000-0000-0000000000a1', '2026-09-20', '4200')$q$, '42501');

reset role;
do $$ begin
  assert (select hours from mx_records where id = '00000000-0000-0000-0000-00000000c001') = '3,850',
    'mx_records 未被改';
  assert (select count(*) from mx_records) = 2, 'mx_records 未被刪';
  assert (select count(*) from sr_service_plans) = 1, '僅剩 50HP 方案';
end $$;

do $$ begin raise notice '==== service_plan_test：全部斷言通過 ===='; end $$;

rollback;
