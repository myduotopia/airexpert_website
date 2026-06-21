-- 0003：給 articles / cases 補 sort_order，供後台拖移排序使用。
-- products / services / events / brands 在 0001/0002 已有 sort_order。
-- 預設 0；前台改以 sort_order 排序（再以 published_at / created_at 作 tiebreak）。

alter table articles add column if not exists sort_order int not null default 0;
alter table cases add column if not exists sort_order int not null default 0;

-- 既有資料給一個合理初始順序（依現有排序欄位），避免全部並列 0。
update articles a
  set sort_order = sub.rn
  from (
    select id, (row_number() over (order by published_at desc nulls last, created_at desc) - 1) as rn
    from articles
  ) sub
  where a.id = sub.id;

update cases c
  set sort_order = sub.rn
  from (
    select id, (row_number() over (order by created_at desc) - 1) as rn
    from cases
  ) sub
  where c.id = sub.id;
