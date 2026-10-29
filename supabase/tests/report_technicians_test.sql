-- report_technicians_test.sql
-- 維護報告單多技師工時分攤與 ERP 週報 RPC（issue #271，0037）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、TEST-*）。
--
-- 涵蓋：主技師同步觸發器（新增／換人／協同升主／清除）、sr_set_report_technicians（比例、重複、無主技師、
--       作廢、權限）、作廢單技師列唯讀（任何身分，含 postgres）、已結案仍可改、草稿刪除 cascade、員工 restrict、
--       RLS（service_report 可讀寫；erp／無模組讀不到、寫不進）、erp_meeting_maintenance（只回已結案、區間、
--       欄位白名單、技師排序、權限、參數驗證）、anon 不可執行。
-- 回填與重跑由 local-db.sh 另行驗證（需在重跑 0037 前放入資料）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000027a1', 'rt-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000027a2', 'rt-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000027a3', 'rt-none@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000027a1', 'office', 'rt-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000027a2', 'erp',    'rt-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000027a3', 'admin',  'rt-none@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000027a1', 'service_report'),
  ('00000000-0000-0000-0000-0000000027a2', 'erp');

insert into employees (id, code, name, roles) values
  ('00000000-0000-0000-0000-0000000027e1', 'T01', 'TEST-師傅甲', '{technician}'),
  ('00000000-0000-0000-0000-0000000027e2', 'T02', 'TEST-師傅乙', '{technician}'),
  ('00000000-0000-0000-0000-0000000027e3', 'T03', 'TEST-師傅丙', '{technician}');

create schema rt_test;
create function rt_test.expect_error(p_sql text, p_code text)
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
-- 某張報告單的技師（姓名:比例:主），依 is_primary desc, sort_order
create function rt_test.techs(p_report uuid) returns text[] language sql stable as $$
  select coalesce(array_agg(e.name || ':' || t.share::text || ':' || case when t.is_primary then 'P' else 'C' end
                            order by t.is_primary desc, t.sort_order), '{}')
    from sr_report_technicians t join employees e on e.id = t.employee_id
   where t.report_id = p_report;
$$;
grant usage on schema rt_test to authenticated, anon;
grant execute on all functions in schema rt_test to authenticated, anon;
-- rt_test.techs 給 authenticated 用時走 RLS；employees 對 service_report 可讀。

-- ============================================================
-- 1) 函式屬性
-- ============================================================
do $$ begin
  assert (select prosecdef from pg_proc where oid = 'erp_meeting_maintenance(date,date)'::regprocedure),
    'erp_meeting_maintenance 為 security definer';
  assert not (select prosecdef from pg_proc where oid = 'sr_set_report_technicians(uuid,numeric,jsonb)'::regprocedure),
    'sr_set_report_technicians 為 security invoker（走 RLS）';
  assert (select prosecdef from pg_proc where oid = 'sr_guard_report_technician()'::regprocedure),
    'guard 為 security definer（讀父列不受 RLS 影響）';
  assert not has_function_privilege('anon', 'erp_meeting_maintenance(date,date)', 'execute'), 'anon 不可執行週報 RPC';
  assert not has_function_privilege('anon', 'sr_set_report_technicians(uuid,numeric,jsonb)', 'execute'), 'anon 不可執行設定 RPC';
  assert not has_table_privilege('anon', 'sr_report_technicians', 'select'), 'anon 無表權限';
end $$;

-- ============================================================
-- 2) service_report 使用者：新增報告單 → 觸發器自動建主技師列
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a1","role":"authenticated"}';

do $$ begin
  insert into sr_reports (id, report_no, report_date, customer_name, summary, technician, technician_id)
  values ('00000000-0000-0000-0000-0000000027b1', 'TEST-R1', '2026-10-27', 'TEST-客戶一', '排水器不排水',
          'TEST-師傅甲', '00000000-0000-0000-0000-0000000027e1');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1') = array['TEST-師傅甲:1.00:P'],
    '新增報告單：主技師 share 1';

  -- 沒有主技師的報告單：不建列
  insert into sr_reports (id, report_no, report_date, customer_name, technician)
  values ('00000000-0000-0000-0000-0000000027b2', 'TEST-R2', '2026-10-28', 'TEST-客戶二', '舊資料文字');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b2') = '{}', '無主技師 id → 無技師列';

  -- 設定協同技師：主 0.5、乙 0.5
  assert sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
           '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5}]') = 2, '回傳列數 2';
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅甲:0.50:P', 'TEST-師傅乙:0.50:C'], '主 0.5 + 協同 0.5';

  -- 重設為三人（順序依輸入）
  perform sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.34,
           '[{"employee_id":"00000000-0000-0000-0000-0000000027e3","share":0.33},
             {"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.33}]');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅甲:0.34:P', 'TEST-師傅丙:0.33:C', 'TEST-師傅乙:0.33:C'], '三人、依輸入順序';

  -- 換主技師為丙（原為協同）：丙升主、保留原主技師比例，原主技師列移除，乙保留
  update sr_reports set technician = 'TEST-師傅丙', technician_id = '00000000-0000-0000-0000-0000000027e3'
   where id = '00000000-0000-0000-0000-0000000027b1';
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅丙:0.34:P', 'TEST-師傅乙:0.33:C'], '協同升主：不重複、保留主技師比例';

  -- 只改其他欄位：技師列不動
  update sr_reports set summary = '排水器更換' where id = '00000000-0000-0000-0000-0000000027b1';
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅丙:0.34:P', 'TEST-師傅乙:0.33:C'], '未改 technician_id 不影響';

  -- 清除主技師 → 主技師列移除（協同列仍在，下一次儲存會被 RPC 擋下或清空）
  update sr_reports set technician = null, technician_id = null where id = '00000000-0000-0000-0000-0000000027b1';
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1') = array['TEST-師傅乙:0.33:C'], '清除主技師';
  perform sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', null, '[]');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1') = '{}', '無主技師＋無協同 → 全部清空';

  update sr_reports set technician = 'TEST-師傅甲', technician_id = '00000000-0000-0000-0000-0000000027e1'
   where id = '00000000-0000-0000-0000-0000000027b1';
  perform sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
           '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5}]');
end $$;

-- RPC 驗證
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 1.5, '[]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0, '[]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.333, '[]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', null, '[]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
  '[{"employee_id":"00000000-0000-0000-0000-0000000027e1","share":0.5}]')$q$, 'validation');  -- 與主技師重複
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
  '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5},{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5}]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
  '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":1.01}]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
  '[{"employee_id":null,"share":0.5}]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5,
  '[{"employee_id":"not-a-uuid","share":0.5}]')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.5, '{}')$q$, 'validation');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b2', 1,
  '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5}]')$q$, 'validation');  -- 無主技師不可有協同
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027ff', 1, '[]')$q$, 'validation');
-- DB 約束：share 範圍、同人重複
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share) values ('00000000-0000-0000-0000-0000000027b2', '00000000-0000-0000-0000-0000000027e3', 0)$q$, '23514');
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share) values ('00000000-0000-0000-0000-0000000027b2', '00000000-0000-0000-0000-0000000027e3', 1.2)$q$, '23514');
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share) values ('00000000-0000-0000-0000-0000000027b1', '00000000-0000-0000-0000-0000000027e2', 0.2)$q$, '23505');
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share, is_primary) values ('00000000-0000-0000-0000-0000000027b1', '00000000-0000-0000-0000-0000000027e3', 0.2, true)$q$, '23505');
-- 驗證失敗不留下部分寫入（同一交易內整個 RPC 回滾）
do $$ begin
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅甲:0.50:P', 'TEST-師傅乙:0.50:C'], '驗證失敗不改動既有列';
end $$;

-- ============================================================
-- 3) 狀態：已結案仍可改；作廢後任何身分皆不可改
-- ============================================================
reset role;
update sr_reports set status = 'completed', completed_at = now(), print_count = 1
 where id = '00000000-0000-0000-0000-0000000027b1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a1","role":"authenticated"}';
do $$ begin
  perform sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 0.6,
           '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.4}]');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b1')
         = array['TEST-師傅甲:0.60:P', 'TEST-師傅乙:0.40:C'], '已結案仍可修改技師（既有規則）';
end $$;

-- 作廢單（另一張，維持 r1 給週報用）：作廢前以 service_report 使用者設好兩位技師
reset role;
insert into sr_reports (id, report_no, report_date, customer_name, technician, technician_id)
values ('00000000-0000-0000-0000-0000000027b3', 'TEST-R3', '2026-10-27', 'TEST-客戶三', 'TEST-師傅甲',
        '00000000-0000-0000-0000-0000000027e1');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a1","role":"authenticated"}';
select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b3', 0.5,
  '[{"employee_id":"00000000-0000-0000-0000-0000000027e2","share":0.5}]');
update sr_reports set status = 'voided', voided_at = now(), void_reason = 'TEST 作廢'
 where id = '00000000-0000-0000-0000-0000000027b3';

select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b3', 1, '[]')$q$, 'voided');
select rt_test.expect_error($q$delete from sr_report_technicians where report_id = '00000000-0000-0000-0000-0000000027b3'$q$, 'voided');
select rt_test.expect_error($q$update sr_report_technicians set share = 1 where report_id = '00000000-0000-0000-0000-0000000027b3'$q$, 'voided');
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share) values ('00000000-0000-0000-0000-0000000027b3', '00000000-0000-0000-0000-0000000027e3', 0.2)$q$, 'voided');
select rt_test.expect_error($q$update sr_reports set technician_id = '00000000-0000-0000-0000-0000000027e3' where id = '00000000-0000-0000-0000-0000000027b3'$q$, 'voided');

-- 受信任身分（postgres）同樣不可改作廢單的技師列
reset role;
select rt_test.expect_error($q$update sr_report_technicians set share = 1 where report_id = '00000000-0000-0000-0000-0000000027b3'$q$, 'voided');
select rt_test.expect_error($q$delete from sr_report_technicians where report_id = '00000000-0000-0000-0000-0000000027b3'$q$, 'voided');
-- 不可把技師列搬到別張報告單
select rt_test.expect_error($q$update sr_report_technicians set report_id = '00000000-0000-0000-0000-0000000027b2' where report_id = '00000000-0000-0000-0000-0000000027b1' and not is_primary$q$, 'validation');
-- 被引用的員工不可刪（restrict），只能停用
select rt_test.expect_error($q$delete from employees where id = '00000000-0000-0000-0000-0000000027e2'$q$, '23503');
do $$ begin
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b3')
         = array['TEST-師傅甲:0.50:P', 'TEST-師傅乙:0.50:C'], '作廢單技師列維持作廢前狀態';
end $$;

-- ============================================================
-- 4) 草稿刪除 → cascade；作廢單以維運身分刪除 → cascade 亦放行（父列已不存在）
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a1","role":"authenticated"}';
do $$ begin
  insert into sr_reports (id, report_no, report_date, technician, technician_id)
  values ('00000000-0000-0000-0000-0000000027b4', 'TEST-R4', '2026-10-27', 'TEST-師傅乙',
          '00000000-0000-0000-0000-0000000027e2');
  assert rt_test.techs('00000000-0000-0000-0000-0000000027b4') = array['TEST-師傅乙:1.00:P'], '草稿主技師';
  delete from sr_reports where id = '00000000-0000-0000-0000-0000000027b4';
  assert not exists (select 1 from sr_report_technicians where report_id = '00000000-0000-0000-0000-0000000027b4'),
    '草稿刪除 cascade 技師列';
end $$;

-- ============================================================
-- 5) RLS：erp／無模組使用者讀不到、寫不進技師表
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a2","role":"authenticated"}';
do $$ begin
  assert has_module('erp') and not has_module('service_report'), 'erp-only 使用者';
  assert (select count(*) from sr_report_technicians) = 0, 'erp 直接查技師表 → 0 列（只能經由 RPC）';
  assert (select count(*) from sr_reports) = 0, 'erp 讀不到 sr_reports（決策 1）';
end $$;
select rt_test.expect_error($q$insert into sr_report_technicians (report_id, employee_id, share) values ('00000000-0000-0000-0000-0000000027b2', '00000000-0000-0000-0000-0000000027e3', 1)$q$, '42501');
select rt_test.expect_error($q$select sr_set_report_technicians('00000000-0000-0000-0000-0000000027b1', 1, '[]')$q$, 'forbidden');

-- ============================================================
-- 6) erp_meeting_maintenance：只回已結案、區間內；技師依主技師優先
-- ============================================================
reset role;
-- r2：已結案、無技師 id（只有文字）；r5：已列印未結案（不列）；r6：區間外已結案（不列）
update sr_reports set status = 'completed', completed_at = now(), print_count = 1,
       results = '{"compressor":{"run_hours":"2209","temperature":"84"}}', model = 'TEST-M1',
       service_items = '{routine}'
 where id = '00000000-0000-0000-0000-0000000027b2';
insert into sr_reports (id, report_no, report_date, status, print_count, customer_name, technician, technician_id) values
  ('00000000-0000-0000-0000-0000000027b5', 'TEST-R5', '2026-10-27', 'printed', 1, 'TEST-客戶五', 'TEST-師傅甲',
   '00000000-0000-0000-0000-0000000027e1'),
  ('00000000-0000-0000-0000-0000000027b6', 'TEST-R6', '2026-11-05', 'completed', 1, 'TEST-客戶六', 'TEST-師傅甲',
   '00000000-0000-0000-0000-0000000027e1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a2","role":"authenticated"}';
do $$
declare
  v_ids text[];
  v_r1 record;
  v_r2 record;
  v_cols text[];
begin
  select array_agg(report_no order by report_date, report_no) into v_ids
    from erp_meeting_maintenance('2026-10-26', '2026-11-01');
  assert v_ids = array['TEST-R1', 'TEST-R2'],
    format('只列已結案、未作廢、區間內（得到 %s）', v_ids);

  select * into v_r1 from erp_meeting_maintenance('2026-10-26', '2026-11-01') where report_no = 'TEST-R1';
  assert v_r1.customer_name = 'TEST-客戶一' and v_r1.summary = '排水器更換', '客戶與損壞狀況';
  assert jsonb_array_length(v_r1.technicians) = 2, '兩位技師';
  assert v_r1.technicians -> 0 ->> 'name' = 'TEST-師傅甲'
     and (v_r1.technicians -> 0 ->> 'share')::numeric = 0.6
     and (v_r1.technicians -> 0 ->> 'is_primary')::boolean, '主技師排第一';
  assert v_r1.technicians -> 1 ->> 'code' = 'T02'
     and (v_r1.technicians -> 1 ->> 'share')::numeric = 0.4, '協同技師含代號與比例';

  select * into v_r2 from erp_meeting_maintenance('2026-10-26', '2026-11-01') where report_no = 'TEST-R2';
  assert v_r2.technicians = '[]'::jsonb and v_r2.technician = '舊資料文字', '無技師列 → 空陣列＋文字快照';
  assert v_r2.results -> 'compressor' ->> 'run_hours' = '2209' and v_r2.model = 'TEST-M1', '回填結果與型號';

  -- 欄位白名單：不含電話／地址／統編／聯絡人／內部備註
  select array_agg(a.attname::text) into v_cols
    from pg_proc p, unnest(p.proallargtypes, p.proargnames, p.proargmodes) as a(t, attname, mode)
   where p.oid = 'erp_meeting_maintenance(date,date)'::regprocedure and a.mode = 't';
  assert not (v_cols && array['phone', 'address', 'tax_id', 'contact', 'note', 'customer_signer']),
    format('週報 RPC 不回傳敏感欄位（%s）', v_cols);

  assert (select count(*) from erp_meeting_maintenance('2026-11-01', '2026-11-30')) = 1, '下個月區間只有 R6';
end $$;
select rt_test.expect_error($q$select * from erp_meeting_maintenance('2026-11-01', '2026-10-01')$q$, 'validation');
select rt_test.expect_error($q$select * from erp_meeting_maintenance('2025-01-01', '2026-10-01')$q$, 'validation');
select rt_test.expect_error($q$select * from erp_meeting_maintenance(null, '2026-10-01')$q$, 'validation');

-- 只有 service_report（無 erp）→ forbidden；無任何模組 → forbidden
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a1","role":"authenticated"}';
select rt_test.expect_error($q$select * from erp_meeting_maintenance('2026-10-26', '2026-11-01')$q$, 'forbidden');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000027a3","role":"authenticated"}';
select rt_test.expect_error($q$select * from erp_meeting_maintenance('2026-10-26', '2026-11-01')$q$, 'forbidden');
do $$ begin
  assert (select count(*) from sr_report_technicians) = 0, '無模組讀不到技師表';
end $$;
set local role anon;
select rt_test.expect_error($q$select * from erp_meeting_maintenance('2026-10-26', '2026-11-01')$q$, '42501');
reset role;

-- 維運身分刪除作廢單 → cascade 技師列放行（父列已刪除）
delete from sr_reports where id = '00000000-0000-0000-0000-0000000027b3';
do $$ begin
  assert not exists (select 1 from sr_report_technicians where report_id = '00000000-0000-0000-0000-0000000027b3'),
    '作廢單刪除時 cascade 不被 guard 擋下';
end $$;

\o
select 'report_technicians_test: ALL PASSED' as result;
rollback;
