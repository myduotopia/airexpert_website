-- AirExpert 官網初始 schema
-- 依舊站 sitemap 內容設計：商品 / 最新消息 / 節能實績 / 公司活動 / 活動照片 / 聯絡 / AI 草稿
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行，或 supabase db push

-- ---------- 共用 ----------
create type content_status as enum ('draft', 'published', 'archived');

-- updated_at 自動更新
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- 商品介紹 (products-1/2/3/8/9/10) ----------
create table products (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  category      text not null,                 -- 變頻空壓機 / 變頻真空泵 / 變頻鼓風機 / 離心式空壓機 / 冷凍式乾燥機 / 吸附式乾燥機
  brand         text,                          -- KAISHAN / DELTECH
  name          text not null,
  summary       text,
  body_html     text,
  spec          jsonb not null default '{}'::jsonb,   -- 規格表
  images        jsonb not null default '[]'::jsonb,   -- [{url, alt, sort}]
  seo_title     text,
  seo_description text,
  sort_order    int not null default 0,
  status        content_status not null default 'draft',
  legacy_path   text,                          -- 舊站來源, e.g. products-1.html
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_category_idx on products (category) where status = 'published';
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- ---------- 最新消息 (content-NN) 新聞快訊 / 新機發表 / ESG實績 ----------
create table articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  category      text not null,                 -- 新聞快訊 / 新機發表 / ESG實績
  title         text not null,
  excerpt       text,
  body_html     text,
  cover_image   text,
  images        jsonb not null default '[]'::jsonb,
  seo_title     text,
  seo_description text,
  status        content_status not null default 'draft',
  published_at  timestamptz,
  legacy_path   text,                          -- content-NN.html
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index articles_category_published_idx on articles (category, published_at desc)
  where status = 'published';
create trigger articles_updated_at before update on articles
  for each row execute function set_updated_at();

-- ---------- 節能實績 (case-item NN) 空壓機 / 乾燥機 ----------
create table cases (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  category      text not null,                 -- 空壓機 / 乾燥機
  title         text not null,
  region        text,                          -- e.g. 台南市仁德區
  industry      text,                          -- e.g. 電線製造廠
  body_html     text,
  metrics       jsonb not null default '{}'::jsonb,   -- {能耗節省, 投資回收期, 年省電度數...}
  images        jsonb not null default '[]'::jsonb,
  status        content_status not null default 'draft',
  legacy_path   text,                          -- case-item NN.html
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index cases_category_idx on cases (category) where status = 'published';
create trigger cases_updated_at before update on cases
  for each row execute function set_updated_at();

-- ---------- 公司活動 / 交機實錄影片 (event) ----------
create table events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  video_url     text,                          -- YouTube 連結
  event_date    date,
  sort_order    int not null default 0,
  status        content_status not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger events_updated_at before update on events
  for each row execute function set_updated_at();

-- ---------- 活動照片 (photos) ----------
create table photo_albums (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  description   text,
  cover_image   text,
  status        content_status not null default 'published',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger photo_albums_updated_at before update on photo_albums
  for each row execute function set_updated_at();

create table photos (
  id            uuid primary key default gen_random_uuid(),
  album_id      uuid not null references photo_albums (id) on delete cascade,
  image_url     text not null,
  caption       text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
create index photos_album_idx on photos (album_id, sort_order);

-- ---------- 聯絡表單 (contact) ----------
create table contact_submissions (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  company       text,
  phone         text,
  email         text,
  message       text,
  source_page   text,
  created_at    timestamptz not null default now()
);

-- ---------- AI 內容草稿 (後台 SEO 文案 / 內容生成) ----------
create table ai_content_drafts (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null,                 -- product / article / case
  target_id     uuid,
  kind          text not null,                 -- seo_title / seo_description / body / excerpt
  prompt        text,
  model         text,                          -- Vertex AI model id
  output        text,
  status        text not null default 'pending', -- pending / accepted / rejected
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index ai_drafts_target_idx on ai_content_drafts (target_type, target_id);

-- ================= RLS =================
-- 啟用所有資料表 RLS。後端使用 service_role key 會「繞過」RLS（可全權讀寫）。
-- anon (前端) 只能讀「已發佈」內容，並可送出聯絡表單。
alter table products            enable row level security;
alter table articles            enable row level security;
alter table cases               enable row level security;
alter table events              enable row level security;
alter table photo_albums        enable row level security;
alter table photos              enable row level security;
alter table contact_submissions enable row level security;
alter table ai_content_drafts   enable row level security;

-- 公開讀取（已發佈）
create policy "public read published products" on products
  for select using (status = 'published');
create policy "public read published articles" on articles
  for select using (status = 'published');
create policy "public read published cases" on cases
  for select using (status = 'published');
create policy "public read published events" on events
  for select using (status = 'published');
create policy "public read published albums" on photo_albums
  for select using (status = 'published');
create policy "public read photos of published albums" on photos
  for select using (
    exists (
      select 1 from photo_albums a
      where a.id = photos.album_id and a.status = 'published'
    )
  );

-- 聯絡表單：任何人可送出（insert），但不可讀取
create policy "anyone can submit contact" on contact_submissions
  for insert with check (true);

-- 寫入內容 / 讀聯絡表單 / AI 草稿：僅後端 service_role（繞過 RLS）。
-- 之後導入後台登入（auth）後，再為 authenticated 管理員新增對應 policy。
