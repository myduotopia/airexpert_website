-- 0014_record_service_type.sql
-- 維護紀錄新增「服務類型」欄位（例檢 inspection／保養 maintenance／維修 repair）。
-- 依賴 0011（mx_records / mx_* 的 office RLS）。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。全檔冪等，可重複執行。
--
-- ============================================================
-- 既有資料回填邏輯（best-effort，與前端
-- frontend/src/lib/admin/maintenance-service-type.ts 的 classifyServiceType 同規則）
-- 三選一互斥，依「優先順序」判定（順序即為 if / else-if）：
--   1. 例檢 — 「專用油 oil」欄含「例」（涵蓋「例.」「例行」等手寫變形）。
--   2. 保養 — 否則，四個耗材欄（oil / oil_filter / air_filter / oil_separator）
--      任一為「純數量記號」（1~99、x1／×1、/、✓、○、│ 等勾記，可帶結尾句點）。
--   3. 維修 — 否則，inverter / filter_system / note 任一含「非數量的文字內容」。
--   4. 皆不符 → 留 null，由人工在後台逐列補。
--
-- 侷限（刻意不追求 100% 正確，寧可留 null 也不亂猜）：
--   * 只看已辨識成文字的欄位值；OCR 對欄錯誤（值落到隔壁欄）會導致誤判。
--   * 手寫變形（如「〃」「同上」未在辨識階段展開、「例」被辨識成「列」）無法回填。
--   * 一列同時做了保養與維修時，依規則只會標成「保養」（保養優先）。
--   * 回填只寫 service_type is null 的列，人工已修正過的值不會被覆蓋。
-- ============================================================

-- ── 欄位 + check 約束 + 索引 ─────────────────────────────────
alter table mx_records
  add column if not exists service_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'mx_records'::regclass
      and conname = 'mx_records_service_type_check'
  ) then
    alter table mx_records
      add constraint mx_records_service_type_check
      check (service_type in ('inspection','maintenance','repair'));
  end if;
end $$;

-- 依卡片 + 類型查詢／篩選用。
create index if not exists mx_records_machine_service_type_idx
  on mx_records (machine_id, service_type);

comment on column mx_records.service_type is
  '服務類型：inspection 例檢 / maintenance 保養 / repair 維修；null = 未判定，待人工補。';

-- ── 既有資料回填 ────────────────────────────────────────────
-- 三段 update 依優先順序執行，且每段都以 service_type is null 為前提，
-- 故先命中的類別不會被後面的規則覆寫（等同 if / else-if），且重跑安全。
do $$
declare
  -- 「純數量記號」：1~99、x1／×1，或單一/連續勾記；允許結尾句點、頓號與空白。
  qty constant text :=
    '^\s*([1-9][0-9]?|[xX×]\s*[1-9][0-9]?|[/／\\＼✓✔○◯〇│|∣ｌVv]+)\s*[.。、,，]?\s*$';
begin
  -- 1. 例檢
  update mx_records
     set service_type = 'inspection'
   where service_type is null
     and coalesce(oil, '') like '%例%';

  -- 2. 保養（優先於維修）
  update mx_records
     set service_type = 'maintenance'
   where service_type is null
     and (
       coalesce(oil, '')           ~ qty
       or coalesce(oil_filter, '')    ~ qty
       or coalesce(air_filter, '')    ~ qty
       or coalesce(oil_separator, '') ~ qty
     );

  -- 3. 維修
  update mx_records
     set service_type = 'repair'
   where service_type is null
     and (
       (btrim(coalesce(inverter, ''))      <> '' and coalesce(inverter, '')      !~ qty)
       or (btrim(coalesce(filter_system, '')) <> '' and coalesce(filter_system, '') !~ qty)
       or (btrim(coalesce(note, ''))          <> '' and coalesce(note, '')          !~ qty)
     );
end $$;
