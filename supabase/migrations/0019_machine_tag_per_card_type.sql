-- 0019_machine_tag_per_card_type.sql
-- 機台代號唯一性加入「卡別」維度：(客戶, 卡別, 代號)。依賴 0018。
--
-- 為什麼：0018 的 mx_machines_customer_tag_key 是 (客戶, 代號)，不分卡別，
-- 所以同一客戶的乾燥機卡不能沿用空壓機的「A機」。但現場的乾燥機就擺在
-- A機 旁邊，紙卡上往往也標成「A機」——強迫員工替乾燥機另取代號，
-- 違反他們既有的標記習慣。
--
-- 這是「放寬」不是「收緊」：任何在 (客戶, 代號) 上唯一的資料，在
-- (客戶, 卡別, 代號) 上必然也唯一。故不需事前重複檢查，既有列不可能違反。
-- 套用：Supabase Dashboard → SQL Editor 貼上執行。

drop index if exists mx_machines_customer_tag_key;

create unique index mx_machines_customer_tag_key
  on mx_machines (customer_id, card_type, lower(btrim(machine_no)))
  where archived_at is null
    and machine_no is not null and btrim(machine_no) <> '';

-- 同步：無代號的卡以機號辨識，也一併納入卡別，維持「識別範圍 = (客戶, 卡別)」
-- 的一致模型。同樣是放寬，同樣零風險。
drop index if exists mx_machines_customer_serial_key;

create unique index mx_machines_customer_serial_key
  on mx_machines (customer_id, card_type, lower(btrim(serial_no)))
  where archived_at is null
    and serial_no is not null and btrim(serial_no) <> ''
    and (machine_no is null or btrim(machine_no) = '');
