-- 0034_staff_login_email.sql
-- 員工帳號登入 email 可由人事修改（issue #265，以 0032 的員工帳號與稽核為底）。
--   * #261／#263 建立的員工帳號登入 email 是 <員工編號小寫>@airexpert.com.tw；本檔讓人事（hr）把它改成員工的
--     個人 email（不限網域）。只限 role = 'staff' 的帳號（共用／管理帳號由管理員處理）。
--   * 流程（server action，見 app/admin/(protected)/employees/permissions/actions.ts）：
--       1. hr session：hr_check_staff_email_change(employee_id, new_email)（只檢查，不寫入）→ 帳號 id、Auth 目前 email
--       2. service_role：Auth admin updateUserById(id, { email, email_confirm: true })（不寄確認信）
--       3. hr session：hr_apply_staff_email_change(employee_id, new_email)：確認 Auth 已是新 email 後，
--          同一交易內更新 admin_profiles.email 並寫稽核 account_email_change
--       4. 步驟 3 失敗 → server action 把 Auth email 改回步驟 1 的值
--     一次性套用腳本（frontend/scripts/update-staff-emails.ts）以維運身分（postgres）呼叫同兩支 RPC。
--   * RPC（security definer、search_path = public, pg_temp；hr 或維運身分）：
--       hr_check_staff_email_change(employee_id, new_email)  → (user_id, auth_email, profile_email)
--       hr_apply_staff_email_change(employee_id, new_email)  → user_id
--   * 稽核 admin_access_audit 新增動作 account_email_change（check 約束；0032 的約束清單已同步加入，重跑 0032 不會因
--     既有的 account_email_change 紀錄失敗）。
--
-- 依賴 0002（admin_profiles）、0031（hr_assert_access、hr_caller_is_maintenance）、
--      0032（admin_access_audit、admin_audit_write、hr_staff_account_of）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（pooler 連線或 SQL Editor，身分須為 postgres）。
-- 上線順序：須先於前端程式上線（新版人員頁籤會呼叫本檔的 RPC；未套用時「修改登入 email」會在步驟 1 失敗，
--    Auth 不會被改動）。舊前端搭配本檔不受影響（只多出函式與允許的稽核動作）。
-- 重跑：本檔可重複執行（create or replace function；drop constraint if exists 後再建立）。
--    重跑 0032 會把 admin_access_audit_action_check 重建為 0032 版的清單（已含 account_email_change，結果相同）。
--
-- 實作決策：
--   1. 登入 email 以 admin_profiles.email（＝ Auth 的 email）為準，不新增 employees.email：
--      員工主檔的非敏感欄位對 erp／service_report／employees 模組可讀，個人 email 放那裡會擴大可見範圍；
--      兩份 email 也會有「哪一份是登入帳號」的同步問題。帳號與員工的對應一律用 employees.admin_profile_id。
--   2. hr_apply_staff_email_change 只把 admin_profiles.email「同步」成 Auth 已經是的值（auth.users.email 必須等於
--      新 email，否則 auth_email_mismatch）：hr 直接呼叫 RPC 也無法讓兩邊不一致，只能寫入 Auth 的實際狀態。
--      Auth 已是新 email、admin_profiles 仍是舊值（先前回滾也失敗）時，再操作一次即可補齊。
--   3. 新 email 的格式：去頭尾空白、轉小寫後的單一 ASCII email（前端 normalizeLoginEmail 與 staff_login_email_valid
--      一致）；RPC 只接受已正規化的值（大寫或含空白 → email_invalid）。不限制網域（個人信箱是預期的）。
--   4. 重複：新 email 不得是其他 auth 使用者或其他 admin_profiles 的 email（不分大小寫）。Auth 本身另有唯一索引，
--      併發時由 Auth 擋下。
--   5. 稽核 detail 的舊／新 email 只存遮罩形式（admin_mask_email：本地部分首字 + *** + @網域，例 t***@example.com），
--      並記 employee_name 與 target_user_id：稽核紀錄 append-only、連維運身分都不能刪，個人 email 是個資，
--      員工離職後也無法移除；遮罩後仍可辨認網域與變更時間，完整的目前 email 在人員頁籤看得到。
--      （0032 的 password_reset／login_enable／login_disable 與 account_link／account_unlink 仍記 admin_profiles.email
--      全文；本檔不改既有行為。）

-- ============================================================
-- 1) 稽核動作：account_email_change
-- ============================================================
alter table admin_access_audit drop constraint if exists admin_access_audit_action_check;
alter table admin_access_audit add constraint admin_access_audit_action_check
  check (action in (
    'account_create', 'password_reset', 'password_change', 'login_disable', 'login_enable',
    'position_create', 'position_update', 'position_delete',
    'position_permission_grant', 'position_permission_revoke',
    'employee_position_change',
    'account_link', 'account_unlink',
    'account_email_change'
  ));

-- ============================================================
-- 2) email 遮罩與格式（前端 lib/admin/staff-accounts.ts 的 maskEmail／normalizeLoginEmail 與此一致）
-- ============================================================
-- 遮罩：本地部分（最後一個 @ 之前）的首字 + *** + @網域；空值 → null；沒有本地部分或沒有 @ → ***。
create or replace function admin_mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_email, '')), '') is null then null
    when strpos(btrim(p_email), '@') < 2 then '***'
    else left(lower(btrim(p_email)), 1) || '***' || substring(lower(btrim(p_email)) from '@[^@]*$')
  end;
$$;

-- 已正規化（小寫、無空白）的單一 ASCII email：本地部分 [a-z0-9_%+-] 以 . 分段（不可開頭／結尾／連續 .），
-- 網域為以 . 分隔的標籤（英數與 -，不可以 - 開頭或結尾，每段 ≤ 63），最後一段為 2–63 個英文字母；
-- 全長 ≤ 254、本地部分 ≤ 64。
create or replace function staff_login_email_valid(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    char_length(p_email) <= 254
    and char_length(split_part(p_email, '@', 1)) <= 64
    and p_email ~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$',
    false
  );
$$;

-- ============================================================
-- 3) RPC
-- ============================================================
-- 內部：共用檢查。回傳員工的 staff 帳號 id。呼叫前已確認 hr 或維運身分。
create or replace function staff_email_change_assert(p_employee_id uuid, p_new_email text)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  -- employee_no_account／not_staff_account（只限 role = 'staff'；共用／管理帳號一律拒絕）
  v_user := hr_staff_account_of(p_employee_id);
  if p_new_email is null or not staff_login_email_valid(p_new_email) then
    raise exception using errcode = 'P0001', message = 'email_invalid',
      detail = 'email 格式不正確（需為單一、已去空白並轉小寫的 email）';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = p_new_email and u.id <> v_user)
     or exists (select 1 from admin_profiles p where lower(p.email) = p_new_email and p.id <> v_user) then
    raise exception using errcode = 'P0001', message = 'email_taken',
      detail = '此 email 已是其他帳號的登入 email';
  end if;
  return v_user;
end;
$$;
revoke execute on function staff_email_change_assert(uuid, text) from public, anon, authenticated, service_role;

-- hr（或維運身分）：修改前的檢查，不寫入。回傳帳號 id 與目前的 Auth email（失敗時 server action 改回此值）。
create or replace function hr_check_staff_email_change(p_employee_id uuid, p_new_email text)
returns table (user_id uuid, auth_email text, profile_email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid;
  v_auth    text;
  v_profile text;
begin
  perform hr_assert_access(true);
  v_user := staff_email_change_assert(p_employee_id, p_new_email);
  select lower(u.email) into v_auth from auth.users u where u.id = v_user;
  select lower(p.email) into v_profile from admin_profiles p where p.id = v_user;
  if v_auth is not distinct from p_new_email and v_profile is not distinct from p_new_email then
    raise exception using errcode = 'P0001', message = 'email_unchanged',
      detail = '新 email 與目前的登入 email 相同';
  end if;
  return query select v_user, v_auth, v_profile;
end;
$$;
revoke execute on function hr_check_staff_email_change(uuid, text) from public, anon, service_role;
grant execute on function hr_check_staff_email_change(uuid, text) to authenticated;

-- hr（或維運身分）：Auth 已改為新 email 後，同步 admin_profiles.email 並寫稽核。回傳帳號 id。
create or replace function hr_apply_staff_email_change(p_employee_id uuid, p_new_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_old  text;
  v_auth text;
begin
  perform hr_assert_access(true);
  v_user := staff_email_change_assert(p_employee_id, p_new_email);
  select p.email into v_old from admin_profiles p where p.id = v_user for update;
  -- 決策 2：只同步 Auth 的實際狀態。
  select lower(u.email) into v_auth from auth.users u where u.id = v_user;
  if v_auth is distinct from p_new_email then
    raise exception using errcode = 'P0001', message = 'auth_email_mismatch',
      detail = '登入帳號（Auth）的 email 尚未改為新 email';
  end if;
  if lower(v_old) is not distinct from p_new_email then
    return v_user; -- 已同步（重試），不重複記錄
  end if;
  update admin_profiles set email = p_new_email where id = v_user;
  perform admin_audit_write('account_email_change', p_employee_id, v_user, null,
    jsonb_build_object(
      'employee_name', (select e.name from employees e where e.id = p_employee_id),
      'from_email', admin_mask_email(v_old),
      'to_email', admin_mask_email(p_new_email)));
  return v_user;
end;
$$;
revoke execute on function hr_apply_staff_email_change(uuid, text) from public, anon, service_role;
grant execute on function hr_apply_staff_email_change(uuid, text) to authenticated;

comment on function hr_check_staff_email_change(uuid, text) is
  'hr／維運：修改員工帳號登入 email 前的檢查（只限 staff、格式、不重複），回傳帳號 id 與目前 email（0034）';
comment on function hr_apply_staff_email_change(uuid, text) is
  'hr／維運：Auth 已改為新 email 後同步 admin_profiles.email，寫 account_email_change 稽核（遮罩 email）（0034）';
