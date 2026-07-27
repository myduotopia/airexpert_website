-- 0012_maintenance_soft_delete.sql
-- 保養卡「封存區」軟刪除：mx_machines 加 archived_at；機號唯一改部分索引（僅未封存者唯一）。
-- 依賴 0011。套用：Supabase Dashboard → SQL Editor 貼上執行。

alter table mx_machines add column archived_at timestamptz;

-- 機號唯一索引改為「只對未封存(archived_at is null)的卡」生效，
-- 使卡片封存後同機號仍可重新建立 / 辨識匯入。
drop index if exists mx_machines_serial_no_key;
create unique index mx_machines_serial_no_key
  on mx_machines (lower(btrim(serial_no)))
  where archived_at is null;

create index mx_machines_archived_at_idx on mx_machines (archived_at);
