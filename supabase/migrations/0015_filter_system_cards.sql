-- 0015_filter_system_cards.sql
-- 保養卡：新增「過濾系統（乾燥機）保養紀錄卡」＝ 卡別 + 每卡動態耗材欄位 + 以 jsonb 存值。
-- 依賴 0011（is_office() / mx_* 三層資料模型 + fail-closed RLS）、
--      0012（archived_at 與機號部分唯一索引）、0013（客戶編號 code / 機台編號 machine_no）。
-- 與 0014（mx_records.service_type）互不相干，兩者可任意先後套用。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

-- ============================================================
-- 1) 卡別
--    compressor = 空壓機保養紀錄卡（既有固定 9 欄）
--    filter     = 乾燥機（過濾系統）保養紀錄卡（每張卡自訂耗材欄）
--    既有資料一律落在預設值 compressor，行為完全不變。
-- ============================================================
alter table mx_machines
  add column card_type text not null default 'compressor'
    check (card_type in ('compressor','filter'));

create index mx_machines_card_type_idx on mx_machines (card_type);

-- 過濾卡表頭的兩塊規格清單（多行純文字，顯示用原文，不做結構化）：
--   filter_spec ＝ 左欄「過濾器」型號清單，例：EA350-Q*1只 / EA350-S*1只 / EA350-P*1只
--   drain_spec  ＝ 右欄，上為排水器規格、下為乾燥機的馬達 + 葉片規格
alter table mx_machines add column filter_spec text;
alter table mx_machines add column drain_spec  text;

-- ============================================================
-- 2) 過濾卡的動態耗材欄定義。一張卡多列，依 sort_order 由左到右排。
--    欄位名稱與數量因卡而異（來源：過濾系統保養紀錄卡.xlsx 三個分頁欄位皆不同），
--    故不能沿用 mx_records 的固定欄位。
-- ============================================================
create table mx_machine_columns (
  id          uuid primary key default gen_random_uuid(),
  machine_id  uuid not null references mx_machines(id) on delete cascade,
  label       text not null,        -- 例：'EA350-Q 濾蕊'
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index mx_machine_columns_machine_idx
  on mx_machine_columns (machine_id, sort_order);

-- ============================================================
-- 3) 過濾卡的紀錄值：以 column_id → 值 的 jsonb 存放，例 {"<uuid>":"1只"}。
--    service_date / technician / note / service_type 兩種卡共用既有欄位。
--    注意：values 是 SQL 保留字，DDL 必須加雙引號；
--          PostgREST / supabase-js 端仍以 values 稱呼，無需特別處理。
-- ============================================================
alter table mx_records add column "values" jsonb;

-- ============================================================
-- 4) RLS：比照 0011，mx_machine_columns 僅 is_office() 可讀寫。
--    0011 為 fail-closed 設計（沒有 policy = 全部擋掉），
--    少了這段整個過濾卡功能會「不報錯但永遠讀不到欄位」。
-- ============================================================
alter table mx_machine_columns enable row level security;

create policy "office all mx_machine_columns" on mx_machine_columns
  for all to authenticated
  using (is_office())
  with check (is_office());
