-- 0032_staff_rbac.sql
-- 員工帳號、首次登入必改密碼、職位權限（issue #261，以 0020 的 has_module、0031 的 employees／hr 為底）。
--   * positions（職位）、position_permissions（職位可用的模組：erp／service_report／maintenance／employees，
--     check 約束不含 hr）、employees.position_id（可空）。初始職位：業務、內勤、服務、負責人、會計（不給任何權限，
--     由人事主管設定；第一次建立時依 employees.title 完全相同者預先指派職位，因沒有權限所以不改變任何人的可見範圍）。
--   * admin_profiles.must_change_password（預設 false；只有 role = 'staff' 能為 true）。
--   * has_module(p) = 直接授權（admin_module_grants）∪ 所連結「在職」員工的「啟用」職位權限（只算 role = 'staff'
--     的帳號；hr 永遠只來自直接授權）；must_change_password = true 時一律 false（尚未改掉預設密碼前沒有任何模組）；
--     已停用登入（auth.users.banned_until > now()）時一律 false（停用立即生效，不必等 access token 到期）。
--   * current_admin_modules()：登入者的有效模組（前端 getCurrentModules() 用，與 has_module 同一份邏輯）。
--   * 保養卡（mx_*）RLS：is_office() → mx_has_access()（角色 office 或 has_module('maintenance')）。
--   * employees：模組 employees 的 policy（非敏感欄位，與 erp／service_report 相同）；職位只限 hr 指派；
--     已連結帳號的員工由離職改回在職只限 hr。
--   * 稽核 admin_access_audit（append-only）：帳號建立、重設密碼、本人改密碼、停用／恢復登入、職位增改刪、
--     職位權限增刪、員工職位變更、員工與帳號的連結／解除連結。後四者以觸發器寫入（任何寫入路徑都會留紀錄）。
--   * RPC（security definer、search_path = public, pg_temp）：
--       hr_link_staff_account(employee_id, user_id)     hr：建立 admin_profiles（staff、必改密碼）+ 連結員工 + 稽核
--       hr_flag_staff_password_reset(employee_id)       hr：設 must_change_password = true + 稽核，回傳帳號 id
--       hr_log_staff_login(employee_id, disabled)       hr：停用／恢復登入的稽核，回傳帳號 id
--       staff_complete_password_change(user_id)         僅 service_role：清除 must_change_password + 稽核
--
-- 依賴 0002（admin_profiles）、0011／0015（mx_*、is_office）、0020（admin_module_grants、has_module）、
--      0027（employees）、0031（employees.admin_profile_id、hr_caller_is_maintenance、hr_caller_role、hr_assert_access）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（pooler 連線或 SQL Editor，身分須為 postgres）。
-- ⚠️ 須先於前端程式上線：新版程式會呼叫 current_admin_modules()、讀 admin_profiles.must_change_password。
--    舊程式搭配本檔：has_module 對既有帳號結果不變（沒有職位、must_change_password 皆為 false）；
--    保養卡 RLS 對 office 結果不變。
-- 對既有帳號（admin@、erp@、office@、ceo@、administrator@）的影響：沒有。它們的 role 不是 staff，
--    must_change_password 為 false，也不會從職位取得權限；直接授權照舊。
-- 重跑：本檔可重複執行（add column if not exists、create table / index if not exists、create or replace function、
--    drop policy / trigger / constraint if exists 後再建立；初始職位只在 positions 為空時建立）。
--    ⚠️ 重跑 0020 會把 has_module 蓋回舊版（只看直接授權、不看 must_change_password），之後必須再重跑本檔；
--    local-db.sh 已把本檔放在重跑順序最後。
--
-- 實作決策：
--   1. 「在職」= active 且（left_on 為空或 > 今天，Asia/Taipei），與 lib/employees/status.ts 及 0031 決策 1 一致
--      （預定離職日到期後即使 active 尚未被觸發器改為 false，也立即失去職位權限）。
--   2. 職位權限只給 role = 'staff' 的帳號：即使維運身分把共用帳號（office@ 等）連結到員工，也不會因職位多出權限
--      （共用帳號的權限只看角色與直接授權，維持 #261 前的行為）。
--   3. must_change_password 由誰寫：authenticated／anon 對 admin_profiles 沒有任何寫入權（撤銷 insert／update／delete，
--      本來也沒有 policy）；只有 service_role（server action：本人改密碼成功後經 staff_complete_password_change 清除）
--      與 hr 的 security definer RPC（建立帳號、重設密碼時設為 true）能寫。使用者無法自行清除。
--      check 約束 admin_profiles_must_change_staff_check：只有 staff 能為 true（避免共用帳號被鎖在改密碼頁）。
--   4. employees.admin_profile_id 的寫入：0031 的 employees_admin_profile_guard 只允許 hr 或維運身分；
--      service_role 不被視為允許（auth.uid() 為空、role 為 service_role）。故建立帳號時由 server action 以
--      service_role 建 auth 使用者，再以 hr 本人的 session 呼叫 hr_link_staff_account（security definer，
--      auth.uid() 仍為 hr，觸發器放行），在同一交易內建立 admin_profiles 並連結、寫稽核；任一步失敗由 server action
--      刪除 auth 使用者回滾。
--   5. 職位指派（employees.position_id）只限 hr 或維運身分（觸發器 employees_staff_access_guard）：erp／service_report／
--      employees 模組依 RLS 可寫整列，若不擋即可替自己連結的帳號換職位而提權。已連結帳號的員工由離職（含已到期的
--      離職日）改回在職，會恢復該帳號的職位權限，同樣只限 hr；其他離職／停用、改資料照常。
--      已連結帳號的員工，API 使用者也只有 hr 能解除連結（admin_profile_id → null）或刪除（觸發器
--      employees_linked_delete_guard）：否則有 employees／erp 模組的人即可讓他人的帳號失去權限且無法重新連結。
--   6. 稽核紀錄 append-only（觸發器擋 update／delete／truncate，含 postgres；維運清理方式同 0031 §4）。
--      重設密碼／停用登入的紀錄是在呼叫 Auth API「之前」寫入（先把帳號鎖在改密碼頁，再改密碼，失敗時方向安全），
--      故紀錄代表「人事送出的操作」；Auth API 失敗時頁面會顯示錯誤，重試會再留一筆。
--   7. has_module 維持 security definer + stable；RLS 一律以 (select has_module(...)) 呼叫（每個查詢只評估一次）。
--      查詢走主鍵／唯一索引：admin_profiles(id)、auth.users(id)、admin_module_grants(user_id, module)、
--      employees_admin_profile_key（0031 的部分唯一索引）、positions(id)、position_permissions(position_id, module)。
--   8. hr_link_staff_account 只連結「15 分鐘內建立、從未登入」的 auth 使用者，且員工編號只能是 ASCII 英數與 . _ -：
--      hr 能改員工編號，若可連結既有 auth 使用者，就能把密碼由他人掌握的既有帳號收編為員工帳號。
--   9. 停用登入（Auth ban_duration）時 has_module 立即為 false（見 §3），不必等已核發的 access token 到期。

-- ============================================================
-- 1) admin_profiles.must_change_password
-- ============================================================
alter table admin_profiles add column if not exists must_change_password boolean not null default false;

alter table admin_profiles drop constraint if exists admin_profiles_must_change_staff_check;
alter table admin_profiles add constraint admin_profiles_must_change_staff_check
  check (not must_change_password or role = 'staff');

-- 決策 3：API 角色不可直接寫 admin_profiles（原本即無 policy；再撤銷表權限作為縱深防禦）。
revoke insert, update, delete, truncate, references, trigger on table admin_profiles from public, anon, authenticated;

comment on column admin_profiles.must_change_password is
  '首次登入／重設後必須先改密碼（只限 staff）；為 true 時 has_module() 一律 false（0032）';

-- ============================================================
-- 2) 職位與職位權限
-- ============================================================
create table if not exists positions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table positions drop constraint if exists positions_name_check;
alter table positions add constraint positions_name_check
  check (btrim(name) <> '' and char_length(name) <= 30);
alter table positions drop constraint if exists positions_description_check;
alter table positions add constraint positions_description_check
  check (char_length(coalesce(description, '')) <= 200);

create unique index if not exists positions_name_key on positions (lower(btrim(name)));

drop trigger if exists positions_updated_at on positions;
create trigger positions_updated_at before update on positions
  for each row execute function set_updated_at();

create table if not exists position_permissions (
  position_id uuid not null references positions(id) on delete cascade,
  module      text not null,
  created_at  timestamptz not null default now(),
  primary key (position_id, module)
);

-- 可經職位授予的模組：不含 hr（hr 只能由 admin 在人員管理頁直接授予）。
alter table position_permissions drop constraint if exists position_permissions_module_check;
alter table position_permissions add constraint position_permissions_module_check
  check (module in ('erp', 'service_report', 'maintenance', 'employees'));

alter table employees add column if not exists position_id uuid references positions(id) on delete restrict;
create index if not exists employees_position_idx on employees (position_id) where position_id is not null;

comment on table positions is '職位（人事主管維護；權限見 position_permissions）（0032）';
comment on table position_permissions is '職位可用的模組（erp／service_report／maintenance／employees，不含 hr）（0032）';
comment on column employees.position_id is '職位（positions）；只限 hr 指派。title 保留為舊系統職務原文（0032）';
comment on column employees.admin_profile_id is '連結的後台登入帳號（admin_profiles），唯一；員工帳號由權限管理頁建立（0031、0032）';

-- ============================================================
-- 3) 在職判斷與 has_module（直接授權 ∪ 職位權限）
-- ============================================================
create or replace function employee_is_current(p_active boolean, p_left_on date)
returns boolean
language sql
stable
as $$
  select coalesce(p_active, false)
     and (p_left_on is null or p_left_on > (now() at time zone 'Asia/Taipei')::date);
$$;

-- 0020 版（逐行對照）：
--   select exists (select 1 from admin_module_grants g where g.user_id = auth.uid() and g.module = p_module);
-- 本版：外層多 must_change_password 與「已停用登入」檢查；直接授權條件不變；再 OR 職位權限（hr 除外）；
-- 整體 coalesce 為 false（p_module 為 null 時與 0020 一樣回 false，不回 null）。
-- 停用登入（review 修正）：人事以 Auth ban_duration 停用後，已核發的 access token 在到期前（預設 1 小時）
--   仍可直接呼叫 PostgREST；故 banned_until > now() 時一律 false，停用立即對 RLS 與 RPC 生效
--   （auth.users 以主鍵查詢；函式擁有者 postgres 可讀 auth schema，0020 的 seed 與本檔 hr_link_staff_account 亦同）。
-- search_path 由 public 改為 public, pg_temp（security definer 的建議設定；函式內只參照 public 與 auth 的表，皆有限定）。
create or replace function has_module(p_module text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    not exists (
      select 1 from admin_profiles ap
       where ap.id = auth.uid() and ap.must_change_password
    )
    and not exists (
      select 1 from auth.users u
       where u.id = auth.uid() and u.banned_until is not null and u.banned_until > now()
    )
    and (
      exists (
        select 1 from admin_module_grants g
         where g.user_id = auth.uid() and g.module = p_module
      )
      or (
        p_module <> 'hr'
        and exists (
          select 1
            from employees e
            join admin_profiles ap on ap.id = e.admin_profile_id and ap.role = 'staff'
            join positions pos on pos.id = e.position_id and pos.active
            join position_permissions pp on pp.position_id = pos.id and pp.module = p_module
           where e.admin_profile_id = auth.uid()
             and employee_is_current(e.active, e.left_on)
        )
      )
    ),
    false
  );
$$;
revoke execute on function has_module(text) from public, anon;
grant execute on function has_module(text) to authenticated;

-- 登入者的有效模組（前端 getCurrentModules()）。逐一呼叫 has_module，確保與 RLS 完全同一份邏輯。
create or replace function current_admin_modules()
returns text[]
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(m order by m), '{}'::text[])
    from unnest(array['employees', 'erp', 'hr', 'maintenance', 'service_report']) as m
   where has_module(m);
$$;
revoke execute on function current_admin_modules() from public, anon;
grant execute on function current_admin_modules() to authenticated;

-- ============================================================
-- 4) 稽核紀錄（append-only）
-- ============================================================
create table if not exists admin_access_audit (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  actor_id       uuid,          -- auth.uid()；維運身分為 null；本人改密碼為本人
  actor_email    text,          -- 寫入當下的後台帳號 email
  actor_role     text not null, -- 資料庫角色（authenticated／service_role／postgres）
  action         text not null,
  employee_id    uuid,          -- 不設外鍵：員工或職位刪除後紀錄仍保留
  target_user_id uuid,
  position_id    uuid,
  detail         jsonb not null default '{}'::jsonb
);
alter table admin_access_audit drop constraint if exists admin_access_audit_action_check;
alter table admin_access_audit add constraint admin_access_audit_action_check
  check (action in (
    'account_create', 'password_reset', 'password_change', 'login_disable', 'login_enable',
    'position_create', 'position_update', 'position_delete',
    'position_permission_grant', 'position_permission_revoke',
    'employee_position_change',
    'account_link', 'account_unlink'
  ));
create index if not exists admin_access_audit_at_idx on admin_access_audit (at desc);
create index if not exists admin_access_audit_employee_idx on admin_access_audit (employee_id, at desc)
  where employee_id is not null;

alter table admin_access_audit enable row level security;
revoke all on table admin_access_audit from public, anon, authenticated, service_role;
grant select on table admin_access_audit to authenticated, service_role;

drop policy if exists "hr select admin access audit" on admin_access_audit;
create policy "hr select admin access audit" on admin_access_audit
  for select to authenticated using ((select has_module('hr')));

create or replace function admin_access_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'append_only',
    detail = '稽核紀錄不可修改或刪除';
end;
$$;
revoke execute on function admin_access_audit_immutable() from public, anon, authenticated, service_role;

drop trigger if exists admin_access_audit_no_change on admin_access_audit;
create trigger admin_access_audit_no_change
  before update or delete on admin_access_audit
  for each row execute function admin_access_audit_immutable();
drop trigger if exists admin_access_audit_no_truncate on admin_access_audit;
create trigger admin_access_audit_no_truncate
  before truncate on admin_access_audit
  for each statement execute function admin_access_audit_immutable();

-- 內部：寫一筆稽核（只供本檔的 security definer 函式／觸發器以擁有者身分呼叫）。
create or replace function admin_audit_write(
  p_action         text,
  p_employee_id    uuid default null,
  p_target_user_id uuid default null,
  p_position_id    uuid default null,
  p_detail         jsonb default '{}'::jsonb,
  p_actor_id       uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := coalesce(p_actor_id, auth.uid());
begin
  insert into admin_access_audit
    (actor_id, actor_email, actor_role, action, employee_id, target_user_id, position_id, detail)
  values (
    v_actor,
    (select p.email from admin_profiles p where p.id = v_actor),
    hr_caller_role(),
    p_action, p_employee_id, p_target_user_id, p_position_id, coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;
revoke execute on function admin_audit_write(text, uuid, uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;

comment on table admin_access_audit is
  '後台帳號與權限稽核：帳號建立、重設／變更密碼、停用登入、職位與職位權限、員工職位；hr 可讀、不可改刪（0032）';

-- ============================================================
-- 5) 職位／職位權限／員工職位的稽核觸發器
-- ============================================================
create or replace function positions_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform admin_audit_write('position_create', null, null, new.id,
      jsonb_build_object('name', new.name, 'active', new.active));
  elsif tg_op = 'UPDATE' then
    if new.name is distinct from old.name or new.active is distinct from old.active
       or new.description is distinct from old.description then
      perform admin_audit_write('position_update', null, null, new.id,
        jsonb_build_object('old', jsonb_build_object('name', old.name, 'active', old.active, 'description', old.description),
                           'new', jsonb_build_object('name', new.name, 'active', new.active, 'description', new.description)));
    end if;
  else
    perform admin_audit_write('position_delete', null, null, old.id, jsonb_build_object('name', old.name));
  end if;
  return null;
end;
$$;
revoke execute on function positions_audit() from public, anon, authenticated, service_role;

drop trigger if exists positions_audit on positions;
create trigger positions_audit after insert or update or delete on positions
  for each row execute function positions_audit();

create or replace function position_permissions_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row position_permissions := case when tg_op = 'DELETE' then old else new end;
begin
  perform admin_audit_write(
    case when tg_op = 'DELETE' then 'position_permission_revoke' else 'position_permission_grant' end,
    null, null, v_row.position_id,
    jsonb_build_object('module', v_row.module,
                       'position_name', (select p.name from positions p where p.id = v_row.position_id)));
  return null;
end;
$$;
revoke execute on function position_permissions_audit() from public, anon, authenticated, service_role;

drop trigger if exists position_permissions_audit on position_permissions;
create trigger position_permissions_audit after insert or delete on position_permissions
  for each row execute function position_permissions_audit();

create or replace function employees_position_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT' and new.position_id is not null)
     or (tg_op = 'UPDATE' and new.position_id is distinct from old.position_id) then
    perform admin_audit_write('employee_position_change', new.id, new.admin_profile_id, new.position_id,
      jsonb_build_object(
        'employee_name', new.name,
        'from', case when tg_op = 'UPDATE' then old.position_id end,
        'from_name', case when tg_op = 'UPDATE' then (select p.name from positions p where p.id = old.position_id) end,
        'to', new.position_id,
        'to_name', (select p.name from positions p where p.id = new.position_id)));
  end if;
  return null;
end;
$$;
revoke execute on function employees_position_audit() from public, anon, authenticated, service_role;

drop trigger if exists employees_position_audit on employees;
create trigger employees_position_audit after insert or update of position_id on employees
  for each row execute function employees_position_audit();

-- 員工與後台帳號的連結變更（review 修正）：連結決定員工帳號的職位權限，hr 或維運身分直接改
-- employees.admin_profile_id（不經 hr_link_staff_account）也必須留紀錄；admin_profiles 刪除時的
-- on delete set null 亦記為 account_unlink。hr_link_staff_account 已寫 account_create（同一交易、先寫），不重複記錄。
create or replace function employees_account_link_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old uuid := case when tg_op = 'UPDATE' then old.admin_profile_id end;
begin
  if new.admin_profile_id is not distinct from v_old then
    return null;
  end if;
  if new.admin_profile_id is not null and exists (
       select 1 from admin_access_audit a
        where a.action = 'account_create' and a.employee_id = new.id
          and a.target_user_id = new.admin_profile_id and a.at = now()
     ) then
    return null;
  end if;
  perform admin_audit_write(
    case when new.admin_profile_id is null then 'account_unlink' else 'account_link' end,
    new.id, coalesce(new.admin_profile_id, v_old), null,
    jsonb_build_object(
      'employee_name', new.name,
      'from', v_old,
      'from_email', (select p.email from admin_profiles p where p.id = v_old),
      'to', new.admin_profile_id,
      'to_email', (select p.email from admin_profiles p where p.id = new.admin_profile_id)));
  return null;
end;
$$;
revoke execute on function employees_account_link_audit() from public, anon, authenticated, service_role;

drop trigger if exists employees_account_link_audit on employees;
create trigger employees_account_link_audit after insert or update of admin_profile_id on employees
  for each row execute function employees_account_link_audit();

-- ============================================================
-- 6) employees 寫入防護（決策 5）
-- ============================================================
-- 觸發器名稱排序在 employees_left_on_active 之後（before 觸發器依名稱順序執行），
-- 故判斷「改回在職」時 new.active 已套用離職日規則。
create or replace function employees_guard_staff_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(has_module('hr'), false) or hr_caller_is_maintenance() then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.position_id is not null)
     or (tg_op = 'UPDATE' and new.position_id is distinct from old.position_id) then
    raise exception using errcode = 'P0001', message = 'position_assign_forbidden',
      detail = '只有人事（hr）權限可以指派員工職位';
  end if;
  if tg_op = 'UPDATE' and new.admin_profile_id is not null
     and not employee_is_current(old.active, old.left_on)
     and employee_is_current(new.active, new.left_on) then
    raise exception using errcode = 'P0001', message = 'employee_reactivate_forbidden',
      detail = '此員工已連結後台帳號，改回在職會恢復帳號權限，只有人事（hr）權限可以操作';
  end if;
  -- 解除連結（review 修正）：0031 的 employees_admin_profile_guard 不限制清除（當時 admin_profile_id 只是保留欄位）；
  -- 本檔起連結決定員工帳號的職位權限，而且解除後 hr_link_staff_account 會因帳號已存在（account_exists）無法重新連結，
  -- 故 API 使用者（authenticated／anon）只有 hr 能清除。admin_profiles 刪除時的 on delete set null 由 service_role
  -- （人員管理頁移除帳號）或 Auth（supabase_auth_admin，刪除 auth 使用者的 cascade）觸發，不受此限。
  if tg_op = 'UPDATE' and old.admin_profile_id is not null
     and new.admin_profile_id is distinct from old.admin_profile_id
     and hr_caller_role() in ('authenticated', 'anon') then
    raise exception using errcode = 'P0001', message = 'admin_unlink_forbidden',
      detail = '此員工已連結後台帳號，只有人事（hr）權限可以解除連結';
  end if;
  return new;
end;
$$;
revoke execute on function employees_guard_staff_access() from public, anon, authenticated, service_role;

drop trigger if exists employees_staff_access_guard on employees;
create trigger employees_staff_access_guard before insert or update on employees
  for each row execute function employees_guard_staff_access();

-- 刪除已連結帳號的員工（review 修正）：效果同解除連結（帳號失去職位權限且無法重新連結），
-- 故 API 使用者只有 hr 能刪除；erp／service_report／employees 模組請改為停用（離職）。
create or replace function employees_guard_linked_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.admin_profile_id is not null
     and hr_caller_role() in ('authenticated', 'anon')
     and not coalesce(has_module('hr'), false) then
    raise exception using errcode = 'P0001', message = 'employee_linked_delete_forbidden',
      detail = '此員工已連結後台帳號，只有人事（hr）權限可以刪除；請改為停用';
  end if;
  return old;
end;
$$;
revoke execute on function employees_guard_linked_delete() from public, anon, authenticated, service_role;

drop trigger if exists employees_linked_delete_guard on employees;
create trigger employees_linked_delete_guard before delete on employees
  for each row execute function employees_guard_linked_delete();

-- ============================================================
-- 7) RLS：positions／position_permissions（只有 hr 可讀寫；登入者的有效權限走 current_admin_modules()）
-- ============================================================
alter table positions enable row level security;
alter table position_permissions enable row level security;

revoke all on table positions from anon;
revoke all on table position_permissions from anon;
revoke truncate, references, trigger on table positions from public, authenticated;
revoke truncate, references, trigger, update on table position_permissions from public, authenticated;

drop policy if exists "hr select positions" on positions;
create policy "hr select positions" on positions
  for select to authenticated using ((select has_module('hr')));
drop policy if exists "hr insert positions" on positions;
create policy "hr insert positions" on positions
  for insert to authenticated with check ((select has_module('hr')));
drop policy if exists "hr update positions" on positions;
create policy "hr update positions" on positions
  for update to authenticated
  using ((select has_module('hr'))) with check ((select has_module('hr')));
drop policy if exists "hr delete positions" on positions;
create policy "hr delete positions" on positions
  for delete to authenticated using ((select has_module('hr')));

drop policy if exists "hr select position permissions" on position_permissions;
create policy "hr select position permissions" on position_permissions
  for select to authenticated using ((select has_module('hr')));
drop policy if exists "hr insert position permissions" on position_permissions;
create policy "hr insert position permissions" on position_permissions
  for insert to authenticated with check ((select has_module('hr')));
drop policy if exists "hr delete position permissions" on position_permissions;
create policy "hr delete position permissions" on position_permissions
  for delete to authenticated using ((select has_module('hr')));

-- ============================================================
-- 8) employees：模組 employees（員工清單，非敏感欄位；權限與 erp／service_report 相同）
--    以另外的具名 policy 加在 0027／0031 的 policy 旁（permissive policy 以 OR 合併），重跑 0027／0031 不會移除。
-- ============================================================
drop policy if exists "employees module select employees" on employees;
create policy "employees module select employees" on employees
  for select to authenticated using ((select has_module('employees')));
drop policy if exists "employees module insert employees" on employees;
create policy "employees module insert employees" on employees
  for insert to authenticated with check ((select has_module('employees')));
drop policy if exists "employees module update employees" on employees;
create policy "employees module update employees" on employees
  for update to authenticated
  using ((select has_module('employees'))) with check ((select has_module('employees')));
drop policy if exists "employees module delete employees" on employees;
create policy "employees module delete employees" on employees
  for delete to authenticated using ((select has_module('employees')));

-- ============================================================
-- 9) 保養卡（mx_*）：角色 office 或 maintenance 模組
-- ============================================================
-- is_office() 維持「角色 = office」的語意不變（其他測試與判斷仍使用）；保養卡改用 mx_has_access()。
create or replace function mx_has_access()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select is_office() or has_module('maintenance');
$$;
revoke execute on function mx_has_access() from public, anon;
grant execute on function mx_has_access() to authenticated;

-- 0011（mx_customers／mx_machines／mx_records／mx_import_drafts）與 0015（mx_machine_columns）的
-- "office all <表>"（using / with check is_office()）→ "maintenance all <表>"（mx_has_access()）。
-- 0020／0021／0022 另加的 erp／service_report policy 不動。
do $$
declare t text;
begin
  foreach t in array array[
    'mx_customers', 'mx_machines', 'mx_records', 'mx_import_drafts', 'mx_machine_columns'
  ]
  loop
    execute format('drop policy if exists "office all %1$s" on %1$I;', t);
    execute format('drop policy if exists "maintenance all %1$s" on %1$I;', t);
    execute format(
      'create policy "maintenance all %1$s" on %1$I for all to authenticated'
      || ' using ((select mx_has_access())) with check ((select mx_has_access()));',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 10) 帳號 RPC
-- ============================================================
-- 員工帳號 email：lower(btrim(code)) || '@airexpert.com.tw'（前端 lib/admin/staff-accounts.ts 的 staffEmailFor 與此一致）。
create or replace function staff_email_for_code(p_code text)
returns text
language sql
immutable
as $$
  select case when nullif(btrim(coalesce(p_code, '')), '') is null then null
              else lower(btrim(p_code)) || '@airexpert.com.tw' end;
$$;

-- hr：替員工建立 admin_profiles（staff、必改密碼）並連結。auth 使用者由 server action 以 service_role 先建立。
create or replace function hr_link_staff_account(p_employee_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp   employees;
  v_email text;
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
  -- 與前端 staffEmailFor 相同的字元限制（只允許 ASCII 英數與 . _ -）：DB 端也擋，避免直接呼叫 RPC 時
  -- 以全形、Unicode 大小寫折疊（例：KELVIN SIGN 經 lower() 變成 k）或空白組出與既有帳號相同的 email。
  if btrim(v_emp.code) !~ '^[A-Za-z0-9._-]+$' then
    raise exception using errcode = 'P0001', message = 'employee_code_invalid',
      detail = '員工編號含不可用於 email 的字元（只能是英數與 . _ -）';
  end if;
  if v_emp.admin_profile_id is not null then
    raise exception using errcode = 'P0001', message = 'employee_has_account', detail = '此員工已有帳號';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null or v_email <> staff_email_for_code(v_emp.code) then
    raise exception using errcode = 'P0001', message = 'account_email_mismatch',
      detail = '登入帳號與員工編號不符';
  end if;
  if exists (select 1 from admin_profiles p where p.id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'account_exists', detail = '此登入帳號已是後台帳號';
  end if;
  -- 只能連結 server action 剛以 service_role 建立、從未登入過的 auth 使用者（review 修正）：
  -- hr 可修改員工編號，若不限制，直接呼叫本 RPC 即可把任何「既有、但沒有後台帳號」的 auth 使用者
  -- （例：已移除後台權限但 auth 使用者殘留、或自行註冊的 <編號>@airexpert.com.tw）收編成員工帳號，
  -- 而該帳號的密碼並非預設密碼、由他人掌握。
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
  perform admin_audit_write('account_create', p_employee_id, p_user_id, null,
    jsonb_build_object('email', v_email, 'employee_name', v_emp.name));
  update employees set admin_profile_id = p_user_id where id = p_employee_id;
end;
$$;
revoke execute on function hr_link_staff_account(uuid, uuid) from public, anon, service_role;
grant execute on function hr_link_staff_account(uuid, uuid) to authenticated;

-- 內部：取得員工連結的 staff 帳號 id（hr RPC 共用；非 staff 帳號一律拒絕，避免動到共用／管理帳號）。
create or replace function hr_staff_account_of(p_employee_id uuid)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  select e.admin_profile_id into v_user from employees e where e.id = p_employee_id;
  if v_user is null then
    raise exception using errcode = 'P0001', message = 'employee_no_account', detail = '此員工尚未建立帳號';
  end if;
  if not exists (select 1 from admin_profiles p where p.id = v_user and p.role = 'staff') then
    raise exception using errcode = 'P0001', message = 'not_staff_account',
      detail = '此員工連結的不是員工帳號，請由管理員在人員管理頁處理';
  end if;
  return v_user;
end;
$$;
revoke execute on function hr_staff_account_of(uuid) from public, anon, authenticated, service_role;

-- hr：重設為預設密碼前，先把帳號鎖在改密碼頁（must_change_password = true）並寫稽核。回傳帳號 id。
create or replace function hr_flag_staff_password_reset(p_employee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  perform hr_assert_access();
  v_user := hr_staff_account_of(p_employee_id);
  update admin_profiles set must_change_password = true where id = v_user;
  perform admin_audit_write('password_reset', p_employee_id, v_user, null,
    jsonb_build_object('email', (select p.email from admin_profiles p where p.id = v_user)));
  return v_user;
end;
$$;
revoke execute on function hr_flag_staff_password_reset(uuid) from public, anon, service_role;
grant execute on function hr_flag_staff_password_reset(uuid) to authenticated;

-- hr：停用／恢復登入的稽核（實際停用由 server action 以 service_role 呼叫 Auth API）。回傳帳號 id。
create or replace function hr_log_staff_login(p_employee_id uuid, p_disabled boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  perform hr_assert_access();
  v_user := hr_staff_account_of(p_employee_id);
  perform admin_audit_write(case when p_disabled then 'login_disable' else 'login_enable' end,
    p_employee_id, v_user, null,
    jsonb_build_object('email', (select p.email from admin_profiles p where p.id = v_user)));
  return v_user;
end;
$$;
revoke execute on function hr_log_staff_login(uuid, boolean) from public, anon, service_role;
grant execute on function hr_log_staff_login(uuid, boolean) to authenticated;

-- 僅 service_role：本人改密碼成功後（server action 已用目前密碼重新驗證）清除 must_change_password 並寫稽核。
create or replace function staff_complete_password_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from admin_profiles p where p.id = p_user_id and p.role = 'staff') then
    raise exception using errcode = 'P0001', message = 'not_staff_account', detail = '不是員工帳號';
  end if;
  update admin_profiles set must_change_password = false where id = p_user_id;
  perform admin_audit_write('password_change',
    (select e.id from employees e where e.admin_profile_id = p_user_id), p_user_id, null, '{}'::jsonb, p_user_id);
end;
$$;
revoke execute on function staff_complete_password_change(uuid) from public, anon, authenticated;
grant execute on function staff_complete_password_change(uuid) to service_role;

-- ============================================================
-- 11) 初始職位（只在 positions 為空時建立；改名或刪除後重跑不會再建回來）
--     不給任何權限；職務原文（title）與職位名稱完全相同的員工預先指派（以維運身分執行，觸發器放行並寫稽核）。
-- ============================================================
do $$
begin
  if not exists (select 1 from positions) then
    insert into positions (name, sort_order) values
      ('業務', 10), ('內勤', 20), ('服務', 30), ('負責人', 40), ('會計', 50);
    update employees e
       set position_id = p.id
      from positions p
     where e.position_id is null
       and btrim(coalesce(e.title, '')) = p.name;
  end if;
end $$;
