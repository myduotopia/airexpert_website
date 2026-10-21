-- staff_rbac_test.sql
-- 員工帳號、必改密碼、職位權限（issue #261，0032）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、Z9xx）。
--
-- 涵蓋：has_module 聯集（直接授權、職位權限、離職／預定離職到期失效、職位停用失效、非 staff 帳號不吃職位、
--       must_change_password 時全部為 false）、current_admin_modules、position_permissions 不可含 hr、
--       hr 只來自直接授權（hr_* RPC 對握有全部職位權限的 staff 仍 forbidden）、只有 hr 可寫職位／職位權限／員工職位、
--       已連結帳號的員工改回在職只限 hr、稽核紀錄（觸發器與 RPC、append-only）、保養卡 RLS（office 角色或 maintenance
--       模組）、employees 模組、admin_profiles 不可由 API 角色寫入（含 must_change_password）、帳號 RPC 的檢查與權限、
--       has_module 仍為 stable + security definer。
--       review 修正：停用登入（banned_until）時 has_module 立即失效、hr_link_staff_account 不收編既有／已登入過的
--       auth 使用者且只接受 ASCII 員工編號、已連結帳號的員工只有 hr 能解除連結或刪除。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
-- 帳號：hr（直接授權 hr）、erp（直接授權 erp）、office（角色）、staff 甲／乙／丙／丁、共用帳號（erp 角色、連結員工）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'hr-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a2', 'erp-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a3', 'office-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a4', 'z901@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a5', 'z902@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a6', 'z903@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a7', 'shared-rbac@example.invalid'),
  -- 尚未有 admin_profiles 的 auth 使用者（模擬 server action 剛以 service_role 建立）
  ('00000000-0000-0000-0000-0000000003b1', 'z911@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003b2', 'other-rbac@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'hr',     'hr-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a2', 'erp',    'erp-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a3', 'office', 'office-rbac@example.invalid'),
  ('00000000-0000-0000-0000-0000000003a4', 'staff',  'z901@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a5', 'staff',  'z902@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a6', 'staff',  'z903@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000003a7', 'erp',    'shared-rbac@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000003a1', 'hr'),
  ('00000000-0000-0000-0000-0000000003a2', 'erp');

create schema rbac_test;

create function rbac_test.expect_error(p_sql text, p_code text)
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

-- 以 postgres 身分讀稽核（不受 RLS）
create function rbac_test.audit_count(p_action text, p_employee uuid default null) returns int
language sql security definer as $$
  select count(*)::int from admin_access_audit
   where action = p_action and (p_employee is null or employee_id = p_employee);
$$;
create function rbac_test.login(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
$$;

grant usage on schema rbac_test to authenticated, anon, service_role;
grant execute on all functions in schema rbac_test to authenticated, anon, service_role;

-- 職位（初始職位由 migration 建立，測試另建自己的）
insert into positions (id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000004c1', '測試全權', 900),
  ('00000000-0000-0000-0000-0000000004c2', '測試保養', 910),
  ('00000000-0000-0000-0000-0000000004c3', '測試停用', 920);
insert into position_permissions (position_id, module) values
  ('00000000-0000-0000-0000-0000000004c1', 'erp'),
  ('00000000-0000-0000-0000-0000000004c1', 'service_report'),
  ('00000000-0000-0000-0000-0000000004c1', 'maintenance'),
  ('00000000-0000-0000-0000-0000000004c1', 'employees'),
  ('00000000-0000-0000-0000-0000000004c2', 'maintenance'),
  ('00000000-0000-0000-0000-0000000004c3', 'erp');
update positions set active = false where id = '00000000-0000-0000-0000-0000000004c3';

-- 員工（postgres = 維運身分，可連結與指派）
insert into employees (id, code, name, roles, admin_profile_id, position_id) values
  ('00000000-0000-0000-0000-0000000005d1', 'Z901', '權限測試甲', '{sales}',      '00000000-0000-0000-0000-0000000003a4', '00000000-0000-0000-0000-0000000004c1'),
  ('00000000-0000-0000-0000-0000000005d2', 'Z902', '權限測試乙', '{technician}', '00000000-0000-0000-0000-0000000003a5', '00000000-0000-0000-0000-0000000004c2'),
  ('00000000-0000-0000-0000-0000000005d3', 'Z903', '權限測試丙', '{office}',     '00000000-0000-0000-0000-0000000003a6', '00000000-0000-0000-0000-0000000004c3'),
  ('00000000-0000-0000-0000-0000000005d4', 'Z904', '權限測試丁', '{sales}',      '00000000-0000-0000-0000-0000000003a7', '00000000-0000-0000-0000-0000000004c1'),
  ('00000000-0000-0000-0000-0000000005d5', 'Z911', '權限測試戊', '{sales}',      null, null),
  ('00000000-0000-0000-0000-0000000005d6', null,   '權限測試己', '{sales}',      null, null);

-- ============================================================
-- 1) 結構：模組檢查不含 hr、has_module 屬性、初始職位
-- ============================================================
select rbac_test.expect_error($q$insert into position_permissions (position_id, module) values ('00000000-0000-0000-0000-0000000004c2', 'hr')$q$, '23514');
select rbac_test.expect_error($q$insert into position_permissions (position_id, module) values ('00000000-0000-0000-0000-0000000004c2', 'payroll')$q$, '23514');
do $$ begin
  assert (select provolatile = 's' and prosecdef from pg_proc where oid = 'public.has_module(text)'::regprocedure),
    'has_module 為 stable + security definer';
  assert (select array_agg(name order by sort_order) from positions where sort_order < 900)
         = array['業務', '內勤', '服務', '負責人', '會計'], '初始職位';
  assert not exists (select 1 from position_permissions pp join positions p on p.id = pp.position_id where p.sort_order < 900),
    '初始職位不給任何權限';
  raise notice 'ok  結構、初始職位';
end $$;

-- ============================================================
-- 2) has_module 聯集
-- ============================================================
set local role authenticated;
do $$
begin
  -- staff 甲：全權職位
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a4');
  assert has_module('erp') and has_module('service_report') and has_module('maintenance') and has_module('employees'),
    'staff 甲：職位權限全部生效';
  assert not has_module('hr'), 'staff 甲：職位不可能給 hr';
  assert current_admin_modules() = array['employees', 'erp', 'maintenance', 'service_report'], 'current_admin_modules（甲）';

  -- staff 乙：只有保養
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert has_module('maintenance') and not has_module('erp'), 'staff 乙：只有 maintenance';
  assert current_admin_modules() = array['maintenance'], 'current_admin_modules（乙）';

  -- staff 丙：職位停用 → 無權限
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a6');
  assert not has_module('erp'), 'staff 丙：職位停用 → 失效';
  assert current_admin_modules() = '{}'::text[], 'current_admin_modules（丙）為空';

  -- 共用帳號（erp 角色）連結到全權職位的員工：不吃職位權限
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a7');
  assert not has_module('erp') and not has_module('maintenance'), '非 staff 帳號不因職位取得權限';

  -- 直接授權照舊
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a2');
  assert has_module('erp') and not has_module('maintenance'), 'erp 直接授權不變';
  assert current_admin_modules() = array['erp'], 'current_admin_modules（erp）';
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a1');
  assert has_module('hr') and not has_module('erp'), 'hr 直接授權不變';
  raise notice 'ok  has_module：直接授權 ∪ 職位權限';
end $$;
reset role;

-- staff 甲同時有直接授權 hr（admin 在人員管理頁授予）→ 聯集
insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-0000000003a4', 'hr');
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a4');
  assert has_module('hr') and has_module('erp'), '直接授權 hr ∪ 職位權限';
  raise notice 'ok  直接授權與職位權限聯集';
end $$;
reset role;
delete from admin_module_grants where user_id = '00000000-0000-0000-0000-0000000003a4';

-- hr 只來自直接授權：握有全部職位權限的 staff 呼叫 hr_* → forbidden
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a4');
select rbac_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000005d1')$q$, 'forbidden');
select rbac_test.expect_error($q$select hr_reveal_employee_private('00000000-0000-0000-0000-0000000005d1', 'national_id')$q$, 'forbidden');
reset role;

-- 離職 → 失效；預定離職日到期（active 仍為 true）→ 失效；未來離職日 → 仍有效
update employees set active = false where id = '00000000-0000-0000-0000-0000000005d2';
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert not has_module('maintenance'), '離職（active = false）→ 職位權限失效';
  raise notice 'ok  離職員工失效';
end $$;
reset role;
update employees set active = true, left_on = (now() at time zone 'Asia/Taipei')::date + 10
 where id = '00000000-0000-0000-0000-0000000005d2';
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert has_module('maintenance'), '未來離職日 → 仍有效';
end $$;
reset role;
-- 模擬「離職日已到期但尚未被觸發器改為停用」（關閉 0031 的觸發器只為了造出此狀態）
alter table employees disable trigger employees_left_on_active;
update employees set left_on = (now() at time zone 'Asia/Taipei')::date where id = '00000000-0000-0000-0000-0000000005d2';
alter table employees enable trigger employees_left_on_active;
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert (select active from employees where id = '00000000-0000-0000-0000-0000000005d2') is null, '乙讀不到員工表（只有 maintenance）';
  assert not has_module('maintenance'), '離職日到期 → 立即失效';
  raise notice 'ok  預定離職日到期失效';
end $$;
reset role;
alter table employees disable trigger employees_left_on_active;
update employees set left_on = null, active = true where id = '00000000-0000-0000-0000-0000000005d2';
alter table employees enable trigger employees_left_on_active;

-- 職位權限移除 → 立即失效
delete from position_permissions where position_id = '00000000-0000-0000-0000-0000000004c2' and module = 'maintenance';
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert not has_module('maintenance'), '職位權限移除 → 失效';
end $$;
reset role;
insert into position_permissions (position_id, module) values ('00000000-0000-0000-0000-0000000004c2', 'maintenance');

-- ============================================================
-- 3) must_change_password
-- ============================================================
-- 只有 staff 能為 true
select rbac_test.expect_error($q$update admin_profiles set must_change_password = true where id = '00000000-0000-0000-0000-0000000003a3'$q$, '23514');
update admin_profiles set must_change_password = true where id = '00000000-0000-0000-0000-0000000003a4';
insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-0000000003a4', 'service_report');
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a4');
  assert not has_module('erp') and not has_module('service_report') and not has_module('maintenance'),
    '必改密碼：職位與直接授權皆為 false';
  assert current_admin_modules() = '{}'::text[], '必改密碼：current_admin_modules 為空';
  assert (select must_change_password from admin_profiles where id = auth.uid()), '本人讀得到自己的 must_change_password';
  assert (select count(*) from mx_customers) = 0, '必改密碼：讀不到保養卡';
  raise notice 'ok  必改密碼時沒有任何模組';
end $$;
-- 本人（與任何 API 角色）不可直接改 admin_profiles
select rbac_test.expect_error($q$update admin_profiles set must_change_password = false where id = '00000000-0000-0000-0000-0000000003a4'$q$, '42501');
select rbac_test.expect_error($q$update admin_profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000003a4'$q$, '42501');
select rbac_test.expect_error($q$insert into admin_profiles (id, role, email) values ('00000000-0000-0000-0000-0000000003b2', 'admin', 'x@example.invalid')$q$, '42501');
select rbac_test.expect_error($q$delete from admin_profiles where id = '00000000-0000-0000-0000-0000000003a4'$q$, '42501');
-- 本人不可呼叫清除用的 RPC（只給 service_role）
select rbac_test.expect_error($q$select staff_complete_password_change('00000000-0000-0000-0000-0000000003a4')$q$, '42501');
-- hr 也不可
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
select rbac_test.expect_error($q$select staff_complete_password_change('00000000-0000-0000-0000-0000000003a4')$q$, '42501');
select rbac_test.expect_error($q$update admin_profiles set must_change_password = false$q$, '42501');
set local role anon;
select rbac_test.expect_error($q$select staff_complete_password_change('00000000-0000-0000-0000-0000000003a4')$q$, '42501');
select rbac_test.expect_error($q$select current_admin_modules()$q$, '42501');
-- service_role：清除 + 稽核；非 staff 帳號拒絕
set local role service_role;
select rbac_test.expect_error($q$select staff_complete_password_change('00000000-0000-0000-0000-0000000003a3')$q$, 'not_staff_account');
select staff_complete_password_change('00000000-0000-0000-0000-0000000003a4');
reset role;
do $$ begin
  assert not (select must_change_password from admin_profiles where id = '00000000-0000-0000-0000-0000000003a4'), '已清除';
  assert (select count(*) from admin_access_audit where action = 'password_change'
           and actor_id = '00000000-0000-0000-0000-0000000003a4'
           and target_user_id = '00000000-0000-0000-0000-0000000003a4'
           and employee_id = '00000000-0000-0000-0000-0000000005d1'
           and actor_role = 'service_role') = 1, 'password_change 稽核（actor = 本人）';
  raise notice 'ok  must_change_password 只能由 service_role／hr RPC 寫';
end $$;
delete from admin_module_grants where user_id = '00000000-0000-0000-0000-0000000003a4';

-- ============================================================
-- 4) 只有 hr 可寫職位、職位權限、員工職位
-- ============================================================
set local role authenticated;
do $$
declare v_sub text;
begin
  foreach v_sub in array array[
    '00000000-0000-0000-0000-0000000003a2',   -- erp
    '00000000-0000-0000-0000-0000000003a3',   -- office
    '00000000-0000-0000-0000-0000000003a4'    -- staff 甲（全權職位，含 employees 模組）
  ] loop
    perform rbac_test.login(v_sub);
    assert (select count(*) from positions) = 0, '非 hr 讀不到職位';
    assert (select count(*) from position_permissions) = 0, '非 hr 讀不到職位權限';
    assert (select count(*) from admin_access_audit) = 0, '非 hr 讀不到稽核';
    perform rbac_test.expect_error($q$insert into positions (name) values ('測試越權')$q$, '42501');
    perform rbac_test.expect_error($q$insert into position_permissions (position_id, module) values ('00000000-0000-0000-0000-0000000004c2', 'erp')$q$, '42501');
  end loop;
  raise notice 'ok  非 hr 不可讀寫職位';
end $$;
-- 非 hr 的 update／delete：RLS 篩掉 → 0 列（不報錯也不生效）
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a4');
  update positions set name = '越權改名' where id = '00000000-0000-0000-0000-0000000004c1';
  delete from position_permissions where position_id = '00000000-0000-0000-0000-0000000004c1';
end $$;
reset role;
do $$ begin
  assert (select name from positions where id = '00000000-0000-0000-0000-0000000004c1') = '測試全權', '非 hr 改不了職位';
  assert (select count(*) from position_permissions where position_id = '00000000-0000-0000-0000-0000000004c1') = 4, '非 hr 刪不了權限';
end $$;
-- position_permissions 沒有 update 權限（只能新增／刪除）
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
select rbac_test.expect_error($q$update position_permissions set module = 'erp'$q$, '42501');

-- 員工職位：erp（RLS 可寫整列）與 employees 模組 staff 都不可指派
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');
select rbac_test.expect_error($q$update employees set position_id = '00000000-0000-0000-0000-0000000004c1' where id = '00000000-0000-0000-0000-0000000005d5'$q$, 'position_assign_forbidden');
select rbac_test.expect_error($q$update employees set position_id = null where id = '00000000-0000-0000-0000-0000000005d1'$q$, 'position_assign_forbidden');
select rbac_test.expect_error($q$insert into employees (name, roles, position_id) values ('權限測試越權', '{sales}', '00000000-0000-0000-0000-0000000004c1')$q$, 'position_assign_forbidden');
select rbac_test.login('00000000-0000-0000-0000-0000000003a4');
select rbac_test.expect_error($q$update employees set position_id = '00000000-0000-0000-0000-0000000004c1' where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'position_assign_forbidden');
-- erp 改其他欄位照常（含不動職位的整列更新）
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');
update employees set note = '測試備註', position_id = position_id where id = '00000000-0000-0000-0000-0000000005d1';

-- hr：新增職位、勾選權限、指派員工職位 → 全部有稽核
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
do $$
declare v_pos uuid;
begin
  assert (select count(*) from positions) >= 8, 'hr 讀得到全部職位';
  insert into positions (name, description, sort_order) values ('測試新職位', '測試說明', 930) returning id into v_pos;
  update positions set name = '測試新職位2' where id = v_pos;
  update positions set sort_order = 931 where id = v_pos;              -- 只改排序不記錄
  insert into position_permissions (position_id, module) values (v_pos, 'employees');
  delete from position_permissions where position_id = v_pos and module = 'employees';
  update employees set position_id = v_pos where id = '00000000-0000-0000-0000-0000000005d5';
  update employees set position_id = '00000000-0000-0000-0000-0000000004c2' where id = '00000000-0000-0000-0000-0000000005d5';
  assert (select count(*) from admin_access_audit where position_id = v_pos and action = 'position_create') = 1, 'position_create';
  assert (select count(*) from admin_access_audit where position_id = v_pos and action = 'position_update') = 1, 'position_update（排序不記）';
  assert (select detail #>> '{new,name}' from admin_access_audit where position_id = v_pos and action = 'position_update') = '測試新職位2',
    'position_update 記新名稱';
  assert (select count(*) from admin_access_audit where position_id = v_pos and action = 'position_permission_grant'
           and detail ->> 'module' = 'employees') = 1, 'position_permission_grant';
  assert (select count(*) from admin_access_audit where position_id = v_pos and action = 'position_permission_revoke') = 1,
    'position_permission_revoke';
  assert (select count(*) from admin_access_audit where employee_id = '00000000-0000-0000-0000-0000000005d5'
           and action = 'employee_position_change') = 2, 'employee_position_change × 2';
  assert (select detail ->> 'from_name' from admin_access_audit where employee_id = '00000000-0000-0000-0000-0000000005d5'
           and action = 'employee_position_change' and detail ->> 'to' = '00000000-0000-0000-0000-0000000004c2') = '測試新職位2',
    'employee_position_change 記原職位名稱';
  assert (select bool_and(actor_id = '00000000-0000-0000-0000-0000000003a1' and actor_email = 'hr-rbac@example.invalid'
                          and actor_role = 'authenticated')
            from admin_access_audit where position_id = v_pos), '稽核記錄 hr 身分';
  -- 使用中的職位不可刪；未使用可刪（記 position_delete）
  perform rbac_test.expect_error(format($q$delete from positions where id = %L$q$, '00000000-0000-0000-0000-0000000004c2'), '23503');
  delete from positions where id = v_pos;
  assert (select count(*) from admin_access_audit where position_id = v_pos and action = 'position_delete') = 1, 'position_delete';
  raise notice 'ok  hr 可維護職位與指派，皆有稽核';
end $$;
reset role;

-- 稽核 append-only（含 postgres）
select rbac_test.expect_error($q$update admin_access_audit set action = 'password_reset'$q$, 'append_only');
select rbac_test.expect_error($q$delete from admin_access_audit$q$, 'append_only');
select rbac_test.expect_error($q$truncate admin_access_audit$q$, 'append_only');
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
select rbac_test.expect_error($q$insert into admin_access_audit (actor_role, action) values ('x', 'password_reset')$q$, '42501');
select rbac_test.expect_error($q$delete from admin_access_audit$q$, '42501');
select rbac_test.expect_error($q$select admin_audit_write('password_reset')$q$, '42501');
set local role service_role;
select rbac_test.expect_error($q$insert into admin_access_audit (actor_role, action) values ('x', 'password_reset')$q$, '42501');
reset role;

-- ============================================================
-- 5) 已連結帳號的員工改回在職：只限 hr
-- ============================================================
update employees set active = false where id = '00000000-0000-0000-0000-0000000005d2';
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');   -- erp
select rbac_test.expect_error($q$update employees set active = true where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'employee_reactivate_forbidden');
-- 停用、改資料照常；未連結帳號的員工改回在職照常
update employees set note = '離職測試' where id = '00000000-0000-0000-0000-0000000005d2';
update employees set active = false where id = '00000000-0000-0000-0000-0000000005d5';
update employees set active = true where id = '00000000-0000-0000-0000-0000000005d5';
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');   -- hr
update employees set active = true where id = '00000000-0000-0000-0000-0000000005d2';
reset role;
do $$ begin
  assert (select active from employees where id = '00000000-0000-0000-0000-0000000005d2'), 'hr 可改回在職';
  raise notice 'ok  改回在職只限 hr';
end $$;

-- ============================================================
-- 6) 保養卡 RLS：office 角色 或 maintenance 模組
-- ============================================================
insert into mx_customers (id, name) values ('00000000-0000-0000-0000-0000000006e1', '測試保養客戶');
set local role authenticated;
do $$ begin
  -- office 角色（無模組）：照舊可讀寫
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a3');
  assert (select count(*) from mx_customers where id = '00000000-0000-0000-0000-0000000006e1') = 1, 'office 可讀';
  insert into mx_customers (name) values ('測試 office 新增');
  insert into mx_machines (customer_id, serial_no) values ('00000000-0000-0000-0000-0000000006e1', 'Z9-RBAC-1');
  insert into mx_machine_columns (machine_id, label)
    select id, '測試濾蕊' from mx_machines where serial_no = 'Z9-RBAC-1';
  -- staff 乙（maintenance 模組）：可讀寫
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert (select count(*) from mx_customers where id = '00000000-0000-0000-0000-0000000006e1') = 1, 'maintenance 模組可讀';
  insert into mx_customers (name) values ('測試 staff 新增');
  insert into mx_records (machine_id, note) select id, '測試保養' from mx_machines where serial_no = 'Z9-RBAC-1';
  assert (select count(*) from mx_machine_columns) >= 1, 'maintenance 模組可讀 mx_machine_columns';
  update mx_customers set note = '測試更新' where id = '00000000-0000-0000-0000-0000000006e1';
  -- staff 丙（職位停用）：讀不到
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a6');
  assert (select count(*) from mx_customers) = 0, '無 maintenance 讀不到保養卡';
  assert (select count(*) from mx_records) = 0, '無 maintenance 讀不到保養紀錄';
  -- hr（無 maintenance）：讀不到
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a1');
  assert (select count(*) from mx_customers) = 0, 'hr 讀不到保養卡';
  raise notice 'ok  保養卡 RLS：office 或 maintenance';
end $$;
select rbac_test.login('00000000-0000-0000-0000-0000000003a6');
select rbac_test.expect_error($q$insert into mx_customers (name) values ('測試越權')$q$, '42501');
-- erp 直接授權：既有 erp policy 照舊（可讀客戶、不可讀保養紀錄）
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');
do $$ begin
  assert (select count(*) from mx_customers where id = '00000000-0000-0000-0000-0000000006e1') = 1, 'erp 照舊可讀客戶';
  assert (select count(*) from mx_records) = 0, 'erp 照舊讀不到保養紀錄';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from pg_policies where tablename like 'mx\_%' and policyname like 'office all %'),
    '舊 office policy 已移除';
  assert (select count(*) from pg_policies where tablename like 'mx\_%' and policyname like 'maintenance all %') = 5,
    '五張 mx 表皆有 maintenance policy';
end $$;

-- ============================================================
-- 7) employees 模組：可讀寫非敏感欄位，不可讀敏感資料
-- ============================================================
update positions set active = true where id = '00000000-0000-0000-0000-0000000004c3';
delete from position_permissions where position_id = '00000000-0000-0000-0000-0000000004c3';
insert into position_permissions (position_id, module) values ('00000000-0000-0000-0000-0000000004c3', 'employees');
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a6');   -- staff 丙：只有 employees
do $$ begin
  assert has_module('employees') and not has_module('erp'), '丙：只有 employees';
  assert (select count(*) from employees where id = '00000000-0000-0000-0000-0000000005d1') = 1, 'employees 模組可讀員工';
  insert into employees (name, roles) values ('權限測試新增', '{sales}');
  update employees set phone = '00-0000-0000' where id = '00000000-0000-0000-0000-0000000005d6';
  raise notice 'ok  employees 模組可維護非敏感欄位';
end $$;
select rbac_test.expect_error($q$select hr_get_employee_private('00000000-0000-0000-0000-0000000005d1')$q$, 'forbidden');
select rbac_test.expect_error($q$select * from employee_private$q$, '42501');
select rbac_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000003a6' where id = '00000000-0000-0000-0000-0000000005d6'$q$, 'admin_link_forbidden');
-- review 修正：已連結帳號的員工，API 使用者只有 hr 能解除連結或刪除（否則可讓他人帳號失去權限且無法重新連結）
select rbac_test.expect_error($q$update employees set admin_profile_id = null where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'admin_unlink_forbidden');
select rbac_test.expect_error($q$delete from employees where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'employee_linked_delete_forbidden');
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');   -- erp（RLS 可寫整列）
select rbac_test.expect_error($q$update employees set admin_profile_id = null where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'admin_unlink_forbidden');
select rbac_test.expect_error($q$delete from employees where id = '00000000-0000-0000-0000-0000000005d2'$q$, 'employee_linked_delete_forbidden');
-- 未連結的員工照常可刪
delete from employees where name = '權限測試新增';
reset role;
do $$ begin
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000005d2')
         = '00000000-0000-0000-0000-0000000003a5', '連結保留';
  assert not exists (select 1 from employees where name = '權限測試新增'), '未連結的員工可刪';
end $$;
-- hr 可解除連結（之後恢復，供後續測試使用）
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
update employees set admin_profile_id = null where id = '00000000-0000-0000-0000-0000000005d3';
reset role;
do $$ begin
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000005d3') is null, 'hr 可解除連結';
  assert (select count(*) from admin_access_audit where action = 'account_unlink'
           and employee_id = '00000000-0000-0000-0000-0000000005d3'
           and target_user_id = '00000000-0000-0000-0000-0000000003a6'
           and actor_id = '00000000-0000-0000-0000-0000000003a1'
           and detail ->> 'from_email' = 'z903@airexpert.com.tw') = 1, '解除連結有稽核（account_unlink）';
  raise notice 'ok  已連結的員工只有 hr 能解除連結或刪除';
end $$;
update employees set admin_profile_id = '00000000-0000-0000-0000-0000000003a6' where id = '00000000-0000-0000-0000-0000000005d3';
do $$ begin
  assert (select count(*) from admin_access_audit where action = 'account_link'
           and employee_id = '00000000-0000-0000-0000-0000000005d3'
           and actor_role = 'postgres' and detail ->> 'to_email' = 'z903@airexpert.com.tw') = 2,
    '直接寫 admin_profile_id 的連結也有稽核（account_link：§0 建立員工時一筆 + 重新連結一筆）';
  raise notice 'ok  連結／解除連結的稽核';
end $$;

-- ============================================================
-- 8) 帳號 RPC：hr_link_staff_account
-- ============================================================
set local role authenticated;
-- 非 hr → forbidden
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b1')$q$, 'forbidden');
select rbac_test.login('00000000-0000-0000-0000-0000000003a4');   -- staff（全權職位，不含 hr）
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b1')$q$, 'forbidden');
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');   -- hr
-- 員工沒有編號
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d6', '00000000-0000-0000-0000-0000000003b1')$q$, 'employee_code_missing');
-- email 與員工編號不符（z911@ 對 Z901 已有帳號 → 先檢查已有帳號）
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d1', '00000000-0000-0000-0000-0000000003b1')$q$, 'employee_has_account');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b2')$q$, 'account_email_mismatch');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', gen_random_uuid())$q$, 'account_email_mismatch');
select rbac_test.expect_error($q$select hr_link_staff_account(gen_random_uuid(), '00000000-0000-0000-0000-0000000003b1')$q$, 'employee_not_found');
reset role;
-- 已是後台帳號（admin_profiles 已存在）→ account_exists
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000003b3', 'z912@airexpert.com.tw');
insert into admin_profiles (id, role, email) values ('00000000-0000-0000-0000-0000000003b3', 'erp', 'z912@airexpert.com.tw');
insert into employees (id, code, name, roles) values ('00000000-0000-0000-0000-0000000005d7', ' Z912 ', '權限測試庚', '{sales}');
-- 離職員工不可建立
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000003b4', 'z913@airexpert.com.tw');
insert into employees (id, code, name, roles, active) values ('00000000-0000-0000-0000-0000000005d8', 'Z913', '權限測試辛', '{sales}', false);
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d7', '00000000-0000-0000-0000-0000000003b3')$q$, 'account_exists');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d8', '00000000-0000-0000-0000-0000000003b4')$q$, 'employee_inactive');
reset role;
-- review 修正：只能連結剛建立、從未登入的 auth 使用者；員工編號只能是 ASCII 英數與 . _ -
insert into auth.users (id, email, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000003b5', 'z914@airexpert.com.tw', now());               -- 已登入過
insert into auth.users (id, email, created_at) values
  ('00000000-0000-0000-0000-0000000003b6', 'z915@airexpert.com.tw', now() - interval '1 day'), -- 既有帳號
  ('00000000-0000-0000-0000-0000000003b7', 'k921@airexpert.com.tw', now());
insert into employees (id, code, name, roles) values
  ('00000000-0000-0000-0000-0000000005e1', 'Z914', '權限測試壬', '{sales}'),
  ('00000000-0000-0000-0000-0000000005e2', 'Z915', '權限測試癸', '{sales}'),
  -- KELVIN SIGN（U+212A）＋全形數字：前端 staffEmailFor 不接受，DB 端也必須擋
  ('00000000-0000-0000-0000-0000000005e3', U&'\212A921', '權限測試子', '{sales}'),
  ('00000000-0000-0000-0000-0000000005e4', U&'Z\FF19\FF12\FF11', '權限測試丑', '{sales}'),
  ('00000000-0000-0000-0000-0000000005e5', 'z9 16', '權限測試寅', '{sales}');
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000003b5')$q$, 'account_not_new');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005e2', '00000000-0000-0000-0000-0000000003b6')$q$, 'account_not_new');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005e3', '00000000-0000-0000-0000-0000000003b7')$q$, 'employee_code_invalid');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005e4', '00000000-0000-0000-0000-0000000003b7')$q$, 'employee_code_invalid');
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005e5', '00000000-0000-0000-0000-0000000003b7')$q$, 'employee_code_invalid');
reset role;
do $$ begin
  assert not exists (select 1 from admin_profiles where id in ('00000000-0000-0000-0000-0000000003b5',
    '00000000-0000-0000-0000-0000000003b6', '00000000-0000-0000-0000-0000000003b7')), '既有／不合規的帳號未被收編';
  raise notice 'ok  hr_link_staff_account 不收編既有帳號、不接受非 ASCII 編號';
end $$;
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');
-- 成功
select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b1');
reset role;
do $$ begin
  assert (select role = 'staff' and must_change_password and email = 'z911@airexpert.com.tw'
            from admin_profiles where id = '00000000-0000-0000-0000-0000000003b1'), '建立 staff、必改密碼';
  assert (select admin_profile_id from employees where id = '00000000-0000-0000-0000-0000000005d5')
         = '00000000-0000-0000-0000-0000000003b1', '已連結員工';
  assert rbac_test.audit_count('account_create', '00000000-0000-0000-0000-0000000005d5') = 1, 'account_create 稽核';
  assert (select actor_id from admin_access_audit where action = 'account_create'
           and employee_id = '00000000-0000-0000-0000-0000000005d5') = '00000000-0000-0000-0000-0000000003a1', '稽核 actor = hr';
  assert rbac_test.audit_count('account_link', '00000000-0000-0000-0000-0000000005d5') = 0,
    '經 hr_link_staff_account 建立時不重複記 account_link';
  raise notice 'ok  hr_link_staff_account';
end $$;
-- 新帳號：必改密碼 → 即使職位有保養也沒有模組
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003b1');
  assert not has_module('maintenance'), '新帳號必改密碼前沒有模組';
end $$;
-- service_role／anon 不可執行 hr 帳號 RPC
set local role service_role;
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b1')$q$, '42501');
select rbac_test.expect_error($q$select hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000005d5')$q$, '42501');
set local role anon;
select rbac_test.expect_error($q$select hr_link_staff_account('00000000-0000-0000-0000-0000000005d5', '00000000-0000-0000-0000-0000000003b1')$q$, '42501');
select rbac_test.expect_error($q$select hr_log_staff_login('00000000-0000-0000-0000-0000000005d5', true)$q$, '42501');
reset role;

-- service_role 直接寫 admin_profile_id 仍被 0031 的觸發器擋（建立帳號必須走 hr 身分的 RPC）
set local role service_role;
select rbac_test.expect_error($q$update employees set admin_profile_id = '00000000-0000-0000-0000-0000000003b4' where id = '00000000-0000-0000-0000-0000000005d8'$q$, 'admin_link_forbidden');
reset role;

-- ============================================================
-- 9) hr_flag_staff_password_reset／hr_log_staff_login
-- ============================================================
set local role authenticated;
select rbac_test.login('00000000-0000-0000-0000-0000000003a2');   -- erp
select rbac_test.expect_error($q$select hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000005d1')$q$, 'forbidden');
select rbac_test.expect_error($q$select hr_log_staff_login('00000000-0000-0000-0000-0000000005d1', true)$q$, 'forbidden');
select rbac_test.login('00000000-0000-0000-0000-0000000003a1');   -- hr
-- 未建立帳號／連結到非 staff 帳號（共用帳號）→ 拒絕
select rbac_test.expect_error($q$select hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000005d6')$q$, 'employee_no_account');
select rbac_test.expect_error($q$select hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000005d4')$q$, 'not_staff_account');
select rbac_test.expect_error($q$select hr_log_staff_login('00000000-0000-0000-0000-0000000005d4', true)$q$, 'not_staff_account');
do $$ begin
  assert hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000005d1') = '00000000-0000-0000-0000-0000000003a4', '回傳帳號 id';
  assert hr_log_staff_login('00000000-0000-0000-0000-0000000005d1', true) = '00000000-0000-0000-0000-0000000003a4', '停用登入';
  assert hr_log_staff_login('00000000-0000-0000-0000-0000000005d1', false) = '00000000-0000-0000-0000-0000000003a4', '恢復登入';
end $$;
reset role;
do $$ begin
  assert (select must_change_password from admin_profiles where id = '00000000-0000-0000-0000-0000000003a4'), '重設 → 必改密碼';
  assert rbac_test.audit_count('password_reset', '00000000-0000-0000-0000-0000000005d1') = 1, 'password_reset 稽核';
  assert rbac_test.audit_count('login_disable', '00000000-0000-0000-0000-0000000005d1') = 1, 'login_disable 稽核';
  assert rbac_test.audit_count('login_enable', '00000000-0000-0000-0000-0000000005d1') = 1, 'login_enable 稽核';
  assert not (select must_change_password from admin_profiles where id = '00000000-0000-0000-0000-0000000003a7'), '共用帳號不受影響';
  raise notice 'ok  重設密碼與停用登入';
end $$;

-- ============================================================
-- 9b) 停用登入（Auth banned_until）→ has_module 立即失效（review 修正：不必等 access token 到期）
-- ============================================================
update auth.users set banned_until = now() + interval '876000 hours' where id = '00000000-0000-0000-0000-0000000003a5';
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');   -- staff 乙（maintenance）
  assert not has_module('maintenance'), '停用登入 → 職位權限失效';
  assert current_admin_modules() = '{}'::text[], '停用登入 → current_admin_modules 為空';
  assert (select count(*) from mx_customers) = 0, '停用登入 → 讀不到保養卡';
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a1');   -- 其他帳號不受影響
  assert has_module('hr'), 'hr 不受他人停用影響';
  assert has_module(null) = false, 'has_module(null) 為 false（不是 null）';
end $$;
select rbac_test.login('00000000-0000-0000-0000-0000000003a5');
select rbac_test.expect_error($q$insert into mx_customers (name) values ('測試停用後寫入')$q$, '42501');
reset role;
update auth.users set banned_until = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000003a5';
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a5');
  assert has_module('maintenance'), '停用期間已過（恢復登入）→ 權限恢復';
  raise notice 'ok  停用登入立即讓 has_module 失效';
end $$;
reset role;
update auth.users set banned_until = null where id = '00000000-0000-0000-0000-0000000003a5';

-- ============================================================
-- 10) hr 讀得到稽核
-- ============================================================
set local role authenticated;
do $$ begin
  perform rbac_test.login('00000000-0000-0000-0000-0000000003a1');
  assert (select count(*) from admin_access_audit) > 0, 'hr 讀得到稽核';
  raise notice 'ok  hr 讀得到稽核';
end $$;
reset role;

do $$ begin raise notice '==== staff_rbac_test：全部斷言通過 ===='; end $$;

rollback;
