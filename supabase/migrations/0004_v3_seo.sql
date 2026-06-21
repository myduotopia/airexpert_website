-- AirExpert V3 SEO 強化 migration（V3-1）
-- 在 0002_v2_cms.sql 之上，為五個內容區補齊「完整 SEO meta」欄位：
--   商品介紹 products / 最新消息 articles / 服務項目 services /
--   節能實績 cases / 公司活動相簿 photo_albums。
-- 既有欄位（0001/0002 已建）：slug / seo_title / seo_description；本檔新增其餘 meta。
-- 對應前端：各內容編輯頁的 <SeoFields>、各 detail 頁的 generateMetadata 與 JSON-LD。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0002 套路）。
--
-- 新增欄位（每表皆同）：
--   canonical_url   text                          -- 自訂 canonical（空 → 由頁面預設）
--   og_title        text                          -- Open Graph 標題（空 → 退回 seo_title/title）
--   og_description  text                          -- Open Graph 描述（空 → 退回 seo_description/摘要）
--   og_image_url    text                          -- Open Graph 圖片（空 → 退回封面/首圖）
--   schema_jsonld   jsonb                         -- 自訂 JSON-LD（輸出時跳脫 `<` 防 XSS）
--   noindex         boolean not null default false -- true → robots noindex
--   nofollow        boolean not null default false -- true → robots nofollow
--
-- 以 `add column if not exists` 維持可重跑（idempotent-ish）：重複執行不報錯。

-- ============================================================
-- 商品介紹 products
-- ============================================================
alter table products add column if not exists canonical_url  text;
alter table products add column if not exists og_title       text;
alter table products add column if not exists og_description text;
alter table products add column if not exists og_image_url   text;
alter table products add column if not exists schema_jsonld  jsonb;
alter table products add column if not exists noindex        boolean not null default false;
alter table products add column if not exists nofollow       boolean not null default false;

-- ============================================================
-- 最新消息 articles
-- ============================================================
alter table articles add column if not exists canonical_url  text;
alter table articles add column if not exists og_title       text;
alter table articles add column if not exists og_description text;
alter table articles add column if not exists og_image_url   text;
alter table articles add column if not exists schema_jsonld  jsonb;
alter table articles add column if not exists noindex        boolean not null default false;
alter table articles add column if not exists nofollow       boolean not null default false;

-- ============================================================
-- 服務項目 services
-- ============================================================
alter table services add column if not exists canonical_url  text;
alter table services add column if not exists og_title       text;
alter table services add column if not exists og_description text;
alter table services add column if not exists og_image_url   text;
alter table services add column if not exists schema_jsonld  jsonb;
alter table services add column if not exists noindex        boolean not null default false;
alter table services add column if not exists nofollow       boolean not null default false;

-- ============================================================
-- 節能實績 cases
-- ============================================================
alter table cases add column if not exists canonical_url  text;
alter table cases add column if not exists og_title       text;
alter table cases add column if not exists og_description text;
alter table cases add column if not exists og_image_url   text;
alter table cases add column if not exists schema_jsonld  jsonb;
alter table cases add column if not exists noindex        boolean not null default false;
alter table cases add column if not exists nofollow       boolean not null default false;

-- ============================================================
-- 公司活動相簿 photo_albums
-- （0001 既有 slug；尚無 seo_title / seo_description，於此一併補上完整 SEO 欄位）
-- ============================================================
alter table photo_albums add column if not exists seo_title      text;
alter table photo_albums add column if not exists seo_description text;
alter table photo_albums add column if not exists canonical_url  text;
alter table photo_albums add column if not exists og_title       text;
alter table photo_albums add column if not exists og_description text;
alter table photo_albums add column if not exists og_image_url   text;
alter table photo_albums add column if not exists schema_jsonld  jsonb;
alter table photo_albums add column if not exists noindex        boolean not null default false;
alter table photo_albums add column if not exists nofollow       boolean not null default false;
