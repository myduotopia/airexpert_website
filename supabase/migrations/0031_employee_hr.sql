-- 0031_employee_hr.sql
-- 員工資料擴充、敏感個資加密與 hr 模組（issue #257，以 #223／0027 的 employees 為底）。
--   * employees 新增非敏感欄位：title（職務原文）、phone、emergency_contact（人工整理後的非敏感內容）、
--     hired_on／left_on（到職、離職日）、department（部門，保留）、admin_profile_id（保留：日後連結後台
--     登入帳號，唯一；本次 UI 不提供設定）。roles 放寬為 sales／technician／office／manager，允許空陣列
--     （職務對不到角色的員工不出現在任何選取器）。
--   * employee_private：身份證號、戶籍地址、聯絡人原文、婚姻、學歷、經歷，以 pgcrypto
--     extensions.pgp_sym_encrypt（AES-256）加密成 bytea。RLS 啟用、無任何 policy，且撤銷
--     anon／authenticated／service_role 全部權限——只能透過下列 security definer RPC 讀寫。
--   * employee_private_access_log：顯示明文、寫入、匯入的存取紀錄；hr 可讀，任何身分皆不可改刪（觸發器）。
--   * 模組 hr：admin_module_grants 模組檢查放寬為 ('erp','service_report','hr')；不 seed 任何授權。
--   * RPC（security definer、search_path = public, pg_temp，開頭檢查 has_module('hr')，否則 forbidden）：
--       hr_get_employee_private(employee_id)              → 遮罩值（不含明文）
--       hr_reveal_employee_private(employee_id, field)    → 單一欄位明文 + 寫存取紀錄
--       hr_upsert_employee_private(employee_id, fields)   → 加密寫入（語意見 §6）
--       hr_import_employee_private(rows)                  → 一次性／批次匯入（hr 或維運身分 postgres）
--
-- 金鑰：Supabase Vault 的 secret「employee_pii_key」（vault.decrypted_secrets）。
--   ⚠️ 本檔不建立金鑰。套用後由維運者在 SQL Editor（postgres 身分）手動建立，例如：
--        select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'employee_pii_key');
--      金鑰不存在、空字串或短於 32 字元時，所有讀寫 RPC 以 hr_key_missing 失敗（不會用空金鑰或預設金鑰）。
--   ⚠️ 金鑰遺失或被改掉 → 已加密的資料永久無法解密（RPC 回 hr_decrypt_failed）。請另行離線保存金鑰。
--
-- 依賴 0001（set_updated_at()）、0002（admin_profiles）、0020（admin_module_grants、has_module）、
--      0021（admin_module_grants_module_check）、0027（employees、employee_name_key）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（pooler 連線或 SQL Editor，身分須為 postgres）。
-- ⚠️ 須先於前端程式上線：新版程式會 select／寫入新欄位與呼叫 hr_* RPC；舊程式搭配本檔不受影響
--    （只多出可空欄位、放寬的約束、新表與新函式）。
-- ⚠️ 本檔之後不可再重跑 0021（會把模組檢查改回 ('erp','service_report')，已授權的 hr 列使約束建立失敗）
--    或 0027（會把 roles 檢查改回兩種角色且至少一個）。local-db.sh 因此把 0031 放在最後重跑。
-- 本檔可重複執行：add column if not exists、create table / index if not exists、create or replace function、
--   drop policy / trigger / constraint if exists 後再建立；只做加法，不刪資料。
--
-- 實作決策：
--   1. 離職 → 停用以「觸發器」實作（而非只在應用層）：任何寫入路徑（後台表單、匯入、SQL）都一致。
--      規則：left_on 非空且 ≤ 今天（Asia/Taipei）時，寫入當下強制 active = false；之後清除 left_on 不會自動
--      復職（由使用者勾選）。left_on 為未來日期（預定離職）時寫入當下仍在職；DB 沒有排程，到期後由前端
--      選取器／列表以「active 且（left_on 為空或 > 今天）」視為在職（lib/employees/status.ts），下次寫入時觸發器
--      才把 active 改為 false。
--   2. 角色允許空陣列：舊系統職務「其他」或未填者匯入時不給選取器角色（預覽中標示），仍是員工主檔的一員。
--   3. department（部門）為唯一新增的保留欄位：公司擴編後業務／服務／管理部門的列表篩選與報表彙總需要，
--      且無法由 title（職務原文、格式不一）可靠推得。其他（員工 email、分機…）待有需求再加。
--   4. admin_profile_id：on delete set null（刪除後台帳號不影響員工主檔），唯一（一個帳號至多對應一位員工）。
--      目前 erp／service_report 使用者依 0027 的 RLS 也能寫此欄，但沒有 UI、也沒有任何程式依此授權；
--      日後若用於授權判斷，需改為只有 admin／hr 可設定。
--   5. employee_private 的 FK 為 on delete cascade（依 #257 設計）：刪除員工（僅限未被任何單據引用者，
--      0027 的 restrict）會一併刪除其敏感資料。erp 使用者因此可間接刪除未被引用員工的敏感資料。
--   6. hr_upsert_employee_private 的 fields 為 jsonb 物件，以「鍵是否存在」表達語意：
--        鍵不存在 → 不變；值為 null 或去頭尾空白後為空字串 → 清除；其他字串 → 加密寫入。未知鍵 → validation。
--      hr_import_employee_private 只寫非空值（空白儲存格不清除既有資料），且解密比對後內容相同就不重寫、
--      不記紀錄 → 重跑不重複、不產生多餘紀錄。
--   7. 「維運身分」：security definer 內 current_user 恆為函式擁有者，無法判斷呼叫者；
--      PostgREST 以 set local role authenticated 切換身分，會反映在 GUC「role」且不受 security definer 影響。
--      故 hr_caller_is_maintenance() 以 coalesce(nullif(current_setting('role'),'none'), session_user)
--      ∈ (postgres, supabase_admin) 判斷——API 用戶端（authenticated／anon／service_role）無法偽造。
--      只有 hr_import_employee_private 接受維運身分（一次性匯入用）；其他 RPC 一律需要 hr 模組。
--   8. 遮罩規則（hr_mask_private，前端 lib/employees/private.ts 的 maskPrivateValue 與此一致）：
--        national_id       長度 ≥ 6：前 3 碼 + *（長度−5 個）+ 末 2 碼（Z999999999 → Z99*****99）；
--                          3–5 碼：首碼 + 其餘 *；≤ 2 碼：全部 *。
--        household_address 去掉開頭郵遞區號後，只留「縣市＋鄉鎮市區」再加「…」（臺北市大安區…）；
--                          對不到縣市格式 → 「已填寫」。
--        emergency_contact 原文可能夾帶證號或電話 → 只回「已填寫（N 字）」。
--        marital           值很短，任何前綴都等於明文 → 只回「已填寫」。
--        education／experience  前 k 字 + 「…」，k = min(4, floor(字數/2))（字數 1 → 「…」）。
--      空值回 null（前端顯示「未填寫」）。
--   9. 存取紀錄不設 employees 外鍵：員工刪除後紀錄仍保留（稽核用）；actor_email 於寫入當下由
--      admin_profiles 帶入，hr 檢視紀錄時不需讀取其他人的後台帳號資料。

-- ============================================================
-- 0) pgcrypto（Supabase 已預設安裝於 extensions schema）
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if to_regprocedure('extensions.pgp_sym_encrypt(text,text,text)') is null
     or to_regprocedure('extensions.pgp_sym_decrypt(bytea,text)') is null then
    raise exception 'pgcrypto 必須安裝在 extensions schema（找不到 extensions.pgp_sym_encrypt）';
  end if;
end $$;

-- ============================================================
-- 1) 模組授權：放寬模組檢查（同 0021 作法：刪除所有引用 module 欄位的 check 後重建具名約束）
-- ============================================================
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.admin_module_grants'::regclass
      and con.contype = 'c'
      and att.attname = 'module'
  loop
    execute format('alter table admin_module_grants drop constraint %I;', c.conname);
  end loop;
end $$;

alter table admin_module_grants add constraint admin_module_grants_module_check
  check (module in ('erp', 'service_report', 'hr'));

-- ============================================================
-- 2) employees：非敏感欄位擴充
-- ============================================================
alter table employees add column if not exists title             text;  -- 職務原文（舊系統「職務」）
alter table employees add column if not exists department        text;  -- 部門（保留，見決策 3）
alter table employees add column if not exists phone             text;  -- 聯絡電話
alter table employees add column if not exists emergency_contact text;  -- 緊急聯絡人（人工整理後的非敏感內容）
alter table employees add column if not exists hired_on          date;  -- 到職日
alter table employees add column if not exists left_on           date;  -- 離職日
alter table employees add column if not exists admin_profile_id  uuid
  references admin_profiles(id) on delete set null;                     -- 保留：連結後台登入帳號

alter table employees drop constraint if exists employees_roles_check;
alter table employees add constraint employees_roles_check
  check (roles <@ array['sales', 'technician', 'office', 'manager']::text[]);

alter table employees drop constraint if exists employees_text_len_check;
alter table employees add constraint employees_text_len_check
  check (char_length(coalesce(title, '')) <= 50
     and char_length(coalesce(department, '')) <= 50
     and char_length(coalesce(phone, '')) <= 50
     and char_length(coalesce(emergency_contact, '')) <= 200);

alter table employees drop constraint if exists employees_left_on_check;
alter table employees add constraint employees_left_on_check
  check (left_on is null or hired_on is null or left_on >= hired_on);

create unique index if not exists employees_admin_profile_key on employees (admin_profile_id)
  where admin_profile_id is not null;

-- 離職日 ≤ 今天（台灣時間）→ 寫入當下強制停用（決策 1）
create or replace function employees_apply_left_on()
returns trigger
language plpgsql
as $$
begin
  if new.left_on is not null and new.left_on <= (now() at time zone 'Asia/Taipei')::date then
    new.active := false;
  end if;
  return new;
end;
$$;
revoke execute on function employees_apply_left_on() from public, anon, authenticated, service_role;

drop trigger if exists employees_left_on_active on employees;
create trigger employees_left_on_active before insert or update on employees
  for each row execute function employees_apply_left_on();

comment on table employees is '員工主檔（業務／維修師傅／內勤／負責人），ERP 與機台維護報告單共用（0027、0031）';
comment on column employees.roles is '角色：sales＝業務、technician＝維修師傅、office＝內勤／會計、manager＝負責人；可複選、可空（0031）';
comment on column employees.title is '職務原文（舊系統「職務」，顯示與篩選用）（0031）';
comment on column employees.department is '部門（保留欄位，0031）';
comment on column employees.emergency_contact is '緊急聯絡人：hr 人工整理後的非敏感內容；原文加密存於 employee_private（0031）';
comment on column employees.left_on is '離職日；≤ 今天時寫入當下強制 active = false（觸發器 employees_left_on_active，0031）';
comment on column employees.admin_profile_id is '保留：連結的後台登入帳號（admin_profiles），唯一（0031）';

-- ============================================================
-- 3) employee_private：加密的敏感個資
-- ============================================================
create table if not exists employee_private (
  employee_id           uuid primary key references employees(id) on delete cascade,
  national_id_enc       bytea,   -- 身份證號
  household_address_enc bytea,   -- 戶籍地址
  emergency_contact_enc bytea,   -- 聯絡人原文（可能夾帶證號或電話）
  marital_enc           bytea,   -- 婚姻
  education_enc         bytea,   -- 學歷
  experience_enc        bytea,   -- 經歷
  updated_at            timestamptz not null default now(),
  updated_by            uuid
);

alter table employee_private enable row level security;
-- 無任何 policy；並撤銷 API 角色的全部表權限（只能透過 hr_* RPC，擁有者身分執行）。
revoke all on table employee_private from public, anon, authenticated, service_role;

comment on table employee_private is '員工敏感個資（pgp_sym_encrypt 加密，金鑰在 Vault employee_pii_key）；只能透過 hr_* RPC 讀寫（0031）';

-- ============================================================
-- 4) 存取紀錄（append-only）
-- ============================================================
create table if not exists employee_private_access_log (
  id          bigint generated always as identity primary key,
  user_id     uuid,                                -- auth.uid()；維運身分（postgres）為 null
  actor_email text,                                -- 寫入當下的後台帳號 email
  actor_role  text not null,                       -- 呼叫者資料庫角色（authenticated／postgres）
  employee_id uuid not null,                       -- 不設外鍵：員工刪除後紀錄仍保留
  field       text not null,
  action      text not null check (action in ('reveal', 'write', 'import')),
  at          timestamptz not null default now()
);
create index if not exists employee_private_access_log_employee_idx
  on employee_private_access_log (employee_id, at desc);

alter table employee_private_access_log enable row level security;
revoke all on table employee_private_access_log from public, anon, authenticated, service_role;
grant select on table employee_private_access_log to authenticated;

drop policy if exists "hr select access log" on employee_private_access_log;
create policy "hr select access log" on employee_private_access_log
  for select to authenticated using ((select has_module('hr')));

create or replace function employee_private_access_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = 'P0001', message = 'append_only',
    detail = '存取紀錄不可修改或刪除';
end;
$$;
revoke execute on function employee_private_access_log_immutable() from public, anon, authenticated, service_role;

drop trigger if exists employee_private_access_log_no_change on employee_private_access_log;
create trigger employee_private_access_log_no_change
  before update or delete on employee_private_access_log
  for each row execute function employee_private_access_log_immutable();
drop trigger if exists employee_private_access_log_no_truncate on employee_private_access_log;
create trigger employee_private_access_log_no_truncate
  before truncate on employee_private_access_log
  for each statement execute function employee_private_access_log_immutable();

comment on table employee_private_access_log is '員工敏感資料存取紀錄（顯示明文／寫入／匯入），hr 可讀、不可改刪（0031）';

-- ============================================================
-- 5) 內部函式（只供 hr_* RPC 以擁有者身分呼叫；撤銷所有 API 角色的執行權）
-- ============================================================
create or replace function hr_private_fields()
returns text[]
language sql
immutable
as $$
  select array['national_id', 'household_address', 'emergency_contact', 'marital', 'education', 'experience'];
$$;

-- 維運身分（決策 7）
create or replace function hr_caller_is_maintenance()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
         in ('postgres', 'supabase_admin');
$$;

-- 呼叫者資料庫角色（存取紀錄用）
create or replace function hr_caller_role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('role', true), 'none'), session_user::text);
$$;

create or replace function hr_assert_access(p_allow_maintenance boolean default false)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if coalesce(has_module('hr'), false) then
    return;
  end if;
  if p_allow_maintenance and hr_caller_is_maintenance() then
    return;
  end if;
  raise exception using errcode = 'P0001', message = 'forbidden',
    detail = '沒有人事（hr）模組權限';
end;
$$;

-- 金鑰：Vault secret employee_pii_key；不存在／空白／過短 → hr_key_missing（不可用空金鑰或預設金鑰）
create or replace function hr_pii_key()
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  begin
    select s.decrypted_secret into v_key
      from vault.decrypted_secrets s
     where s.name = 'employee_pii_key'
     limit 1;
  exception when undefined_table or invalid_schema_name or undefined_column then
    v_key := null;
  end;
  if v_key is null or char_length(btrim(v_key)) < 32 then
    raise exception using errcode = 'P0001', message = 'hr_key_missing',
      detail = '找不到敏感資料加密金鑰（Vault secret employee_pii_key 不存在或長度不足 32 字元），請聯絡系統管理者';
  end if;
  return v_key;
end;
$$;

create or replace function hr_encrypt(p_value text, p_key text)
returns bytea
language sql
volatile
set search_path = public, pg_temp
as $$
  select case when p_value is null then null
              else extensions.pgp_sym_encrypt(p_value, p_key, 'cipher-algo=aes256') end;
$$;

create or replace function hr_decrypt(p_value bytea, p_key text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_value is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(p_value, p_key);
exception when others then
  raise exception using errcode = 'P0001', message = 'hr_decrypt_failed',
    detail = '敏感資料無法解密（加密金鑰可能已變更），請聯絡系統管理者';
end;
$$;

-- 寫入前整理（去頭尾空白；身份證號另去空白、轉大寫）與長度檢查；空白 → null
create or replace function hr_clean_private(p_field text, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(p_value, ''), E' \t\r\n　');
  v_max int;
begin
  if p_field = 'national_id' then
    v := upper(regexp_replace(v, '[[:space:]　]+', '', 'g'));
  end if;
  if v = '' then
    return null;
  end if;
  v_max := case p_field
             when 'national_id'       then 20
             when 'household_address' then 200
             when 'emergency_contact' then 500
             when 'marital'           then 20
             when 'education'         then 500
             when 'experience'        then 2000
           end;
  if v_max is null then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('未知的敏感欄位：%s', p_field);
  end if;
  if char_length(v) > v_max then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('敏感欄位 %s 不可超過 %s 字', p_field, v_max);
  end if;
  return v;
end;
$$;

-- 遮罩（決策 8；與前端 maskPrivateValue 一致）
create or replace function hr_mask_private(p_field text, p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(p_value, ''));
  n int;
  k int;
  m text[];
begin
  if v = '' then
    return null;
  end if;
  if p_field = 'national_id' then
    v := upper(regexp_replace(v, '[[:space:]　]+', '', 'g'));
    n := char_length(v);
    if n <= 2 then
      return repeat('*', n);
    elsif n <= 5 then
      return left(v, 1) || repeat('*', n - 1);
    end if;
    return left(v, 3) || repeat('*', n - 5) || right(v, 2);
  elsif p_field = 'household_address' then
    v := regexp_replace(v, '^[0-9０-９[:space:]-]+', '');
    m := regexp_match(v, '^([^縣市]{1,4}[縣市])([^鄉鎮市區]{1,4}[鄉鎮市區])?');
    if m is null then
      return '已填寫';
    end if;
    return m[1] || coalesce(m[2], '') || '…';
  elsif p_field = 'emergency_contact' then
    return format('已填寫（%s 字）', char_length(v));
  elsif p_field = 'marital' then
    return '已填寫';
  elsif p_field in ('education', 'experience') then
    n := char_length(v);
    k := least(4, n / 2);
    return left(v, k) || '…';
  end if;
  raise exception using errcode = 'P0001', message = 'validation',
    detail = format('未知的敏感欄位：%s', p_field);
end;
$$;

-- 取出某欄位的密文
create or replace function hr_private_cipher(p_row employee_private, p_field text)
returns bytea
language sql
immutable
as $$
  select case p_field
           when 'national_id'       then p_row.national_id_enc
           when 'household_address' then p_row.household_address_enc
           when 'emergency_contact' then p_row.emergency_contact_enc
           when 'marital'           then p_row.marital_enc
           when 'education'         then p_row.education_enc
           when 'experience'        then p_row.experience_enc
         end;
$$;

create or replace function hr_log_access(p_employee_id uuid, p_field text, p_action text)
returns void
language sql
volatile
set search_path = public, pg_temp
as $$
  insert into employee_private_access_log (user_id, actor_email, actor_role, employee_id, field, action)
  values (auth.uid(),
          (select p.email from admin_profiles p where p.id = auth.uid()),
          hr_caller_role(),
          p_employee_id, p_field, p_action);
$$;

-- 寫入一位員工的敏感欄位（呼叫前已檢查權限；p_fields 鍵 → 已整理的明文或 null）
-- p_only_changed = true：解密比對，內容相同的欄位不重寫（匯入用）。回傳實際寫入的欄位。
create or replace function hr_write_private(
  p_employee_id uuid,
  p_fields jsonb,
  p_key text,
  p_only_changed boolean
)
returns text[]
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_row     employee_private;
  v_field   text;
  v_new     text;
  v_written text[] := '{}';
begin
  insert into employee_private (employee_id, updated_by)
  values (p_employee_id, auth.uid())
  on conflict (employee_id) do nothing;

  select * into v_row from employee_private where employee_id = p_employee_id for update;

  foreach v_field in array hr_private_fields() loop
    continue when not (p_fields ? v_field);
    v_new := p_fields ->> v_field;
    if p_only_changed and v_new is not distinct from hr_decrypt(hr_private_cipher(v_row, v_field), p_key) then
      continue;
    end if;
    v_written := v_written || v_field;
  end loop;

  if cardinality(v_written) = 0 then
    return v_written;
  end if;

  update employee_private set
    national_id_enc       = case when 'national_id' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'national_id', p_key) else national_id_enc end,
    household_address_enc = case when 'household_address' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'household_address', p_key) else household_address_enc end,
    emergency_contact_enc = case when 'emergency_contact' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'emergency_contact', p_key) else emergency_contact_enc end,
    marital_enc           = case when 'marital' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'marital', p_key) else marital_enc end,
    education_enc         = case when 'education' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'education', p_key) else education_enc end,
    experience_enc        = case when 'experience' = any (v_written)
                                 then hr_encrypt(p_fields ->> 'experience', p_key) else experience_enc end,
    updated_at = now(),
    updated_by = auth.uid()
  where employee_id = p_employee_id;

  return v_written;
end;
$$;

-- p_fields（使用者輸入）→ 已整理的 jsonb；未知鍵或非字串值 → validation
create or replace function hr_clean_private_fields(p_fields jsonb, p_drop_empty boolean)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_key  text;
  v_val  jsonb;
  v_text text;
  v_out  jsonb := '{}'::jsonb;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '敏感資料格式錯誤（需為物件）';
  end if;
  for v_key, v_val in select * from jsonb_each(p_fields) loop
    if not (v_key = any (hr_private_fields())) then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = format('未知的敏感欄位：%s', v_key);
    end if;
    if jsonb_typeof(v_val) not in ('string', 'null') then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = format('敏感欄位 %s 需為文字', v_key);
    end if;
    v_text := hr_clean_private(v_key, v_val #>> '{}');
    if v_text is null and p_drop_empty then
      continue;
    end if;
    v_out := v_out || jsonb_build_object(v_key, v_text);
  end loop;
  return v_out;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'hr_private_fields()',
    'hr_caller_is_maintenance()',
    'hr_caller_role()',
    'hr_assert_access(boolean)',
    'hr_pii_key()',
    'hr_encrypt(text, text)',
    'hr_decrypt(bytea, text)',
    'hr_clean_private(text, text)',
    'hr_mask_private(text, text)',
    'hr_private_cipher(employee_private, text)',
    'hr_log_access(uuid, text, text)',
    'hr_write_private(uuid, jsonb, text, boolean)',
    'hr_clean_private_fields(jsonb, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role;', f);
  end loop;
end $$;

-- ============================================================
-- 6) RPC
-- ============================================================

-- 遮罩值（不回傳明文）：
--   { "employee_id", "exists": bool, "updated_at", "fields": { national_id: 遮罩|null, … } }
create or replace function hr_get_employee_private(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_row    employee_private;
  v_key    text;
  v_field  text;
  v_fields jsonb := '{}'::jsonb;
begin
  perform hr_assert_access(false);
  if p_employee_id is null or not exists (select 1 from employees where id = p_employee_id) then
    raise exception using errcode = 'P0001', message = 'not_found', detail = '找不到此員工';
  end if;
  v_key := hr_pii_key();
  select * into v_row from employee_private where employee_id = p_employee_id;
  foreach v_field in array hr_private_fields() loop
    v_fields := v_fields || jsonb_build_object(
      v_field,
      case when v_row.employee_id is null then null
           else hr_mask_private(v_field, hr_decrypt(hr_private_cipher(v_row, v_field), v_key)) end
    );
  end loop;
  return jsonb_build_object(
    'employee_id', p_employee_id,
    'exists', v_row.employee_id is not null,
    'updated_at', v_row.updated_at,
    'fields', v_fields
  );
end;
$$;

-- 單一欄位明文；每次呼叫都寫入存取紀錄（含空值）
create or replace function hr_reveal_employee_private(p_employee_id uuid, p_field text)
returns text
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_row employee_private;
  v_key text;
begin
  perform hr_assert_access(false);
  if p_field is null or not (p_field = any (hr_private_fields())) then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('未知的敏感欄位：%s', coalesce(p_field, '（空）'));
  end if;
  if p_employee_id is null or not exists (select 1 from employees where id = p_employee_id) then
    raise exception using errcode = 'P0001', message = 'not_found', detail = '找不到此員工';
  end if;
  v_key := hr_pii_key();
  select * into v_row from employee_private where employee_id = p_employee_id;
  perform hr_log_access(p_employee_id, p_field, 'reveal');
  if v_row.employee_id is null then
    return null;
  end if;
  return hr_decrypt(hr_private_cipher(v_row, p_field), v_key);
end;
$$;

-- 加密寫入（語意見決策 6）；回傳寫入後的遮罩值（同 hr_get_employee_private）
create or replace function hr_upsert_employee_private(p_employee_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_clean   jsonb;
  v_key     text;
  v_written text[];
  v_field   text;
begin
  perform hr_assert_access(false);
  if p_employee_id is null or not exists (select 1 from employees where id = p_employee_id) then
    raise exception using errcode = 'P0001', message = 'not_found', detail = '找不到此員工';
  end if;
  v_clean := hr_clean_private_fields(p_fields, false);
  v_key := hr_pii_key();
  v_written := hr_write_private(p_employee_id, v_clean, v_key, false);
  foreach v_field in array v_written loop
    perform hr_log_access(p_employee_id, v_field, 'write');
  end loop;
  return hr_get_employee_private(p_employee_id);
end;
$$;

-- 批次匯入：p_rows = [{ "employee_id": uuid, "national_id": "…", … }, …]
-- 只寫非空值、內容相同不重寫（可重跑）；任一列錯誤整批 rollback。
-- 回傳 { rows, written_fields, unchanged_rows }。
create or replace function hr_import_employee_private(p_rows jsonb)
returns jsonb
language plpgsql
security definer
volatile
set search_path = public, pg_temp
as $$
declare
  v_key       text;
  v_row       jsonb;
  v_id        uuid;
  v_clean     jsonb;
  v_written   text[];
  v_field     text;
  v_rows      int := 0;
  v_fields    int := 0;
  v_unchanged int := 0;
begin
  perform hr_assert_access(true);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = 'P0001', message = 'validation', detail = '匯入資料格式錯誤（需為陣列）';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception using errcode = 'P0001', message = 'validation', detail = '一次最多匯入 2000 筆';
  end if;
  v_key := hr_pii_key();

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception using errcode = 'P0001', message = 'validation', detail = '匯入資料每列需為物件';
    end if;
    begin
      v_id := (v_row ->> 'employee_id')::uuid;
    exception when invalid_text_representation then
      v_id := null;
    end;
    if v_id is null or not exists (select 1 from employees where id = v_id) then
      raise exception using errcode = 'P0001', message = 'not_found',
        detail = format('找不到員工：%s', coalesce(v_row ->> 'employee_id', '（空）'));
    end if;
    v_clean := hr_clean_private_fields(v_row - 'employee_id', true);
    v_rows := v_rows + 1;
    if v_clean = '{}'::jsonb then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;
    v_written := hr_write_private(v_id, v_clean, v_key, true);
    if cardinality(v_written) = 0 then
      v_unchanged := v_unchanged + 1;
    end if;
    foreach v_field in array v_written loop
      perform hr_log_access(v_id, v_field, 'import');
      v_fields := v_fields + 1;
    end loop;
  end loop;

  return jsonb_build_object('rows', v_rows, 'written_fields', v_fields, 'unchanged_rows', v_unchanged);
end;
$$;

revoke execute on function hr_get_employee_private(uuid) from public, anon, service_role;
revoke execute on function hr_reveal_employee_private(uuid, text) from public, anon, service_role;
revoke execute on function hr_upsert_employee_private(uuid, jsonb) from public, anon, service_role;
revoke execute on function hr_import_employee_private(jsonb) from public, anon, service_role;
grant execute on function hr_get_employee_private(uuid) to authenticated;
grant execute on function hr_reveal_employee_private(uuid, text) to authenticated;
grant execute on function hr_upsert_employee_private(uuid, jsonb) to authenticated;
grant execute on function hr_import_employee_private(jsonb) to authenticated;
