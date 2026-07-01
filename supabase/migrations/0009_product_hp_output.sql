-- 0009: 變頻空壓機「馬力數 ↔ 造氣量」對照表 (issue #91)
-- 同一機種可有多組馬力數，每組對應不同造氣量；前台以下拉選單連動顯示。
-- 形狀：[{ "hp": "10", "output": "1.094" }, ...]。其餘分類維持空陣列。
alter table products
  add column if not exists hp_output jsonb not null default '[]'::jsonb;
