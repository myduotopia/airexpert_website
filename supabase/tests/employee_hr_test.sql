-- employee_hr_test.sql
-- 員工資料擴充、敏感個資加密與 hr 模組（issue #257，0031）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17；Vault 以本機 stub 模擬、測試金鑰）。
-- 測試資料全為虛構（測試員甲／乙…、Z999999999）。
--
-- 涵蓋：模組檢查放寬、employees 新欄位與約束（角色 4 種／可空、left_on ≥ hired_on、離職 → 停用）、
--       admin_profile_id 唯一、employee_private 任何 API 角色皆不可直接讀寫（含 hr）、
--       hr_* RPC 只有 hr 可呼叫（erp／service_report／無模組 → forbidden；anon／service_role → 無執行權）、
--       加解密往返、密文不含明文、遮罩格式、upsert 語意（不變／清除／寫入）、reveal 寫紀錄、
--       紀錄不可改刪（含 postgres、truncate）、金鑰缺失／過短／錯誤金鑰的明確錯誤、
--       匯入（維運身分 postgres 與 hr 可、可重跑不重複、空白不清除、錯誤整批失敗）、刪除員工 cascade 與紀錄保留、
--       API 角色不可讀 Vault。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'hr-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a2', 'erp-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a3', 'sr-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a4', 'office-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a5', 'admin-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a6', 'hr-only-test@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'erp',    'hr-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a2', 'erp',    'erp-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a3', 'erp',    'sr-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a4', 'office', 'office-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a5', 'admin',  'admin-test@example.invalid'),
  ('00000000-0000-0000-0000-0000000001a6', 'erp',    'hr-only-test@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000001a1', 'erp'),
  ('00000000-0000-0000-0000-0000000001a1', 'hr'),
  ('00000000-0000-0000-0000-0000000001a2', 'erp'),
  ('00000000-0000-0000-0000-0000000001a3', 'service_report'),
  ('00000000-0000-0000-0000-0000000001a6', 'hr');

create schema hr_test;

create function hr_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code or sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, coalesce(nullif(v_detail, ''), sqlerrm);
      return;
    end if;
    raise exception '預期 % 但得到 % (%): % / sql=%', p_code, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

create function hr_test.emp(p_name text) returns uuid language sql as $$
  select id from employees where employee_name_key(name) = employee_name_key(p_name);
$$;

-- 以 postgres 身分讀紀錄筆數（不受 RLS）
create function hr_test.log_count(p_action text default null) returns int
language sql security definer as $$
  select count(*)::int from employee_private_access_log where p_action is null or action = p_action;
$$;

grant usage on schema hr_test to authenticated, anon, service_role;
grant execute on all functions in schema hr_test to authenticated, anon, service_role;

-- 測試員工（postgres 建立）
insert into employees (id, code, name, roles, title) values
  ('00000000-0000-0000-0000-0000000002b1', 'Z01', '測試員甲', '{sales}',      '業務'),
  ('00000000-0000-0000-0000-0000000002b2', 'Z02', '測試員乙', '{technician}', '服務'),
  ('00000000-0000-0000-0000-0000000002b3', 'Z03', '測試員丙', '{office}',     '內勤');

-- ============================================================
-- 1) 模組檢查放寬
-- ============================================================
select hr_test.expect_error($q$insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-0000000001a4', 'payroll')$q$, '23514');
do $$ begin
  assert exists (select 1 from admin_module_grants where module = 'hr'), 'hr 為合法模組';
  raise notice 'ok  模組檢查含 hr';
end $$;

-- ============================================================
-- 2) employees 新欄位與約束（以 erp 使用者身分寫入）
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';

do $$
declare
  v_id    uuid;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  insert into employees (code, name, roles, title, department, phone, emergency_contact, hired_on)
  values ('Z11', '測試員丁', '{office,manager}', '負責人', '管理部', '02-0000-0000', '測試聯絡人', '2020-01-01')
  returning id into v_id;
  assert (select roles from employees where id = v_id) = array['office','manager'], 'office／manager 為合法角色';
  assert (select active from employees where id = v_id), '未設離職日 → 在職';

  -- 空角色（職務對不到角色）
  insert into employees (name, roles, title) values ('測試員戊', '{}', '其他');
  assert (select roles from employees where id = hr_test.emp('測試員戊')) = '{}'::text[], '允許空角色';

  -- 離職日 ≤ 今天 → 寫入當下強制停用（即使送 active = true）
  update employees set left_on = v_today, active = true where id = v_id;
  assert not (select active from employees where id = v_id), '離職日 = 今天 → 停用';
  update employees set active = true where id = v_id;
  assert not (select active from employees where id = v_id), '有過去離職日時不可設回在職';
  -- 清除離職日不會自動復職；再勾選在職才復職
  update employees set left_on = null where id = v_id;
  assert not (select active from employees where id = v_id), '清除離職日不自動復職';
  update employees set active = true where id = v_id;
  assert (select active from employees where id = v_id), '清除離職日後可復職';

  -- 未來離職日（預定）→ 寫入當下仍在職
  update employees set left_on = v_today + 30 where id = v_id;
  assert (select active from employees where id = v_id), '未來離職日 → 仍在職';

  -- 新增時就帶過去離職日 → 直接停用（匯入離職人員）
  insert into employees (code, name, roles, left_on, active) values ('Z12', '測試員己', '{sales}', '2021-06-30', true);
  assert not (select active from employees where id = hr_test.emp('測試員己')), '新增帶過去離職日 → 停用';
  raise notice 'ok  employees 新欄位、角色、離職 → 停用';
end $$;

select hr_test.expect_error($q$insert into employees (name, roles) values ('測試越界角色', '{driver}')$q$, '23514');
select hr_test.expect_error($q$insert into employees (name, roles, hired_on, left_on) values ('測試日期', '{sales}', '2022-01-02', '2022-01-01')$q$, '23514');
select hr_test.expect_error($q$insert into employees (name, roles, phone) values ('測試電話', '{sales}', repeat('9', 51))$q$, '23514');
select hr_test.expect_error($q$insert into employees (name, roles, title) values ('測試職務', '{sales}', repeat('職', 51))$q$, '23514');

-- admin_profile_id：唯一、刪除帳號 → set null
reset role;
update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a4'
 where id = '00000000-0000-0000-0000-0000000002b1';
select hr_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a4' where id = '00000000-0000-0000-0000-0000000002b2'$q$, '23505');
select hr_test.expect_error($q$update employees set admin_profile_id = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000002b2'$q$, '23503');
delete from admin_module_grants where user_id = '00000000-0000-0000-0000-0000000001a4';
-- 刪除帳號（人員管理頁走 service_role）→ cascade set null 不受 admin_profile_id 防護擋下
set local role service_role;
delete from admin_profiles where id = '00000000-0000-0000-0000-0000000001a4';
reset role;
do $$ begin
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000002b1') is null,
    '刪除後台帳號 → admin_profile_id 設為 null';
  raise notice 'ok  admin_profile_id 唯一、on delete set null';
end $$;
-- 恢復 office 帳號（後續測試用）
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000001a4', 'office', 'office-test@example.invalid');

-- admin_profile_id 防護：erp／service_report 不可設定或改成另一個帳號（日後對應登入身分，屬提權），可清除；
-- hr 與維運身分（postgres）可設定。
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';  -- erp
select hr_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a2' where id = '00000000-0000-0000-0000-0000000002b2'$q$, 'admin_link_forbidden');
select hr_test.expect_error($q$insert into employees (name, roles, admin_profile_id) values ('測試連結', '{sales}', '00000000-0000-0000-0000-0000000001a2')$q$, 'admin_link_forbidden');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}';  -- service_report
select hr_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a3' where id = '00000000-0000-0000-0000-0000000002b2'$q$, 'admin_link_forbidden');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';  -- hr
update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a4' where id = '00000000-0000-0000-0000-0000000002b2';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';  -- erp
select hr_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000001a2' where id = '00000000-0000-0000-0000-0000000002b2'$q$, 'admin_link_forbidden');
do $$ begin
  -- 不動 admin_profile_id 的一般更新照常（含 set 成相同值）
  update employees set note = '測試備註', admin_profile_id = admin_profile_id where id = '00000000-0000-0000-0000-0000000002b2';
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000002b2')
         = '00000000-0000-0000-0000-0000000001a4', 'hr 設定的連結保留';
  -- 清除：0032 起連結決定員工帳號的職位權限，已連結的員工只有 hr 能解除（admin_unlink_forbidden）
  perform hr_test.expect_error($q$update employees set admin_profile_id = null where id = '00000000-0000-0000-0000-0000000002b2'$q$, 'admin_unlink_forbidden');
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000002b2')
         = '00000000-0000-0000-0000-0000000001a4', 'erp 不可清除連結（0032）';
  raise notice 'ok  admin_profile_id 只限 hr／維運身分設定';
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';  -- hr
update employees set admin_profile_id = null where id = '00000000-0000-0000-0000-0000000002b2';
do $$ begin
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000002b2') is null, 'hr 可清除連結';
end $$;
reset role;

-- ============================================================
-- 3) 遮罩格式（hr_mask_private，postgres 直接呼叫）
-- ============================================================
do $$ begin
  assert hr_mask_private('national_id', 'Z999999999') = 'Z99*****99', format('身份證號遮罩：%s', hr_mask_private('national_id', 'Z999999999'));
  assert hr_mask_private('national_id', ' z900 000019 ') = 'Z90*****19', '身份證號去空白、轉大寫後遮罩';
  assert hr_mask_private('national_id', 'AB123') = 'A****', '3–5 碼：首碼 + *';
  assert hr_mask_private('national_id', 'AB') = '**', '≤ 2 碼：全部 *';
  assert hr_mask_private('household_address', '臺北市測試區虛構路1號') = '臺北市測試區…', '地址只到區';
  assert hr_mask_private('household_address', '100 臺北市測試區虛構路1號') = '臺北市測試區…', '去郵遞區號';
  assert hr_mask_private('household_address', '新竹縣測試市虛構里') = '新竹縣測試市…', '縣 + 市';
  assert hr_mask_private('household_address', '虛構縣') = '虛構縣…', '只有縣市';
  assert hr_mask_private('household_address', 'Fake Street 1') = '已填寫', '對不到縣市 → 已填寫';
  assert hr_mask_private('emergency_contact', '測試聯絡人 Z999999999') = '已填寫（16 字）', '聯絡人原文只回字數';
  assert hr_mask_private('marital', '未婚') = '已填寫', '婚姻只回已填寫';
  assert hr_mask_private('education', '虛構大學測試系') = '虛構大…', format('學歷前 3 字：%s', hr_mask_private('education', '虛構大學測試系'));
  assert hr_mask_private('experience', '虛構公司測試工程師十年') = '虛構公司…', '經歷前 4 字';
  assert hr_mask_private('education', '甲') = '…', '1 字 → …';
  assert hr_mask_private('education', '   ') is null and hr_mask_private('marital', null) is null, '空值 → null';
  raise notice 'ok  遮罩格式';
end $$;

-- ============================================================
-- 4) employee_private 任何 API 角色皆不可直接讀寫（含 hr）
-- ============================================================
insert into employee_private (employee_id) values ('00000000-0000-0000-0000-0000000002b3');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';  -- hr
select hr_test.expect_error($q$select * from employee_private$q$, '42501');
select hr_test.expect_error($q$insert into employee_private (employee_id) values ('00000000-0000-0000-0000-0000000002b1')$q$, '42501');
select hr_test.expect_error($q$update employee_private set updated_by = null$q$, '42501');
select hr_test.expect_error($q$delete from employee_private$q$, '42501');
select hr_test.expect_error($q$select * from vault.decrypted_secrets$q$, '42501');
select hr_test.expect_error($q$select hr_pii_key()$q$, '42501');
select hr_test.expect_error($q$select hr_decrypt(null, 'x')$q$, '42501');
select hr_test.expect_error($q$select hr_write_private('00000000-0000-0000-0000-0000000002b1', '{}', 'x', false)$q$, '42501');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';  -- erp
select hr_test.expect_error($q$select * from employee_private$q$, '42501');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}';  -- service_report
select hr_test.expect_error($q$select * from employee_private$q$, '42501');
set local role anon;
select hr_test.expect_error($q$select * from employee_private$q$, '42501');
set local role service_role;
select hr_test.expect_error($q$select * from employee_private$q$, '42501');
select hr_test.expect_error($q$select * from vault.decrypted_secrets$q$, '42501');
reset role;
delete from employee_private;

-- ============================================================
-- 5) hr_* RPC：非 hr → forbidden；anon／service_role → 無執行權
-- ============================================================
set local role authenticated;
do $$
declare
  v_sub text;
begin
  foreach v_sub in array array[
    '00000000-0000-0000-0000-0000000001a2',   -- erp
    '00000000-0000-0000-0000-0000000001a3',   -- service_report
    '00000000-0000-0000-0000-0000000001a4',   -- office（無模組）
    '00000000-0000-0000-0000-0000000001a5'    -- admin（無模組）
  ] loop
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_sub), true);
    perform hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'forbidden');
    perform hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id')$q$, 'forbidden');
    perform hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '{"national_id":"Z999999999"}')$q$, 'forbidden');
    perform hr_test.expect_error($q$select hr_import_employee_private('[{"employee_id":"00000000-0000-0000-0000-0000000002b1","national_id":"Z999999999"}]')$q$, 'forbidden');
    -- 存取紀錄：有 select 權限但 RLS 只給 hr → 0 列
    assert (select count(*) from employee_private_access_log) = 0, '非 hr 讀不到存取紀錄';
  end loop;
  raise notice 'ok  非 hr 角色呼叫 hr_* 一律 forbidden';
end $$;

-- psql 以 postgres 登入但 set role authenticated（無 hr）→ 不算維運身分
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, 'forbidden');
-- 偽造維運身分（模擬 PostgREST：以非超級使用者 authenticator 登入後 set local role authenticated）：
-- GUC role 只能 set 成 session user 是成員的角色；自訂 GUC、JWT 內的 role、set role none 都不會變成維運身分
reset role;
create role hr_test_authenticator nologin noinherit;
grant authenticated, anon, service_role to hr_test_authenticator;
grant usage on schema hr_test to hr_test_authenticator;
grant execute on all functions in schema hr_test to hr_test_authenticator;
set local session authorization hr_test_authenticator;
set local role authenticated;
select hr_test.expect_error($q$select set_config('role', 'postgres', true)$q$, '42501');
select hr_test.expect_error($q$set role postgres$q$, '42501');
-- （set session authorization 的拒絕需以非超級使用者「登入」才測得到；本測試的登入者是 postgres，略過）
select hr_test.expect_error($q$select hr_caller_is_maintenance()$q$, '42501');
select set_config('request.jwt.claim.role', 'postgres', true), set_config('app.role', 'postgres', true);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"postgres"}';
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, 'forbidden');
set local role service_role;
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, '42501');
set local role none;   -- 回到 session user（authenticator）：不是 postgres
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, '42501');
reset session authorization;
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';

set local role anon;
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, '42501');
select hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id')$q$, '42501');
select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '{}')$q$, '42501');
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, '42501');
select hr_test.expect_error($q$select * from employee_private_access_log$q$, '42501');
set local role service_role;
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, '42501');
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, '42501');
reset role;
-- postgres 直接呼叫 hr_get／reveal／upsert（非匯入）也需 hr 模組
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'forbidden');
select hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id')$q$, 'forbidden');

-- ============================================================
-- 6) hr：加解密往返、upsert 語意、reveal 寫紀錄
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';

do $$
declare
  v jsonb;
begin
  -- 尚無資料
  v := hr_get_employee_private('00000000-0000-0000-0000-0000000002b1');
  assert not (v->>'exists')::boolean, '尚無敏感資料';
  assert v->'fields'->>'national_id' is null, '未填寫 → null';

  v := hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', jsonb_build_object(
    'national_id', ' z999999999 ',
    'household_address', '臺北市測試區虛構路1號',
    'emergency_contact', '測試聯絡人 Z999999999',
    'marital', '未婚',
    'education', '虛構大學測試系',
    'experience', '虛構公司測試工程師'
  ));
  assert (v->>'exists')::boolean, '寫入後有資料';
  assert v->'fields'->>'national_id' = 'Z99*****99', format('回傳遮罩值：%s', v);
  assert v->'fields'->>'household_address' = '臺北市測試區…', '地址遮罩';
  assert v->'fields'->>'marital' = '已填寫', '婚姻遮罩';
  assert v::text not like '%Z999999999%' and v::text not like '%虛構路%', 'get 回應不含明文';

  assert hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id') = 'Z999999999',
    'reveal 回明文（已去空白、轉大寫）';
  assert hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'household_address') = '臺北市測試區虛構路1號',
    'reveal 地址';
  assert hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b2', 'national_id') is null,
    '無資料的員工 reveal → null';

  -- 鍵不存在 → 不變；'' 或 null → 清除
  v := hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '{"marital":"", "education":null}');
  assert v->'fields'->>'marital' is null and v->'fields'->>'education' is null, '空字串／null 清除';
  assert v->'fields'->>'national_id' = 'Z99*****99', '未帶的鍵不變';
  assert hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'experience') = '虛構公司測試工程師',
    '未帶的鍵不變（明文）';

  -- hr 可讀紀錄
  assert (select count(*) from employee_private_access_log where action = 'reveal') = 4,
    format('reveal 4 次寫 4 筆紀錄，實際 %s', (select count(*) from employee_private_access_log where action = 'reveal'));
  assert (select count(*) from employee_private_access_log where action = 'write') = 8,
    '寫入 6 欄 + 清除 2 欄 = 8 筆 write 紀錄';
  assert (select bool_and(user_id = '00000000-0000-0000-0000-0000000001a1'
                          and actor_email = 'hr-test@example.invalid'
                          and actor_role = 'authenticated')
            from employee_private_access_log), '紀錄含使用者 id、email、角色';
  assert exists (select 1 from employee_private_access_log
                  where employee_id = '00000000-0000-0000-0000-0000000002b2' and field = 'national_id' and action = 'reveal'),
    'reveal 空值也記錄';
  raise notice 'ok  hr 加解密往返、upsert 語意、reveal 寫紀錄';
end $$;

select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '{"salary":"1"}')$q$, 'validation');
select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '{"national_id":123}')$q$, 'validation');
select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', '["x"]')$q$, 'validation');
select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b1', jsonb_build_object('national_id', repeat('Z', 21)))$q$, 'validation');
select hr_test.expect_error($q$select hr_upsert_employee_private(gen_random_uuid(), '{}')$q$, 'not_found');
select hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'salary')$q$, 'validation');
select hr_test.expect_error($q$select hr_get_employee_private(gen_random_uuid())$q$, 'not_found');

-- hr 不可改刪紀錄（無表權限）
select hr_test.expect_error($q$update employee_private_access_log set field = 'x'$q$, '42501');
select hr_test.expect_error($q$delete from employee_private_access_log$q$, '42501');
select hr_test.expect_error($q$insert into employee_private_access_log (actor_role, employee_id, field, action) values ('x', gen_random_uuid(), 'x', 'reveal')$q$, '42501');

-- 只有 hr、沒有 erp 的帳號：可用 hr_* RPC，也可維護員工主檔（0031 §7c 的 hr policy），
-- 但不因此取得 erp_*／sr_* 的權限
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a6","role":"authenticated"}';
do $$ begin
  assert (select count(*) from employees) > 0, 'hr-only 讀得到 employees';
  assert hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')->'fields'->>'national_id' = 'Z99*****99',
    'hr-only 可讀遮罩值';
  insert into employees (name, roles) values ('測試員庚', '{office}');
  update employees set note = 'hr 備註' where id = hr_test.emp('測試員庚');
  assert (select note from employees where id = hr_test.emp('測試員庚')) = 'hr 備註', 'hr-only 可新增、修改員工';
  delete from employees where id = hr_test.emp('測試員庚');
  assert hr_test.emp('測試員庚') is null, 'hr-only 可刪除員工';
  assert (select count(*) from erp_documents) = 0 and (select count(*) from sr_reports) = 0
         and (select count(*) from mx_customers) = 0, 'hr-only 讀不到 erp／sr 資料';
  raise notice 'ok  hr-only：RPC 可用、可維護員工主檔、無 erp／sr 權限';
end $$;
select hr_test.expect_error($q$insert into erp_items (code, name) values ('HRX', '測試')$q$, '42501');

-- 已有紀錄時，erp 仍讀不到
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';
do $$ begin
  assert (select count(*) from employee_private_access_log) = 0, 'erp 讀不到存取紀錄';
end $$;

-- ============================================================
-- 7) 密文不含明文；紀錄不可改刪（postgres 亦然）
-- ============================================================
reset role;
do $$ begin
  assert (select position(convert_to('Z999999999', 'UTF8') in national_id_enc) = 0
            from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b1'),
    '密文不含明文';
  assert (select position(convert_to('虛構路', 'UTF8') in household_address_enc) = 0
            from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b1'),
    '地址密文不含明文';
  assert (select marital_enc is null and education_enc is null
            from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b1'),
    '清除的欄位為 null';
  assert (select updated_by from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b1')
         = '00000000-0000-0000-0000-0000000001a1', 'updated_by = hr 使用者';
  raise notice 'ok  密文不含明文';
end $$;
select hr_test.expect_error($q$update employee_private_access_log set field = 'x'$q$, 'append_only');
select hr_test.expect_error($q$delete from employee_private_access_log$q$, 'append_only');
select hr_test.expect_error($q$truncate employee_private_access_log$q$, 'append_only');

-- ============================================================
-- 8) 金鑰缺失／過短／錯誤
-- ============================================================
create temp table hr_saved_key as select secret from vault.secrets where name = 'employee_pii_key';
delete from vault.secrets where name = 'employee_pii_key';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'hr_key_missing');
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b2')$q$, 'hr_key_missing');
select hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id')$q$, 'hr_key_missing');
select hr_test.expect_error($q$select hr_upsert_employee_private('00000000-0000-0000-0000-0000000002b2', '{"marital":"未婚"}')$q$, 'hr_key_missing');
select hr_test.expect_error($q$select hr_import_employee_private('[]')$q$, 'hr_key_missing');
reset role;
do $$ begin
  assert not exists (select 1 from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b2'),
    '金鑰缺失時不寫入任何資料';
end $$;

-- 空白／過短金鑰
insert into vault.secrets (name, secret) values ('employee_pii_key', '');
set local role authenticated;
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'hr_key_missing');
reset role;
update vault.secrets set secret = 'short-key' where name = 'employee_pii_key';
set local role authenticated;
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'hr_key_missing');
reset role;

-- 錯誤金鑰（例如金鑰被改掉）→ 既有資料無法解密
update vault.secrets set secret = 'another-local-test-only-key-111111111111111' where name = 'employee_pii_key';
set local role authenticated;
select hr_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000002b1')$q$, 'hr_decrypt_failed');
select hr_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000002b1', 'national_id')$q$, 'hr_decrypt_failed');
reset role;

-- 還原測試金鑰
update vault.secrets set secret = (select secret from hr_saved_key) where name = 'employee_pii_key';
do $$ begin
  raise notice 'ok  金鑰缺失／過短／錯誤 → 明確錯誤';
end $$;

-- ============================================================
-- 9) 匯入：維運身分（postgres）與 hr；可重跑、空白不清除、錯誤整批失敗
-- ============================================================
set local request.jwt.claims = '';   -- 不帶任何登入者（auth.uid() = null），純維運身分
do $$
declare
  v      jsonb;
  v_logs int;
  v_rows jsonb := jsonb_build_array(
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b2',
                       'national_id', 'Y888888888', 'household_address', '新竹縣測試市虛構里',
                       'marital', '已婚', 'education', '', 'experience', null),
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b3',
                       'emergency_contact', '測試聯絡人（虛構）'),
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b1',
                       'national_id', 'Z999999999')          -- 與既有相同 → 不重寫
  );
begin
  assert hr_caller_is_maintenance(), 'psql postgres 為維運身分';
  v_logs := hr_test.log_count();
  v := hr_import_employee_private(v_rows);
  assert v = '{"rows":3,"written_fields":4,"unchanged_rows":1}'::jsonb, format('第一次匯入：%s', v);
  assert hr_test.log_count('import') = 4, '每個寫入欄位一筆 import 紀錄';
  assert (select bool_and(user_id is null and actor_role = 'postgres')
            from employee_private_access_log where action = 'import'), '維運身分紀錄 user_id 為 null、角色 postgres';
  assert (select count(*) from employee_private) = 3, '3 位員工有敏感資料列';

  -- 重跑：不重複、不重寫、不新增紀錄
  v := hr_import_employee_private(v_rows);
  assert v = '{"rows":3,"written_fields":0,"unchanged_rows":3}'::jsonb, format('重跑：%s', v);
  assert hr_test.log_count() = v_logs + 4, '重跑不新增紀錄';
  assert (select count(*) from employee_private) = 3, '重跑不重複建列';

  -- 空白不清除既有值
  v := hr_import_employee_private(jsonb_build_array(
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b2', 'national_id', '  ', 'marital', '')));
  assert v = '{"rows":1,"written_fields":0,"unchanged_rows":1}'::jsonb, format('空白不寫：%s', v);
  assert hr_decrypt((select national_id_enc from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b2'),
                    hr_pii_key()) = 'Y888888888', '空白不清除';

  -- 值變更 → 只重寫變更的欄位
  v := hr_import_employee_private(jsonb_build_array(
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b2', 'national_id', 'Y888888888', 'marital', '未婚')));
  assert v = '{"rows":1,"written_fields":1,"unchanged_rows":0}'::jsonb, format('只寫變更欄位：%s', v);
  raise notice 'ok  匯入（維運身分）：可重跑、空白不清除、只寫變更';
end $$;

-- 不存在的員工 → 整批失敗（前面的列也不寫）
select hr_test.expect_error($q$select hr_import_employee_private(jsonb_build_array(
  jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b3', 'marital', '已婚'),
  jsonb_build_object('employee_id', '00000000-0000-0000-0000-00000000ffff', 'marital', '已婚')))$q$, 'not_found');
select hr_test.expect_error($q$select hr_import_employee_private('[{"employee_id":"not-a-uuid"}]')$q$, 'not_found');
select hr_test.expect_error($q$select hr_import_employee_private('{"employee_id":"x"}')$q$, 'validation');
select hr_test.expect_error($q$select hr_import_employee_private('[{"employee_id":"00000000-0000-0000-0000-0000000002b3","salary":"1"}]')$q$, 'validation');
do $$ begin
  assert (select marital_enc from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b3') is null,
    '整批失敗時前面的列也不寫入';
end $$;

-- hr 使用者經 API 匯入
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := hr_import_employee_private(jsonb_build_array(
    jsonb_build_object('employee_id', '00000000-0000-0000-0000-0000000002b3', 'education', '虛構高中')));
  assert v = '{"rows":1,"written_fields":1,"unchanged_rows":0}'::jsonb, format('hr 匯入：%s', v);
  assert exists (select 1 from employee_private_access_log
                  where action = 'import' and user_id = '00000000-0000-0000-0000-0000000001a1'), 'hr 匯入紀錄含使用者';
  raise notice 'ok  hr 經 API 匯入';
end $$;

-- ============================================================
-- 10) 刪除員工（未被引用）：有敏感資料 → 只有 hr／維運身分可刪（cascade、留 delete 紀錄）
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';  -- erp
select hr_test.expect_error($q$delete from employees where id = '00000000-0000-0000-0000-0000000002b3'$q$, 'employee_has_private');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a3","role":"authenticated"}';  -- service_report
select hr_test.expect_error($q$delete from employees where id = '00000000-0000-0000-0000-0000000002b3'$q$, 'employee_has_private');
-- 敏感資料列存在但全部為空 → erp 照常可刪（cascade）
reset role;
insert into employees (id, name, roles) values ('00000000-0000-0000-0000-0000000002b9', '測試員辛', '{sales}');
insert into employee_private (employee_id) values ('00000000-0000-0000-0000-0000000002b9');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';  -- erp
delete from employees where id = '00000000-0000-0000-0000-0000000002b9';
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';  -- hr
delete from employees where id = '00000000-0000-0000-0000-0000000002b3';
reset role;
do $$ begin
  assert not exists (select 1 from employees where id = '00000000-0000-0000-0000-0000000002b9')
     and not exists (select 1 from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b9'),
    '空的敏感資料列不擋刪除';
  assert not exists (select 1 from employee_private where employee_id = '00000000-0000-0000-0000-0000000002b3'),
    'hr 刪除員工 → 敏感資料一併刪除';
  assert exists (select 1 from employee_private_access_log where employee_id = '00000000-0000-0000-0000-0000000002b3'),
    '存取紀錄保留';
  assert (select array_agg(field order by field) from employee_private_access_log
           where employee_id = '00000000-0000-0000-0000-0000000002b3' and action = 'delete'
             and user_id = '00000000-0000-0000-0000-0000000001a1')
         = array['education', 'emergency_contact'], 'hr 刪除時每個非空欄位一筆 delete 紀錄';
  raise notice 'ok  刪除有敏感資料的員工只限 hr、cascade、紀錄保留';
end $$;

-- ============================================================
-- 11) 選取器條件：離職員工不在「在職」清單
-- ============================================================
do $$
declare v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  assert not exists (
    select 1 from employees
     where active and (left_on is null or left_on > v_today)
       and name in ('測試員己')
  ), '離職員工不在在職清單';
  assert exists (
    select 1 from employees
     where active and (left_on is null or left_on > v_today) and name = '測試員丁'
  ), '預定離職（未來）仍在在職清單';
  raise notice 'ok  在職清單條件';
end $$;

do $$ begin raise notice '==== employee_hr_test：全部斷言通過 ===='; end $$;

rollback;
