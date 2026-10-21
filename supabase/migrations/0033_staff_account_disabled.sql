-- 0033_staff_account_disabled.sql
-- 員工帳號建立後預設停用（issue #263，以 0032 的 hr_link_staff_account 為底）。
--   * 前端「建立後先停用」（預設勾選）：server action 以 service_role 建立 auth 使用者時直接帶 ban_duration
--     （auth.users.banned_until 在未來），再以 hr 本人的 session 呼叫 hr_link_staff_account 連結。
--   * 本檔只改 hr_link_staff_account 的稽核內容：account_create 的 detail 加上 login_disabled
--     （建立當下 auth.users.banned_until > now()）。由 DB 讀 Auth 的實際狀態，不是呼叫端宣稱，
--     稽核紀錄可看出帳號「建立時就是停用」。其餘檢查與 0032 完全相同。
--   * 停用不影響 created_at／last_sign_in_at：「15 分鐘內建立、從未登入」的檢查對已停用的新帳號照常通過
--     （staff_rbac_test.sql 8c 驗證）。
--   * 啟用／停用帳號的稽核動作碼沿用 0032 的 login_enable／login_disable（前端顯示改為「啟用帳號／停用帳號」），
--     不改 admin_access_audit_action_check，既有紀錄的意義不變。
--
-- 依賴 0032（hr_link_staff_account、admin_audit_write、staff_email_for_code、employee_is_current、hr_assert_access）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（pooler 連線或 SQL Editor，身分須為 postgres）。
-- 上線順序：與前端無先後依賴。未套用本檔時，新前端照常可建立已停用的帳號，只是 account_create 稽核沒有
--    login_disabled 欄位（頁面不顯示「建立時已停用」）；套用本檔、舊前端也照常運作。
-- 重跑：本檔可重複執行（create or replace function，簽章與 0032 相同）。
--    ⚠️ 重跑 0032 會把 hr_link_staff_account 蓋回 0032 版（detail 沒有 login_disabled），之後必須再重跑本檔；
--    local-db.sh 已把本檔放在 0032 之後重跑。

create or replace function hr_link_staff_account(p_employee_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp      employees;
  v_email    text;
  v_disabled boolean;
begin
  perform hr_assert_access();

  select * into v_emp from employees where id = p_employee_id for update;
  if v_emp.id is null then
    raise exception using errcode = 'P0001', message = 'employee_not_found', detail = '找不到此員工';
  end if;
  if not employee_is_current(v_emp.active, v_emp.left_on) then
    raise exception using errcode = 'P0001', message = 'employee_inactive', detail = '只能替在職員工建立帳號';
  end if;
  if staff_email_for_code(v_emp.code) is null then
    raise exception using errcode = 'P0001', message = 'employee_code_missing', detail = '員工沒有員工編號，無法建立帳號';
  end if;
  -- 與前端 staffEmailFor 相同的字元限制（只允許 ASCII 英數與 . _ -），見 0032。
  if btrim(v_emp.code) !~ '^[A-Za-z0-9._-]+$' then
    raise exception using errcode = 'P0001', message = 'employee_code_invalid',
      detail = '員工編號含不可用於 email 的字元（只能是英數與 . _ -）';
  end if;
  if v_emp.admin_profile_id is not null then
    raise exception using errcode = 'P0001', message = 'employee_has_account', detail = '此員工已有帳號';
  end if;

  select lower(u.email), coalesce(u.banned_until > now(), false)
    into v_email, v_disabled
    from auth.users u where u.id = p_user_id;
  if v_email is null or v_email <> staff_email_for_code(v_emp.code) then
    raise exception using errcode = 'P0001', message = 'account_email_mismatch',
      detail = '登入帳號與員工編號不符';
  end if;
  if exists (select 1 from admin_profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'account_exists', detail = '此登入帳號已是後台帳號';
  end if;
  -- 只能連結 server action 剛以 service_role 建立、從未登入過的 auth 使用者（0032 review 修正，見 0032 決策 8）。
  -- banned_until（建立後先停用）不影響此檢查。
  if not exists (
    select 1 from auth.users u
     where u.id = p_user_id
       and u.last_sign_in_at is null
       and u.created_at >= now() - interval '15 minutes'
  ) then
    raise exception using errcode = 'P0001', message = 'account_not_new',
      detail = '只能連結剛建立的登入帳號；既有的登入帳號請洽管理員處理';
  end if;

  insert into admin_profiles (id, email, role, must_change_password)
  values (p_user_id, v_email, 'staff', true);
  -- 先寫 account_create，連結的稽核觸發器（employees_account_link_audit）見到同交易的這筆就不再重複記錄。
  -- login_disabled：建立當下 Auth 是否已停用（#263 建立後先停用）。
  perform admin_audit_write('account_create', p_employee_id, p_user_id, null,
    jsonb_build_object('email', v_email, 'employee_name', v_emp.name, 'login_disabled', v_disabled));
  update employees set admin_profile_id = p_user_id where id = p_employee_id;
end;
$$;
revoke execute on function hr_link_staff_account(uuid, uuid) from public, anon, service_role;
grant execute on function hr_link_staff_account(uuid, uuid) to authenticated;

comment on function hr_link_staff_account(uuid, uuid) is
  'hr：替員工建立 admin_profiles（staff、必改密碼）並連結、寫 account_create 稽核（detail.login_disabled = 建立時已停用）（0032、0033）';
