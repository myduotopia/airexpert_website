-- AirExpert V3 技術 SEO migration（V3-7）— 301/302 轉址表 redirects
-- 舊站使用 .html 路徑，改版後路由不同；為避免外部連結 / 搜尋引擎既有索引斷鏈，
-- 以 DB 表維護「舊路徑 → 新路徑」對照，由 Next 16 proxy（前身 middleware）查表轉址。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0002 套路）。
--
-- 讀取策略（與 proxy.ts 對齊）：
--   轉址對照「非機密」（公開可見的 URL 對照），且 proxy 以 anon key 在邊緣查表，
--   故開放 anon SELECT「enabled=true」的列即可（fail-closed：停用列不外洩、不轉址）。
--   寫入一律 admin（is_admin()），鏡像其他內容表。proxy 端另以記憶體快取 + TTL
--   降低查詢頻率（見 lib/redirects）。

-- ============================================================
-- redirects 表
-- ============================================================
create table if not exists redirects (
  id         uuid primary key default gen_random_uuid(),
  from_path  text not null unique,                       -- 來源路徑（含前導 /，可為 .html）
  to_path    text not null,                              -- 目標路徑（站內絕對路徑或完整 URL）
  status     int  not null default 301,                  -- 301（永久）或 302（暫時）
  enabled    boolean not null default true,
  created_at timestamptz not null default now(),
  constraint redirects_status_chk check (status in (301, 302))
);

-- 以 from_path 查表（unique 已建索引）；額外對 enabled 過濾，多數列為 true 故不另建部分索引。

alter table redirects enable row level security;

-- 公開（anon / authenticated）可讀「啟用中」的列：proxy 在邊緣查表所需，且內容非機密。
create policy "public read enabled redirects" on redirects
  for select using (enabled);

-- 寫入限 admin（鏡像 0002 各內容表的 "admin all X"）。
create policy "admin all redirects" on redirects
  for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================
-- 種子：舊站 .html → 新路由（依實際舊站 URL 補充 / 調整）。
-- on conflict do nothing → 可重跑不報錯；admin 之後可於後台增修。
-- ============================================================
insert into redirects (from_path, to_path, status) values
  ('/index.html',    '/',         301),
  ('/products.html', '/products', 301),
  ('/news.html',     '/news',     301),
  ('/cases.html',    '/cases',    301),
  ('/service.html',  '/services', 301),
  ('/contact.html',  '/contact',  301)
on conflict (from_path) do nothing;
