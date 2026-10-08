-- 0027_employees.sql
-- 員工主檔（業務／維修師傅）與既有人名文字欄位的關聯（issue #223，來源 #217 §4 P1-1）。
--   * 資料表 employees：代號（可空、唯一）、姓名（必填、正規化後唯一）、角色（sales／technician，可複選）、
--     在職（active）、備註。ERP 與機台維護報告單共用，故不加 erp_／sr_ 前綴；
--     也不用 staff 命名，避免與後台「人員管理」（/admin/staff、admin_profiles 登入帳號）混淆。
--   * RLS：has_module('erp') 或 has_module('service_report') 可 select / insert / update / delete；
--     刪除另受外鍵 on delete restrict 限制（有引用只能停用）。anon 無任何權限。
--   * 既有人名文字欄位保留為「快照」，另加可空外鍵：
--       mx_customers.sales_rep_id   → 客戶預設業務（ERP 客戶主檔「業務」）
--       erp_documents.sales_rep_id  → 單據業務（報價／銷貨／銷退）
--       sr_reports.technician_id    → 維護報告單「維護人員」
--     sr_reports.customer_signer（客戶簽名人）是客戶方人員，不是我方員工，不關聯。
--     mx_records.technician（保養卡技師，office 角色資料）本檔不處理（見 issue #223 回報）。
--   * 回填 employees_backfill()：把既有不重複的人名文字（正規化後）建成員工並回填外鍵，可重複執行。
--
-- 依賴 0001（set_updated_at()）、0011（mx_customers）、0020（has_module、erp_documents、erp_guard_document）、
--      0021／0022（sr_reports、sr_guard_report）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（以 pooler 連線或 SQL Editor 貼上執行，身分須為 postgres）。
-- ⚠️ 須先於前端程式上線：新版程式會 select／寫入 sales_rep_id、technician_id 與 employees；
--    舊程式搭配本檔不受影響（只多出可空欄位與一張新表）。
-- 本檔可重複執行：create table / index if not exists、add column if not exists、create or replace function、
--   drop policy / trigger / constraint if exists 後再建立；回填只補「尚未存在的員工」與「尚未關聯的列」。
--
-- 實作決策：
--   1. 文字快照 + 可空外鍵（而非只存文字）：報表依 id 彙總，員工改名不會拆成兩人；舊單據／舊報告的文字
--      照常顯示與列印（快照不隨主檔變動）。外鍵 on delete restrict：被引用的員工不能刪，只能停用。
--      若改用 on delete set null，刪除被「作廢報告單」引用的員工會撞上 sr_guard_report 的作廢單唯讀
--      （例外清單只有 customer_id／machine_id／plan_stage_id），故不用 set null，也就不必修改該觸發器。
--   2. 角色用 text[]（roles <@ {sales, technician}，至少一個）：可複選、選取器以 roles @> {...} 篩選；
--      日後加角色只需放寬 check，不必加欄位。
--   3. 姓名唯一以 employee_name_key(name)（去頭尾空白、連續空白（含全形）併為一個、小寫）比對，
--      與前端 lib/employees/normalize.ts 的 employeeNameKey 一致——同名不同空白／大小寫不會建成兩人。
--   4. 過帳／作廢等 security definer RPC 逐一檢查（皆不需修改）：
--      - erp_post_document（0025 版）：v_doc / v_src 為 erp_documents%rowtype、v_cust 為 record（select *），
--        多一欄不影響；過帳時只在 sales_rep 為空才由客戶補「文字」，不動 sales_rep_id——
--        此情況（草稿存檔後才設定客戶業務）單據只有文字、沒有 id，報表以姓名對回員工（見前端 reports.ts）。
--        過帳 update 只寫列出的欄位，sales_rep_id 保持草稿時的值。
--      - erp_void_document／erp_post_payment／erp_allocate_payment／erp_void_payment：不讀寫業務欄位。
--      - erp_guard_document：草稿限制只檢查單號、狀態、過帳／作廢欄位，sales_rep_id 與 sales_rep 同樣
--        「草稿可改、過帳後不可改」；回填以 postgres 身分執行，屬受信任身分不受限。
--      - sr_guard_report：作廢單任何身分皆不可更新 → 回填略過作廢報告單（文字仍顯示，只是不關聯）；
--        未作廢的報告單以 postgres 身分更新不受稽核限制。sr_guard_report_insert 不涉及此欄。
--   5. 回填來源：mx_customers.sales_rep（業務）、erp_documents.sales_rep（業務，不含作廢單）、
--      sr_reports.technician（師傅，不含作廢單）。同一姓名出現在兩種來源 → 兩個角色都給。
--      不建立員工的值：空白、超過 50 字、含多人分隔符（、 , ， / ／ ; ； & ＆ + ＋）、佔位符（- — 無 ? N/A）。
--      這些列保留文字、不關聯。作廢的 ERP 單據若姓名對得上已建立的員工，仍回填 id（不因作廢而建新員工）。

-- ============================================================
-- 1) 姓名正規化（與前端 lib/employees/normalize.ts 一致）
-- ============================================================
-- 顯示用：連續空白（含全形空白 U+3000）併為一個半形空白，去頭尾空白。
create or replace function employee_clean_name(p text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(coalesce(p, ''), '[[:space:]　]+', ' ', 'g'));
$$;

-- 比對用：employee_clean_name 再轉小寫（唯一索引與回填比對皆用此 key）。
create or replace function employee_name_key(p text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(btrim(regexp_replace(coalesce(p, ''), '[[:space:]　]+', ' ', 'g')));
$$;

-- ============================================================
-- 2) 資料表
-- ============================================================
create table if not exists employees (
  id         uuid primary key default gen_random_uuid(),
  code       text,                                   -- 員工代號（可空；非空時唯一）
  name       text not null,                          -- 姓名（正規化後唯一）
  roles      text[] not null default '{}',           -- sales（業務）／technician（維修師傅），可複選
  active     boolean not null default true,          -- 在職；停用後不出現在選取器（舊資料仍顯示）
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table employees drop constraint if exists employees_name_check;
alter table employees add constraint employees_name_check
  check (btrim(name) <> '' and char_length(name) <= 50);

alter table employees drop constraint if exists employees_roles_check;
alter table employees add constraint employees_roles_check
  check (cardinality(roles) >= 1 and roles <@ array['sales', 'technician']::text[]);

create unique index if not exists employees_code_key on employees (lower(btrim(code)))
  where code is not null and btrim(code) <> '';
create unique index if not exists employees_name_key on employees (employee_name_key(name));
create index if not exists employees_roles_idx on employees using gin (roles);

drop trigger if exists employees_updated_at on employees;
create trigger employees_updated_at before update on employees
  for each row execute function set_updated_at();

comment on table employees is '員工主檔（業務／維修師傅），ERP 與機台維護報告單共用（0027）';
comment on column employees.roles is '角色：sales＝業務、technician＝維修師傅，可複選';

-- ============================================================
-- 3) RLS 與表權限
-- ============================================================
alter table employees enable row level security;

drop policy if exists "modules select employees" on employees;
create policy "modules select employees" on employees
  for select to authenticated
  using ((select has_module('erp')) or (select has_module('service_report')));

drop policy if exists "modules insert employees" on employees;
create policy "modules insert employees" on employees
  for insert to authenticated
  with check ((select has_module('erp')) or (select has_module('service_report')));

drop policy if exists "modules update employees" on employees;
create policy "modules update employees" on employees
  for update to authenticated
  using ((select has_module('erp')) or (select has_module('service_report')))
  with check ((select has_module('erp')) or (select has_module('service_report')));

-- 刪除：未被引用才會成功（外鍵 on delete restrict）；被引用時前端提示改為停用。
drop policy if exists "modules delete employees" on employees;
create policy "modules delete employees" on employees
  for delete to authenticated
  using ((select has_module('erp')) or (select has_module('service_report')));

revoke all on table employees from anon;
revoke truncate, references, trigger on table employees from public, authenticated;

-- ============================================================
-- 4) 既有表加可空外鍵（文字欄位保留為快照）
-- ============================================================
alter table mx_customers  add column if not exists sales_rep_id  uuid references employees(id) on delete restrict;
alter table erp_documents add column if not exists sales_rep_id  uuid references employees(id) on delete restrict;
alter table sr_reports    add column if not exists technician_id uuid references employees(id) on delete restrict;

-- 外鍵檢查（刪除員工）與依業務彙總都走這些索引
create index if not exists mx_customers_sales_rep_id_idx  on mx_customers (sales_rep_id)  where sales_rep_id is not null;
create index if not exists erp_documents_sales_rep_id_idx on erp_documents (sales_rep_id) where sales_rep_id is not null;
create index if not exists sr_reports_technician_id_idx   on sr_reports (technician_id)  where technician_id is not null;

comment on column mx_customers.sales_rep_id  is '預設業務（employees）；sales_rep 為姓名快照（0027）';
comment on column erp_documents.sales_rep_id is '業務（employees）；sales_rep 為姓名快照，列印用（0027）';
comment on column sr_reports.technician_id   is '維護人員（employees）；technician 為姓名快照，列印用（0027）';

-- ============================================================
-- 5) 回填（可重複執行）
-- ============================================================
create or replace function employees_backfill()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_created   int;
  v_customers int;
  v_documents int;
  v_reports   int;
begin
  -- 5a. 既有不重複的姓名 → 員工（已存在同 key 的員工則略過，不更動其角色）
  with src(raw, role) as (
    select sales_rep, 'sales' from mx_customers where sales_rep is not null
    union all
    select sales_rep, 'sales' from erp_documents where sales_rep is not null and status <> 'voided'
    union all
    select technician, 'technician' from sr_reports where technician is not null and status <> 'voided'
  ),
  cleaned as (
    select employee_clean_name(raw) as name, employee_name_key(raw) as k, role from src
  ),
  valid as (
    select name, k, role from cleaned
     where k <> ''
       and char_length(name) <= 50
       and name !~ '[、,，/／;；&＆+＋]'
       and k not in ('-', '--', '—', '－', '無', '?', '？', 'n/a', 'na', 'none')
  ),
  agg as (
    select k,
           mode() within group (order by name) as name,          -- 最常出現的寫法
           array_agg(distinct role order by role) as roles
      from valid
     group by k
  )
  insert into employees (name, roles, note, created_by)
  select a.name, a.roles, '由既有資料自動建立（0027 回填）', null
    from agg a
   where not exists (select 1 from employees e where employee_name_key(e.name) = a.k)
  on conflict do nothing;
  get diagnostics v_created = row_count;

  -- 5b. 回填外鍵：只補尚未關聯的列（姓名 key 唯一，最多對到一位）
  update mx_customers c
     set sales_rep_id = e.id
    from employees e
   where c.sales_rep_id is null
     and c.sales_rep is not null
     and employee_name_key(c.sales_rep) = employee_name_key(e.name);
  get diagnostics v_customers = row_count;

  -- 含已過帳／作廢單（postgres 身分不受 erp_guard_document 草稿限制）
  update erp_documents d
     set sales_rep_id = e.id
    from employees e
   where d.sales_rep_id is null
     and d.sales_rep is not null
     and employee_name_key(d.sales_rep) = employee_name_key(e.name);
  get diagnostics v_documents = row_count;

  -- 作廢報告單任何身分皆不可更新（sr_guard_report），略過
  update sr_reports r
     set technician_id = e.id
    from employees e
   where r.technician_id is null
     and r.technician is not null
     and r.status <> 'voided'
     and employee_name_key(r.technician) = employee_name_key(e.name);
  get diagnostics v_reports = row_count;

  return jsonb_build_object(
    'employees_created', v_created,
    'customers_linked',  v_customers,
    'documents_linked',  v_documents,
    'reports_linked',    v_reports
  );
end;
$$;
-- 只供維運身分（postgres／service_role）執行
revoke execute on function employees_backfill() from public, anon, authenticated;

select employees_backfill();
