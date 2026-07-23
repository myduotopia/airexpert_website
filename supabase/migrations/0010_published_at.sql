-- 0010: cases / events / photo_albums 新增 published_at「建立日期」欄位 (issue #114)
-- 比照 articles.published_at 語意：後台列表顯示內容建立時間，可排序。
-- 兩步驟策略（重要）：
--   1. 先 add column（無 default）→ 既有資料列為 NULL（前端顯示 '-'）。
--   2. 再設 default now() → 只有未來新增的資料自動帶入時間；既有 NULL 不受影響。
-- 若一開始就帶 default now()，既有列會被回填為「執行 migration 的時間」而非真正建立時間，故拆兩步。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0008 套路）。

alter table public.cases add column if not exists published_at timestamptz;
alter table public.cases alter column published_at set default now();

alter table public.events add column if not exists published_at timestamptz;
alter table public.events alter column published_at set default now();

alter table public.photo_albums add column if not exists published_at timestamptz;
alter table public.photo_albums alter column published_at set default now();
