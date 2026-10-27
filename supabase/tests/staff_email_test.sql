-- staff_email_test.sql
-- 員工帳號登入 email 修改（issue #265，0034）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、example.com、Z9xx）。
--
-- 涵蓋：admin_mask_email、staff_login_email_valid（與前端 maskEmail／normalizeLoginEmail 一致）、
--       只限 hr 或維運身分（erp、員工本人、anon、service_role 皆不行）、只限 staff 帳號、格式、重複（其他 auth 使用者
--       與 admin_profiles，不分大小寫）、與目前相同、apply 只同步 Auth 的實際狀態（auth_email_mismatch）、
--       稽核 account_email_change（遮罩、不含原始 email、重試不重複記錄）、維運身分、改 email 後職位權限／重設密碼／
--       停用照常（以 employees.admin_profile_id 對應，不看 email）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'hr-email@example.invalid'),
  ('00000000-0000-0000-0000-0000000006a2', 'erp-email@example.invalid'),
  ('00000000-0000-0000-0000-0000000006a3', 'z921@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000006a4', 'z922@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000006a5', 'shared-email@example.invalid'),
  -- 沒有後台帳號的 auth 使用者（email 以大寫存，重複檢查須不分大小寫）
  ('00000000-0000-0000-0000-0000000006a6', 'Taken-Auth@Example.invalid'),
  -- admin_profiles.email 與 Auth 不同的舊資料（重複檢查也看 admin_profiles）
  ('00000000-0000-0000-0000-0000000006a7', 'legacy-auth@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'hr',    'hr-email@example.invalid'),
  ('00000000-0000-0000-0000-0000000006a2', 'erp',   'erp-email@example.invalid'),
  ('00000000-0000-0000-0000-0000000006a3', 'staff', 'z921@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000006a4', 'staff', 'z922@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000006a5', 'erp',   'shared-email@example.invalid'),
  ('00000000-0000-0000-0000-0000000006a7', 'erp',   'Legacy-Profile@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000006a1', 'hr'),
  ('00000000-0000-0000-0000-0000000006a2', 'erp');

insert into positions (id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000006c1', '測試 email 保養', 950);
insert into position_permissions (position_id, module) values
  ('00000000-0000-0000-0000-0000000006c1', 'maintenance');

insert into employees (id, code, name, roles, admin_profile_id, position_id) values
  ('00000000-0000-0000-0000-0000000006d1', 'Z921', 'email 測試甲', '{sales}', '00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000006c1'),
  ('00000000-0000-0000-0000-0000000006d2', 'Z922', 'email 測試乙', '{sales}', '00000000-0000-0000-0000-0000000006a4', null),
  ('00000000-0000-0000-0000-0000000006d3', 'Z923', 'email 測試丙', '{sales}', '00000000-0000-0000-0000-0000000006a5', null),
  ('00000000-0000-0000-0000-0000000006d4', 'Z924', 'email 測試丁', '{sales}', null, null);

create schema email_test;

create function email_test.expect_error(p_sql text, p_code text)
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

create function email_test.audit_count(p_action text, p_employee uuid default null) returns int
language sql security definer as $$
  select count(*)::int from admin_access_audit
   where action = p_action and (p_employee is null or employee_id = p_employee);
$$;
create function email_test.login(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
$$;
-- 以 postgres 身分讀 admin_profiles（不受 RLS）
create function email_test.profile_email(p_id uuid) returns text
language sql security definer as $$
  select email from admin_profiles where id = p_id;
$$;

grant usage on schema email_test to authenticated, anon, service_role;
grant execute on all functions in schema email_test to authenticated, anon, service_role;

-- ============================================================
-- 1) 遮罩與格式（與前端 maskEmail／normalizeLoginEmail 一致）
-- ============================================================
do $$ begin
  assert admin_mask_email('tester@example.com') = 't***@example.com', '遮罩：首字 + *** + @網域';
  assert admin_mask_email('  Tester@Example.COM ') = 't***@example.com', '遮罩：去空白、小寫';
  assert admin_mask_email('a@b.co') = 'a***@b.co', '遮罩：一個字的本地部分也只留首字';
  assert admin_mask_email('a@b@example.com') = 'a***@example.com', '遮罩：以最後一個 @ 分網域';
  assert admin_mask_email('@example.com') = '***', '遮罩：沒有本地部分';
  assert admin_mask_email('no-at-sign') = '***', '遮罩：沒有 @';
  assert admin_mask_email(null) is null and admin_mask_email('  ') is null, '遮罩：空值為 null';

  assert staff_login_email_valid('tester@example.com'), '格式：一般 email';
  assert staff_login_email_valid('a.b+c_d%e-f@sub.example-1.co'), '格式：本地部分可含 . + _ % -、多層網域';
  assert staff_login_email_valid('z901@airexpert.com.tw'), '格式：公司網域也可以';
  assert not staff_login_email_valid('Tester@example.com'), '格式：須已轉小寫';
  assert not staff_login_email_valid(' tester@example.com'), '格式：須已去空白';
  assert not staff_login_email_valid('tester@example.com,other@example.com'), '格式：只能一個 email（逗號）';
  assert not staff_login_email_valid('tester@example.com other@example.com'), '格式：只能一個 email（空白）';
  assert not staff_login_email_valid('a@b@example.com'), '格式：只能一個 @';
  assert not staff_login_email_valid('tester@example'), '格式：網域需有 .';
  assert not staff_login_email_valid('tester@example.c'), '格式：頂級網域至少 2 字';
  assert not staff_login_email_valid('tester@example.c0m'), '格式：頂級網域只能是英文字母';
  assert not staff_login_email_valid('.tester@example.com'), '格式：本地部分不可以 . 開頭';
  assert not staff_login_email_valid('tester.@example.com'), '格式：本地部分不可以 . 結尾';
  assert not staff_login_email_valid('te..ster@example.com'), '格式：本地部分不可連續 .';
  assert not staff_login_email_valid('tester@-example.com'), '格式：網域標籤不可以 - 開頭';
  assert not staff_login_email_valid('tester@example-.com'), '格式：網域標籤不可以 - 結尾';
  assert not staff_login_email_valid('tester@example..com'), '格式：網域不可連續 .';
  assert not staff_login_email_valid('ｔester@example.com'), '格式：只接受 ASCII（全形字）';
  assert not staff_login_email_valid(U&'\212Aelvin@example.com'), '格式：只接受 ASCII（KELVIN SIGN 不會被當成 k）';
  assert not staff_login_email_valid('tester"x@example.com'), '格式：本地部分不接受引號等特殊字元';
  assert not staff_login_email_valid(repeat('a', 65) || '@example.com'), '格式：本地部分最多 64 字';
  assert staff_login_email_valid(repeat('a', 64) || '@example.com'), '格式：本地部分 64 字可以';
  assert not staff_login_email_valid('a@' || repeat('b', 64) || '.com'), '格式：網域標籤最多 63 字';
  assert not staff_login_email_valid('a@' || repeat(repeat('b', 60) || '.', 5) || 'com'), '格式：全長最多 254 字';
  assert not staff_login_email_valid(''), '格式：空字串';
  assert staff_login_email_valid(null) = false, '格式：null 為 false（不是 null）';
  raise notice 'ok  遮罩與格式';
end $$;

-- ============================================================
-- 2) 只限 hr 或維運身分
-- ============================================================
-- anon／service_role 沒有執行權限
set local role anon;
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, '42501');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, '42501');
reset role;
set local role service_role;
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, '42501');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, '42501');
-- 內部函式不對外
select email_test.expect_error($q$select staff_email_change_assert('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, '42501');
reset role;

set local role authenticated;
-- erp（非 hr）
select email_test.login('00000000-0000-0000-0000-0000000006a2');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'forbidden');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'forbidden');
-- 員工本人（有 maintenance 職位權限，但沒有 hr）
select email_test.login('00000000-0000-0000-0000-0000000006a3');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'forbidden');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'forbidden');
-- 偽造維運身分（JWT role）不算
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000006a2","role":"postgres"}', true);
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'forbidden');
reset role;

-- ============================================================
-- 3) hr：檢查（只限 staff、格式、重複、相同）
-- ============================================================
set local role authenticated;
select email_test.login('00000000-0000-0000-0000-0000000006a1');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d4', 'tester@example.com')$q$, 'employee_no_account');
select email_test.expect_error($q$select hr_check_staff_email_change(gen_random_uuid(), 'tester@example.com')$q$, 'employee_no_account');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d3', 'tester@example.com')$q$, 'not_staff_account');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d3', 'shared-email@example.invalid')$q$, 'not_staff_account');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'Tester@example.com')$q$, 'email_invalid');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com,b@example.com')$q$, 'email_invalid');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', null)$q$, 'email_invalid');
-- 其他 auth 使用者（不分大小寫）、其他員工帳號、admin_profiles 的 email（與 Auth 不同的舊資料）
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'taken-auth@example.invalid')$q$, 'email_taken');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'z922@airexpert.com.tw')$q$, 'email_taken');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'legacy-profile@example.invalid')$q$, 'email_taken');
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'hr-email@example.invalid')$q$, 'email_taken');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'taken-auth@example.invalid')$q$, 'email_taken');
-- 與目前相同
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'z921@airexpert.com.tw')$q$, 'email_unchanged');
do $$
declare r record;
begin
  select * into r from hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com');
  assert r.user_id = '00000000-0000-0000-0000-0000000006a3', '回傳員工連結的帳號 id';
  assert r.auth_email = 'z921@airexpert.com.tw' and r.profile_email = 'z921@airexpert.com.tw', '回傳目前 email';
  raise notice 'ok  檢查通過時回傳帳號 id 與目前 email';
end $$;
reset role;
do $$ begin
  assert email_test.audit_count('account_email_change') = 0, '檢查不寫稽核';
  assert email_test.profile_email('00000000-0000-0000-0000-0000000006a3') = 'z921@airexpert.com.tw', '檢查不寫入';
end $$;

-- ============================================================
-- 4) hr：同步（Auth 尚未改 → 拒絕；改了 → 同步並寫稽核）
-- ============================================================
set local role authenticated;
select email_test.login('00000000-0000-0000-0000-0000000006a1');
select email_test.expect_error($q$select hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'auth_email_mismatch');
reset role;
do $$ begin
  assert email_test.audit_count('account_email_change') = 0, 'auth_email_mismatch 不寫稽核';
  assert email_test.profile_email('00000000-0000-0000-0000-0000000006a3') = 'z921@airexpert.com.tw', 'auth_email_mismatch 不改 admin_profiles';
end $$;

-- 模擬 server action 以 service_role 呼叫 Auth admin API 改 email
update auth.users set email = 'tester@example.com' where id = '00000000-0000-0000-0000-0000000006a3';

set local role authenticated;
select email_test.login('00000000-0000-0000-0000-0000000006a1');
do $$ begin
  assert hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')
         = '00000000-0000-0000-0000-0000000006a3', '回傳帳號 id';
  -- 重試（已同步）：回傳帳號 id，不重複記錄
  assert hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')
         = '00000000-0000-0000-0000-0000000006a3', '重試回傳帳號 id';
end $$;
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester@example.com')$q$, 'email_unchanged');
-- 原本的公司 email 已釋出，可改回
do $$
declare r record;
begin
  select * into r from hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'z921@airexpert.com.tw');
  assert r.auth_email = 'tester@example.com', '目前 email 為新 email';
end $$;
reset role;

do $$
declare a admin_access_audit;
begin
  assert email_test.profile_email('00000000-0000-0000-0000-0000000006a3') = 'tester@example.com', 'admin_profiles.email 已同步';
  assert email_test.audit_count('account_email_change') = 1, '一筆稽核（重試不重複記錄）';
  select * into a from admin_access_audit where action = 'account_email_change';
  assert a.actor_id = '00000000-0000-0000-0000-0000000006a1' and a.actor_email = 'hr-email@example.invalid'
         and a.actor_role = 'authenticated', '稽核操作者為 hr';
  assert a.employee_id = '00000000-0000-0000-0000-0000000006d1' and a.target_user_id = '00000000-0000-0000-0000-0000000006a3',
    '稽核對應員工與帳號';
  assert a.detail ->> 'from_email' = 'z***@airexpert.com.tw', '舊 email 遮罩';
  assert a.detail ->> 'to_email' = 't***@example.com', '新 email 遮罩';
  assert a.detail ->> 'employee_name' = 'email 測試甲', '稽核記員工姓名';
  assert a.detail::text not like '%tester@%' and a.detail::text not like '%z921@%', '稽核不含原始 email';
  raise notice 'ok  同步 admin_profiles 並寫遮罩稽核';
end $$;

-- 稽核 append-only
select email_test.expect_error($q$update admin_access_audit set detail = '{}' where action = 'account_email_change'$q$, 'append_only');

-- 先前回滾也失敗（Auth 已是新 email、admin_profiles 仍是舊值）→ 檢查通過、再同步一次即可補齊
update auth.users set email = 'tester2@example.com' where id = '00000000-0000-0000-0000-0000000006a3';
set local role authenticated;
select email_test.login('00000000-0000-0000-0000-0000000006a1');
do $$
declare r record;
begin
  select * into r from hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester2@example.com');
  assert r.auth_email = 'tester2@example.com' and r.profile_email = 'tester@example.com', 'Auth 與 admin_profiles 不一致時照常檢查通過';
  perform hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d1', 'tester2@example.com');
end $$;
reset role;
do $$ begin
  assert email_test.profile_email('00000000-0000-0000-0000-0000000006a3') = 'tester2@example.com', '補齊 admin_profiles';
  assert email_test.audit_count('account_email_change') = 2, '補齊時寫一筆稽核';
end $$;

-- ============================================================
-- 5) 改 email 後：職位權限、重設密碼、停用照常（以 admin_profile_id 對應，不看 email）
-- ============================================================
set local role authenticated;
do $$ begin
  perform email_test.login('00000000-0000-0000-0000-0000000006a3');
  assert has_module('maintenance'), '改 email 後職位權限照常';
  perform email_test.login('00000000-0000-0000-0000-0000000006a1');
  assert hr_flag_staff_password_reset('00000000-0000-0000-0000-0000000006d1') = '00000000-0000-0000-0000-0000000006a3',
    '改 email 後重設密碼照常';
  assert hr_log_staff_login('00000000-0000-0000-0000-0000000006d1', true) = '00000000-0000-0000-0000-0000000006a3',
    '改 email 後停用照常';
  raise notice 'ok  改 email 後帳號操作照常';
end $$;
reset role;
-- 重設密碼後必改密碼 → 本人沒有任何模組（與 email 無關）
update admin_profiles set must_change_password = false where id = '00000000-0000-0000-0000-0000000006a3';

-- ============================================================
-- 6) 維運身分（postgres，一次性套用腳本）
-- ============================================================
select set_config('request.jwt.claims', '', true);
update auth.users set email = 'tester3@example.com' where id = '00000000-0000-0000-0000-0000000006a4';
do $$
declare r record;
begin
  select * into r from hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d2', 'tester3@example.com');
  assert r.user_id = '00000000-0000-0000-0000-0000000006a4', '維運身分可檢查';
  assert hr_apply_staff_email_change('00000000-0000-0000-0000-0000000006d2', 'tester3@example.com')
         = '00000000-0000-0000-0000-0000000006a4', '維運身分可同步';
  assert (select actor_id is null and actor_role = 'postgres' and detail ->> 'to_email' = 't***@example.com'
            from admin_access_audit where action = 'account_email_change' and employee_id = '00000000-0000-0000-0000-0000000006d2'),
    '維運身分的稽核：actor 為 null、role postgres';
  raise notice 'ok  維運身分';
end $$;
-- 維運身分也只限 staff
select email_test.expect_error($q$select hr_check_staff_email_change('00000000-0000-0000-0000-0000000006d3', 'tester4@example.com')$q$, 'not_staff_account');

do $$ begin raise notice '==== staff_email_test：全部斷言通過 ===='; end $$;

rollback;
