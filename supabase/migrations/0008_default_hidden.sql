-- AirExpert — 全部內容預設「隱藏」（#89）
-- 政策調整：新建內容一律先隱藏（draft），由管理者確認後再切「公開」（published）。
-- products / articles / cases 在 0001 已是 default 'draft'；本檔補齊 events / photo_albums，
-- 使其與其他內容一致（原為 default 'published'）。
-- 注意：僅改「新列預設值」，既有資料列的 status 不受影響。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 0001 / 0007 套路）。

alter table events alter column status set default 'draft';
alter table photo_albums alter column status set default 'draft';
