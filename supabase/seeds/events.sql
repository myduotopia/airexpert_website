-- 公司活動（Events）種子資料 —— 代表性樣本，非完整匯入。
--
-- 註：完整匯入（交機影片 + 活動花絮相簿，來源：網站存檔 / 19_20）屬後續工作。
--     本檔僅放少量代表性資料，讓 /events 列表頁、相簿詳情頁與後台 CRUD
--     可實際運作與驗收。YouTube 連結為佔位，圖片 image_url 暫留空（待後台上傳）。
--
-- 冪等策略：
--   - events 無 unique slug → 以 title 為識別，用 NOT EXISTS 判斷避免重複插入。
--   - photo_albums → on conflict (slug) do update（slug 為 unique）。
--   - photos → 先依所屬相簿 delete 再 insert，整體可重複執行。

-- ---------- 交機影片（events） ----------
insert into events (title, description, video_url, event_date, sort_order, status)
select v.title, v.description, v.video_url, v.event_date, v.sort_order, 'published'
from (values
  (
    '台南安平塑膠製品製造商空壓系統改善工程',
    '為塑膠製品製造商導入節能空壓系統，降低用氣高峰能耗。',
    'https://www.youtube.com/watch?v=-0fMgajQAu0',
    date '2025-11-12',
    0
  ),
  (
    '高雄市路竹區螺絲加工廠空壓改善工程',
    '螺絲加工廠整廠空壓配置最佳化，穩定供氣並降低電費。',
    'https://www.youtube.com/watch?v=UK5WMp3iNmY',
    date '2025-09-05',
    1
  ),
  (
    '高雄市連鎖汽車養護中心空壓系統改善工程',
    '連鎖汽車養護中心多據點空壓系統升級與節能改善。',
    'https://www.youtube.com/watch?v=JuA2cbWSAME',
    date '2025-07-20',
    2
  )
) as v(title, description, video_url, event_date, sort_order)
where not exists (
  select 1 from events e where e.title = v.title
);

-- ---------- 活動花絮相簿（photo_albums） ----------
insert into photo_albums (slug, title, description, cover_image, status)
values
  (
    '2025-customer-delivery-highlights',
    '2025 客戶交機現場花絮',
    '回顧 2025 年度與各產業客戶一起完成的交機與安裝現場紀錄。',
    null,
    'published'
  )
on conflict (slug) do update set
  title       = excluded.title,
  description = excluded.description,
  cover_image = excluded.cover_image,
  status      = excluded.status;

-- ---------- 相簿照片（photos） ----------
-- 先清掉此相簿既有照片，再插入，確保重複執行不會累積。
-- image_url 為 NOT NULL，故以 Supabase Storage public 路徑當佔位（host 符合
-- next.config 的 *.supabase.co allowlist；實際檔案待後台上傳後覆蓋）。
delete from photos
where album_id = (
  select id from photo_albums where slug = '2025-customer-delivery-highlights'
);

insert into photos (album_id, image_url, caption, sort_order)
select a.id, p.image_url, p.caption, p.sort_order
from photo_albums a
cross join (values
  ('https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/events/seed-delivery-1.jpg', '交機現場一', 0),
  ('https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/events/seed-delivery-2.jpg', '交機現場二', 1),
  ('https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/events/seed-delivery-3.jpg', '安裝現場', 2),
  ('https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/events/seed-delivery-4.jpg', '團隊合影', 3)
) as p(image_url, caption, sort_order)
where a.slug = '2025-customer-delivery-highlights';
