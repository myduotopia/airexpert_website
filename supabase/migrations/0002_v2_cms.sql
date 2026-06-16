-- AirExpert V2 CMS 地基 migration
-- 在 0001_init_schema.sql 之上新增：
--   * admin 身分（admin_profiles + is_admin()）
--   * 品牌介紹 brands / 服務項目 services（原本靜態，V2 改 DB）
--   * 全域內容 site_settings（首頁 hero、聯絡資訊…）
--   * cases 補 SEO 欄位
--   * admin 寫入 RLS（沿用 0001 的 content_status enum 與 set_updated_at()）
--   * Supabase Storage bucket `media`
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 套路）。

-- ============================================================
-- admin 身分
-- ============================================================
create table admin_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'admin',
  email      text,
  created_at timestamptz not null default now()
);
alter table admin_profiles enable row level security;

-- 目前登入者是否為 admin。SECURITY DEFINER 以便在各表 policy 內讀 admin_profiles，
-- 避免 policy 遞迴與權限問題。
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p where p.id = auth.uid()
  );
$$;

-- admin 只能讀自己的 profile。
create policy "admin reads own profile" on admin_profiles
  for select to authenticated using (id = auth.uid());

-- is_admin() 僅供登入者評估（縱深防禦）。anon 雖然 auth.uid() 為 null 會得 false，
-- 但預設 EXECUTE 給 PUBLIC，仍明確收斂。
-- Supabase 預設也直接 grant 給 anon，故一併收斂（不只 public 偽角色）。
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- admin_profiles 無 insert/update/delete policy（刻意 fail-closed，未納入下方 admin all 迴圈）：
-- 管理員只能由 service_role 或直接 SQL 佈建。新增第一位 admin：
--   insert into admin_profiles (id, email) values ('<auth.users.id>', '<email>');
-- PR-2 的 admin 身分流程（getServerSupabase().auth.getUser() + is_admin()）依賴此表有列。

-- ============================================================
-- 品牌介紹 (KAISHAN / DELTECH) — 02、03
-- ============================================================
create table brands (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,           -- kaishan / deltech
  name            text not null,
  logo_url        text,
  summary         text,
  body_html       text,
  images          jsonb not null default '[]'::jsonb,   -- [{url, alt, sort}]
  seo_title       text,
  seo_description text,
  sort_order      int not null default 0,
  status          content_status not null default 'draft',
  legacy_path     text,                           -- kaishan.html / deltech.html
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index brands_published_idx on brands (sort_order) where status = 'published';
create trigger brands_updated_at before update on brands
  for each row execute function set_updated_at();

-- ============================================================
-- 服務項目 ×4 (節能方案 / 節能技術 / 機房規劃 / 減碳行動) — 13–16
-- ============================================================
create table services (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,           -- energy-plan / energy-tech / room-planning / carbon-reduction
  title           text not null,
  summary         text,
  body_html       text,
  images          jsonb not null default '[]'::jsonb,
  seo_title       text,
  seo_description text,
  sort_order      int not null default 0,
  status          content_status not null default 'draft',
  legacy_path     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index services_published_idx on services (sort_order) where status = 'published';
create trigger services_updated_at before update on services
  for each row execute function set_updated_at();

-- ============================================================
-- 全域內容 / 設定（首頁 hero、精選區塊、聯絡資訊…）
-- key 例：home_hero / home_featured / contact_info / footer
-- is_public：是否對外公開讀取。預設 false（fail-closed）——前台需要的 key（首頁/聯絡）
-- seed 時要明確設 is_public=true。敏感設定即使誤放這裡也不會外洩（#37 仍會另建加密表）。
-- ============================================================
create table site_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger site_settings_updated_at before update on site_settings
  for each row execute function set_updated_at();

-- ============================================================
-- cases 補 SEO 欄位（products / articles 已有）
-- ============================================================
alter table cases add column seo_title text;
alter table cases add column seo_description text;

-- ============================================================
-- RLS
-- ============================================================
alter table brands        enable row level security;
alter table services      enable row level security;
alter table site_settings enable row level security;

-- 公開讀已發佈 brands / services
create policy "public read published brands" on brands
  for select using (status = 'published');
create policy "public read published services" on services
  for select using (status = 'published');

-- site_settings 只公開讀 is_public=true 的列（fail-closed；新 key 預設不外洩）
create policy "public read public site_settings" on site_settings
  for select using (is_public);

-- admin（authenticated 且 is_admin）對所有內容表全權讀寫。
-- 與既有「公開讀 published」policy 並存（RLS policy 為 permissive，OR 關係）。
do $$
declare t text;
begin
  foreach t in array array[
    'products','articles','cases','events','photo_albums','photos',
    'brands','services','site_settings','ai_content_drafts'
  ]
  loop
    execute format(
      'create policy "admin all %1$s" on %1$I for all to authenticated using (is_admin()) with check (is_admin());',
      t
    );
  end loop;
end $$;

-- admin 可讀聯絡來信（0001 已有「anyone can submit」insert policy）
create policy "admin reads contacts" on contact_submissions
  for select to authenticated using (is_admin());

-- ============================================================
-- Storage：媒體 bucket（圖片上傳）
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;

-- 公開讀 media
create policy "public read media" on storage.objects
  for select using (bucket_id = 'media');

-- admin 可上傳 / 修改 / 刪除 media
create policy "admin write media" on storage.objects
  for all to authenticated
  using (bucket_id = 'media' and is_admin())
  with check (bucket_id = 'media' and is_admin());
