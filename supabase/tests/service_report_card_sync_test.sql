-- service_report_card_sync_test.sql
-- 維護報告單結案同步保養卡（issue #280，0041）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、TEST-*）。
--
-- 涵蓋：結案 → 1 列（欄位對應與前端 card-sync.ts 同一組範例）；只有 service_report（無 maintenance）也能結案，
--       但不能直接寫 mx_records；重新開啟 → 列保留、已列印時修改不同步；再結案 → 仍 1 列且為同一列、內容更新；
--       已結案再編輯 → 更新；作廢 → 移除；machine_id 為 null → 不寫；過濾卡依欄名寫 values；
--       無模組呼叫 RPC → forbidden；anon／authenticated 不可直接呼叫內部函式；
--       受信任身分（service_role、刪機台的 FK set null）不受模組檢查影響。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000041a1', 'cs-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000041a2', 'cs-none@example.invalid');
-- 兩者皆非 office（is_office() = false）、無 maintenance 模組；只有 a1 有 service_report。
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000041a1', 'erp', 'cs-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000041a2', 'erp', 'cs-none@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000041a1', 'service_report');

insert into mx_customers (id, name) values
  ('00000000-0000-0000-0000-0000000041c1', 'TEST-客戶A');
insert into mx_machines (id, customer_id, card_type, serial_no, machine_no) values
  ('00000000-0000-0000-0000-0000000041d1', '00000000-0000-0000-0000-0000000041c1', 'compressor', 'TEST-CS-001', 'A機'),
  ('00000000-0000-0000-0000-0000000041d2', '00000000-0000-0000-0000-0000000041c1', 'filter',     'TEST-CS-F01', 'A機'),
  ('00000000-0000-0000-0000-0000000041d3', '00000000-0000-0000-0000-0000000041c1', 'compressor', 'TEST-CS-003', 'C機');
insert into mx_machine_columns (id, machine_id, label, sort_order) values
  ('00000000-0000-0000-0000-0000000041e1', '00000000-0000-0000-0000-0000000041d2', 'EA350-Q 濾蕊', 0),
  ('00000000-0000-0000-0000-0000000041e2', '00000000-0000-0000-0000-0000000041d2', '自動排水器', 1);

-- 已列印（待回填／結案）的報告單；R1 料件與前端 test/service-report-card-sync.test.ts 的範例相同。
insert into sr_reports (id, report_no, report_date, status, print_count, machine_id, customer_id,
                        service_items, summary, results, parts, technician) values
  ('00000000-0000-0000-0000-0000000041b1', 'TEST-X41-1', '2026-10-30', 'printed', 1,
   '00000000-0000-0000-0000-0000000041d1', '00000000-0000-0000-0000-0000000041c1',
   '{new_trial}', '新機試車OK',
   '{"compressor":{"run_hours":" 15 ","set_pressure":"7.5-8","temperature":"81","current":"27","frequency":"95","fan":"normal"}}',
   '[{"no":1,"name":"螺旋專用油","qty":"1桶"},
     {"no":2,"name":"機油濾清器","qty":"1"},
     {"no":3,"name":"空氣濾清器(外)","qty":"1"},
     {"no":4,"name":"空氣濾清器(內)","qty":"1"},
     {"no":5,"name":"油氣分離器","qty":""},
     {"no":6,"name":"自動排水器","qty":"1"},
     {"no":7,"name":"過濾器濾蕊","qty":"2"},
     {"no":8,"name":"油 鏡","qty":"1"},
     {"no":9,"name":"","qty":"3"},
     {"no":10,"name":"維護及保養工資","qty":"1"}]',
   'TEST-師傅甲'),
  ('00000000-0000-0000-0000-0000000041b2', 'TEST-X41-2', '2026-10-30', 'printed', 1,
   null, '00000000-0000-0000-0000-0000000041c1', '{routine}', '沒有機台', '{}', '[]', 'TEST-師傅甲'),
  ('00000000-0000-0000-0000-0000000041b3', 'TEST-X41-3', '2026-10-29', 'printed', 1,
   '00000000-0000-0000-0000-0000000041d2', '00000000-0000-0000-0000-0000000041c1',
   '{routine,repair}', null,
   '{"compressor":{"run_hours":"999"},"dryer":{"total_hours":"1200"}}',
   '[{"no":1,"name":"ea350-q濾蕊","qty":"1"},{"no":2,"name":"自動排水器","qty":"1"},{"no":3,"name":"散熱馬達","qty":"1"}]',
   'TEST-師傅乙'),
  ('00000000-0000-0000-0000-0000000041b4', 'TEST-X41-4', '2026-10-28', 'printed', 1,
   '00000000-0000-0000-0000-0000000041d3', '00000000-0000-0000-0000-0000000041c1',
   '{other}', null, '{"compressor":{"run_hours":"500"}}', '[]', null);

create schema cs_test;
create function cs_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_code or sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, sqlerrm;
      return;
    end if;
    raise exception '預期 % 但得到 % (%): sql=%', p_code, sqlerrm, sqlstate, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;
grant usage on schema cs_test to authenticated, anon, service_role;
grant execute on all functions in schema cs_test to authenticated, anon, service_role;

-- ============================================================
-- 1) 函式屬性與權限
-- ============================================================
do $$ begin
  assert (select prosecdef from pg_proc where oid = 'sr_sync_card_record(uuid)'::regprocedure),
    'sr_sync_card_record 為 security definer';
  assert (select prosecdef from pg_proc where oid = 'sr_card_sync_apply(uuid)'::regprocedure),
    'sr_card_sync_apply 為 security definer';
  assert (select proconfig::text like '%search_path=public, pg_temp%' from pg_proc
           where oid = 'sr_sync_card_record(uuid)'::regprocedure), 'RPC 設定 search_path';
  assert (select proconfig::text like '%search_path=public, pg_temp%' from pg_proc
           where oid = 'sr_card_sync_apply(uuid)'::regprocedure), '內部函式設定 search_path';
  assert has_function_privilege('authenticated', 'sr_sync_card_record(uuid)', 'execute'), 'authenticated 可呼叫 RPC';
  assert not has_function_privilege('anon', 'sr_sync_card_record(uuid)', 'execute'), 'anon 不可呼叫 RPC';
  assert not has_function_privilege('authenticated', 'sr_card_sync_apply(uuid)', 'execute'), 'authenticated 不可直接呼叫內部函式';
  assert not has_function_privilege('anon', 'sr_card_sync_apply(uuid)', 'execute'), 'anon 不可直接呼叫內部函式';
  assert (select count(*) from mx_records) = 0, '起始沒有保養紀錄';
end $$;

-- ============================================================
-- 2) 只有 service_report 的帳號結案 → 寫入 1 列（不需要 maintenance 模組）
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';

do $$ begin
  assert not mx_has_access(), '測試帳號沒有保養卡寫入權限';
end $$;
-- 直接寫保養卡會被 RLS 擋下
select cs_test.expect_error($q$insert into mx_records (machine_id, note) values ('00000000-0000-0000-0000-0000000041d1', 'x')$q$, '42501');

update sr_reports set status = 'completed', completed_at = now()
 where id = '00000000-0000-0000-0000-0000000041b1';
reset role;

do $$
declare m mx_records%rowtype;
begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 1,
    '結案 → 1 列';
  select * into m from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1';
  assert m.machine_id = '00000000-0000-0000-0000-0000000041d1', '寫到報告單的機台';
  assert m.service_date = '2026-10-30', '日期 = 維護日期';
  assert m.hours = '15', '時數 = 運轉時數（去空白）';
  assert m.technician = 'TEST-師傅甲', '維護人員';
  assert m.service_type = 'inspection', '新機試車 → 例檢';
  assert m.oil = '1桶', '螺旋專用油 → 專用油';
  assert m.oil_filter = '1', '機油濾清器';
  assert m.air_filter = '空氣濾清器(外)×1、空氣濾清器(內)×1', '同一格多個料件 → 品名×數量';
  assert m.oil_separator is null, '數量空白不寫';
  assert m.filter_system = '2', '過濾器濾蕊 → 過濾系統';
  assert m.inverter is null, '沒有變頻器料件';
  assert m."values" is null, '空壓機卡不寫 values';
  assert m.note = E'新機試車OK\n其他料件：自動排水器×1、油 鏡×1\n維護報告單 TEST-X41-1', '備註 = 記要 + 其他料件 + 單號：' || coalesce(m.note, 'null');
  assert m.source = 'manual', 'source 沿用 manual';
end $$;

-- ============================================================
-- 3) 重新開啟 → 列保留；已列印時修改不同步；再結案 → 同一列更新
-- ============================================================
create temp table cs_first as
  select id from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1';
grant select on cs_first to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';
update sr_reports set status = 'printed', completed_at = null
 where id = '00000000-0000-0000-0000-0000000041b1';
update sr_reports set results = '{"compressor":{"run_hours":"16"}}', service_items = '{periodic,repair}'
 where id = '00000000-0000-0000-0000-0000000041b1';
reset role;

do $$ begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 1,
    '重新開啟 → 列保留';
  assert (select hours from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = '15',
    '已列印（未結案）時修改不同步';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';
update sr_reports set status = 'completed', completed_at = now()
 where id = '00000000-0000-0000-0000-0000000041b1';
reset role;

do $$ begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 1,
    '重新開啟後再結案 → 仍 1 列';
  assert (select id from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1')
         = (select id from cs_first), '更新同一列（id 不變）';
  assert (select hours from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = '16',
    '時數更新';
  assert (select service_type from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 'maintenance',
    '定期保養優先 → 保養';
end $$;

-- 已結案再編輯 → 同步更新；手動再呼叫 RPC 也不會多一列
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';
update sr_reports set summary = '已更換濾清器', report_date = '2026-10-31', service_items = '{repair}'
 where id = '00000000-0000-0000-0000-0000000041b1';
do $$ begin
  assert sr_sync_card_record('00000000-0000-0000-0000-0000000041b1') = 'synced', 'RPC 回 synced';
end $$;
reset role;

do $$ begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 1,
    '再編輯／重複對帳 → 仍 1 列';
  assert (select service_date from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = '2026-10-31',
    '已結案再編輯 → 日期更新';
  assert (select note from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1')
         like E'已更換濾清器\n%', '已結案再編輯 → 備註更新';
  assert (select service_type from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 'repair',
    '只有查修 → 維修';
end $$;

-- ============================================================
-- 4) 作廢 → 同步列移除
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';
update sr_reports set status = 'voided', voided_at = now(), void_reason = 'TEST 作廢'
 where id = '00000000-0000-0000-0000-0000000041b1';
reset role;

do $$ begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b1') = 0,
    '作廢 → 同步列移除';
  assert (select count(*) from mx_records) = 0, '沒有殘留列';
end $$;

-- ============================================================
-- 5) machine_id 為 null → 不寫；過濾卡依欄名寫 values；只有「其他」→ 服務類型 null
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a1","role":"authenticated"}';
update sr_reports set status = 'completed', completed_at = now()
 where id in ('00000000-0000-0000-0000-0000000041b2',
              '00000000-0000-0000-0000-0000000041b3',
              '00000000-0000-0000-0000-0000000041b4');
reset role;

do $$
declare m mx_records%rowtype;
begin
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b2') = 0,
    'machine_id 為 null → 不寫保養卡';
  assert (select status from sr_reports where id = '00000000-0000-0000-0000-0000000041b2') = 'completed',
    '沒有機台仍可結案';

  select * into m from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b3';
  assert m.machine_id = '00000000-0000-0000-0000-0000000041d2', '過濾卡';
  assert m.hours = '1200', '過濾卡時數 = 乾燥機總時數';
  assert m.service_type = 'repair', '例檢＋查修 → 維修';
  assert m."values" = jsonb_build_object(
           '00000000-0000-0000-0000-0000000041e1', '1',
           '00000000-0000-0000-0000-0000000041e2', '1'), '依欄名（去空白、不分大小寫）寫 values：' || m."values"::text;
  assert m.oil is null and m.filter_system is null, '過濾卡不寫空壓機欄位';
  assert m.note = E'其他料件：散熱馬達×1\n維護報告單 TEST-X41-3', '過濾卡沒有對應欄位的料件記入備註';

  select * into m from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b4';
  assert m.service_type is null, '只有「其他」→ 服務類型待人工判定';
  assert m.technician is null, '沒有維護人員';
  assert m.hours = '500', '時數';
end $$;

-- ============================================================
-- 6) 無模組的呼叫者被拒；RLS 也看不到報告單
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000041a2","role":"authenticated"}';
select cs_test.expect_error($q$select sr_sync_card_record('00000000-0000-0000-0000-0000000041b3')$q$, 'forbidden');
update sr_reports set status = 'voided', voided_at = now(), void_reason = 'x'
 where id = '00000000-0000-0000-0000-0000000041b3';
reset role;

set local role anon;
select cs_test.expect_error($q$select sr_sync_card_record('00000000-0000-0000-0000-0000000041b3')$q$, '42501');
select cs_test.expect_error($q$select sr_card_sync_apply('00000000-0000-0000-0000-0000000041b3')$q$, '42501');
reset role;

do $$ begin
  assert (select status from sr_reports where id = '00000000-0000-0000-0000-0000000041b3') = 'completed',
    '無模組帳號改不到報告單';
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b3') = 1,
    '無模組帳號的呼叫沒有動到保養卡';
end $$;

-- ============================================================
-- 7) 受信任身分：service_role 編輯已結案單 → 同步（不檢查模組）；刪機台（FK set null）不報錯
-- ============================================================
set local role service_role;
update sr_reports set summary = 'TEST 維運修正'
 where id = '00000000-0000-0000-0000-0000000041b4';
reset role;

do $$ begin
  assert (select note from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b4')
         = E'TEST 維運修正\n維護報告單 TEST-X41-4', 'service_role 編輯 → 同步';
end $$;

delete from mx_machines where id = '00000000-0000-0000-0000-0000000041d3';

do $$ begin
  assert (select machine_id from sr_reports where id = '00000000-0000-0000-0000-0000000041b4') is null,
    '刪機台 → 報告單 machine_id set null';
  assert (select count(*) from mx_records where source_service_report_id = '00000000-0000-0000-0000-0000000041b4') = 0,
    '刪機台 → 同步列跟著卡片刪除';
end $$;

-- 刪除已結案報告單（維運）→ 保養卡列保留為一般紀錄（on delete set null）
delete from sr_reports where id = '00000000-0000-0000-0000-0000000041b3';
do $$ begin
  assert (select count(*) from mx_records where machine_id = '00000000-0000-0000-0000-0000000041d2'
            and source_service_report_id is null) = 1, '報告單刪除 → 保養卡列保留';
end $$;

\o
select 'service_report_card_sync_test: ALL PASSED' as result;
rollback;
