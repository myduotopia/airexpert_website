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
--      任一為「純數量記號」（1~9、x1／×1、/、✓、○、│ 等勾記，可帶結尾句點）。
--   3. 維修 — 否則，inverter / filter_system / note 任一含「非數量的文字內容」。
--      「NA」「N/A」= 不適用（辨識 prompt 要求原樣填入），視同空白格，不算自由文字；
--      只有數字（任意位數）或勾記的格子也不算自由文字。
--   4. 皆不符 → 留 null，由人工在後台逐列補。
--
-- 侷限（刻意不追求 100% 正確，寧可留 null 也不亂猜）：
--   * 只看已辨識成文字的欄位值；OCR 對欄錯誤（值落到隔壁欄）會導致誤判。
--   * 「純數量記號」只收個位數 1~9（issue #154 規格）。卡片「時數」欄是兩位數的
--     月份序號（83、88、84…）疊在五位數讀數上，對欄偏移最常把那個兩位數推進隔壁欄；
--     真實耗材數量都是個位數，故兩位數不算耗材數量 → 留 null 由人工補，
--     而不是被靜默標成保養。同理，只有數字或勾記的格子不算 inverter / filter_system /
--     note 的「自由文字」，不會因為時數掉進來就被標成維修。
--   * 手寫變形（如「〃」「同上」未在辨識階段展開、「例」被辨識成「列」）無法回填。
--   * 一列同時做了保養與維修時，依規則只會標成「保養」（保養優先）。
--   * 回填只寫 service_type is null 的列，人工已修正過的值不會被覆蓋
--     （但人工「刻意清成 null」的列，重跑本檔時會再被回填一次）。
--   * 下方 regex 的 \s 只涵蓋 ASCII 空白；若某格只有全形空白 U+3000／NBSP，
--     SQL 會當成有內容、TS 端則當成空白。實務上不會出現，故不特別處理。
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
  -- 「純數量記號」：1~9、x1／×1，或單一/連續勾記；允許結尾句點、頓號與空白。
  -- 只收個位數，理由見上方侷限說明（時數兩位數對欄偏移）。對齊 TS QUANTITY_RE。
  qty constant text :=
    '^\s*([1-9]|[xX×]\s*[1-9]|[/／\\＼✓✔○◯〇│|∣ｌVv]+)[\s.。、,，]*$';
  -- 「只是數字或勾記」：涵蓋 qty，另收任意位數的數字（時數 83／37446 掉進隔壁欄）。
  -- 只用於維修判準的排除條件——這種格子沒有描述性文字。對齊 TS BARE_MARK_RE。
  mark constant text :=
    '^\s*(([xX×]\s*)?[0-9]+|[/／\\＼✓✔○◯〇│|∣ｌVv]+)[\s.。、,，]*$';
  -- 「NA」「N/A」= 不適用／該次未做該項 → 視同沒寫東西，不算自由文字。
  na constant text := '^\s*[Nn]\s*[./／]?\s*[Aa][\s.。、,，]*$';
  -- 只有空白或標點 = 沒寫東西（對齊 TS normalizeCell 會剝掉結尾標點的行為）。
  blank constant text := '^[\s.。、,，]*$';
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
       (coalesce(inverter, '') !~ blank
          and coalesce(inverter, '') !~ mark
          and coalesce(inverter, '') !~ na)
       or (coalesce(filter_system, '') !~ blank
          and coalesce(filter_system, '') !~ mark
          and coalesce(filter_system, '') !~ na)
       or (coalesce(note, '') !~ blank
          and coalesce(note, '') !~ mark
          and coalesce(note, '') !~ na)
     );
end $$;
