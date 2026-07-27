-- 0011_office_maintenance.sql
-- 行政「空壓機保養記錄卡」MVP：新增 office 角色 RPC + 三層資料模型 + 辨識稽核表。
-- 依賴 0002（admin_profiles / is_admin）、0005（is_seo_manager 樣式）。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

-- ============================================================
-- 角色判斷：is_office()（鏡像 is_seo_manager 的安全設定）
-- ============================================================
create or replace function is_office()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p
    where p.id = auth.uid() and p.role = 'office'
  );
$$;

revoke execute on function is_office() from public, anon;
grant execute on function is_office() to authenticated;

-- ============================================================
-- 資料表（三層 + 辨識稽核）。前綴 mx_ 與 CMS 表區隔。
-- ============================================================
create table mx_customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table mx_machines (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references mx_customers(id) on delete cascade,
  card_no      text,
  serial_no    text not null,
  location     text,
  purchased_at date,
  model        text,
  horsepower   text,
  voltage      text,
  created_at   timestamptz not null default now()
);

-- 機號唯一：供拍照辨識比對；大小寫 / 前後空白正規化後唯一。
create unique index mx_machines_serial_no_key
  on mx_machines (lower(btrim(serial_no)));

create index mx_machines_customer_id_idx on mx_machines (customer_id);

create table mx_records (
  id            uuid primary key default gen_random_uuid(),
  machine_id    uuid not null references mx_machines(id) on delete cascade,
  service_date  date,
  hours         text,
  oil           text,
  oil_filter    text,
  air_filter    text,
  oil_separator text,
  inverter      text,
  filter_system text,
  technician    text,
  note          text,
  source        text not null default 'manual' check (source in ('manual','photo')),
  created_at    timestamptz not null default now()
);

create index mx_records_machine_id_idx on mx_records (machine_id);

create table mx_import_drafts (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid,
  photo_path  text,
  raw_output  jsonb,
  status      text not null default 'pending'
               check (status in ('pending','committed','discarded')),
  machine_id  uuid references mx_machines(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- RLS：四表僅對 is_office() 開 SELECT/INSERT/UPDATE/DELETE。
-- 無 admin / seo_manager policy → fail-closed（方案 B 資料隔離）。
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'mx_customers','mx_machines','mx_records','mx_import_drafts'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "office all %1$s" on %1$I for all to authenticated using (is_office()) with check (is_office());',
      t
    );
  end loop;
end $$;

-- 備註：office 帳號由後台「人員管理」以 service_role 建立（同 seo_manager）。
--       service_role 繞過 RLS（部署層固有），故 admin 隔離為 UI+RLS 層級，非加密隔離。
