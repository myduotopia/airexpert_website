-- 0018_machine_identity.sql
-- 保養卡：機台識別改為 (客戶 + 機台代號 + 機號) 三段式，唯一性作用域改為 per-customer。
-- 依賴 0011（mx_* 三層資料模型）、0012（archived_at 與機號的全域部分唯一索引）、
--      0013（客戶編號 code / 機台代號 machine_no）、0015（card_type）。
--
-- ⚠️ 本檔已於 2026-08-24 手動套用到正式 Supabase 專案（套用前已跑重複檢查，
--    兩則查詢皆回 0 列）。此檔僅為補齊 migration 歷史，不要再跑一次。

comment on column mx_machines.machine_no is '機台代號 tag：客戶內部用來指認機器的稱呼（A機／B機／1號機／A01 銅器部）。同一客戶內唯一，跨客戶會重複。';
comment on column mx_machines.serial_no  is '機號：空壓機為原廠序號（J751307001）；過濾系統卡此處放過濾器型號（100HA／AD480），會跨客戶重複。';

alter table mx_machines alter column serial_no drop not null;

alter table mx_machines add constraint mx_machines_identity_check
  check ((serial_no is not null and btrim(serial_no) <> '')
      or (machine_no is not null and btrim(machine_no) <> ''));

drop index if exists mx_machines_serial_no_key;   -- 0012 的全域唯一索引

-- 有代號的卡：代號在同一客戶內唯一
create unique index mx_machines_customer_tag_key
  on mx_machines (customer_id, lower(btrim(machine_no)))
  where archived_at is null and machine_no is not null and btrim(machine_no) <> '';

-- 沒有代號的卡：機號在同一客戶內唯一
create unique index mx_machines_customer_serial_key
  on mx_machines (customer_id, lower(btrim(serial_no)))
  where archived_at is null and serial_no is not null and btrim(serial_no) <> ''
    and (machine_no is null or btrim(machine_no) = '');

-- 跨客戶查同型號用（例：所有在用 AD480 的客戶）
create index mx_machines_serial_lookup_idx
  on mx_machines (lower(btrim(serial_no))) where serial_no is not null;
