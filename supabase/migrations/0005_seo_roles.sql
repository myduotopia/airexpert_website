-- AirExpert V3 SEO 代管角色 migration（V3-3）
-- 在 0002_v2_cms.sql（admin_profiles / is_admin / 各表 RLS）之上，導入第二種後台角色
-- 「SEO 代管」(seo_manager)，並修正 is_admin() 的語意。
--
-- 背景與安全修正（重要）：
--   0002 的 is_admin() 是「admin_profiles 內是否存在該 user」的存在性判斷，
--   在只有 admin 一種角色時等同「是否為 admin」。但 V3 新增 seo_manager 後，
--   代管帳號也會寫入 admin_profiles，若沿用存在性判斷，is_admin() 會對代管回傳 true，
--   使所有 requireAdmin()（前端）與 "admin all X"（RLS）防線對代管失效 → 權限提升。
--   故本檔將 is_admin() 收斂為「role = 'admin'」，requireAdmin 與既有 RLS 自動恢復為
--   僅限 admin；代管的讀取另以下方 seo_manager 專屬 SELECT policy 提供，寫入維持
--   fail-closed（由 server action 以 service_role + 欄位白名單控制，見 V3-4）。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0002 套路）。

-- ============================================================
-- is_admin() 收斂為 role = 'admin'（安全修正；既有第一位 admin 之 role 預設即 'admin'）
-- ============================================================
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ============================================================
-- 角色判斷：seo_manager / admin_or_seo（鏡像 is_admin 的安全設定）
-- ============================================================
create or replace function is_seo_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p
    where p.id = auth.uid() and p.role = 'seo_manager'
  );
$$;

create or replace function is_admin_or_seo()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from admin_profiles p
    where p.id = auth.uid() and p.role in ('admin', 'seo_manager')
  );
$$;

-- 收斂執行權限：僅登入者可評估（同 is_admin 的縱深防禦）。
revoke execute on function is_seo_manager() from public, anon;
revoke execute on function is_admin_or_seo() from public, anon;
grant execute on function is_seo_manager() to authenticated;
grant execute on function is_admin_or_seo() to authenticated;

-- ============================================================
-- seo_manager 讀取 RLS：可讀五個內容表「全部列」（含草稿），以便檢視 / 管理 SEO。
-- 與既有「public read published」「admin all（現為 role='admin'）」policy 並存（OR）。
-- 寫入「不」開放給 seo_manager（fail-closed）：代管寫入一律走 server action（service_role）
-- 並以欄位白名單（lib/admin/seo-whitelist）限制只能改 SEO 欄位，見 V3-4。
-- 不對 site_settings 開 seo_manager 讀取，避免讀到 is_public=false 的加密設定
-- （ai_config / contact_notify）；代管需要的公開設定仍由「public read public site_settings」提供。
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'products','articles','cases','services','photo_albums'
  ]
  loop
    execute format(
      'create policy "seo_manager reads %1$s" on %1$I for select to authenticated using (is_seo_manager());',
      t
    );
  end loop;
end $$;

-- 備註：
--   * 第一位 admin 仍由 SQL 佈建（見 0002）：insert into admin_profiles (id, email) → role 預設 'admin'。
--   * seo_manager 帳號由後台「人員管理」頁建立（Supabase Auth admin API + admin_profiles role='seo_manager'）。
--   * admin_profiles 無 insert/update/delete policy（fail-closed）；新增/刪除帳號走 service_role。
