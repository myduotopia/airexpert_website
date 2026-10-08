-- employees_test.sql
-- 員工主檔（issue #223，0027）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。
--
-- 涵蓋：姓名正規化函式、回填（建員工＋回填外鍵、可重跑不重複、作廢報告單略過、多人／佔位值不建）、
--       RLS（erp-only、service_report-only 可讀寫；無模組的 office／admin、anon 不可）、
--       約束（姓名／代號唯一、角色）、外鍵 on delete restrict、過帳／作廢 RPC 保留 sales_rep_id、
--       已過帳單據與作廢報告單的外鍵不可由用戶端變更、回填不改動 updated_at。
-- 模擬方式：set local role authenticated + request.jwt.claims（sub = 測試使用者 id）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 0) 測試環境（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'erp-only@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f2', 'sr-only@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f3', 'office-nomodule@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f4', 'admin-nomodule@airexpert.com.tw');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'erp',    'erp-only@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f2', 'erp',    'sr-only@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f3', 'office', 'office-nomodule@airexpert.com.tw'),
  ('00000000-0000-0000-0000-0000000000f4', 'admin',  'admin-nomodule@airexpert.com.tw');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000000f1', 'erp'),
  ('00000000-0000-0000-0000-0000000000f2', 'service_report');

create schema emp_test;

create function emp_test.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm = p_code or sqlstate = p_code then
      raise notice 'ok  [%] %', p_code, coalesce(nullif(v_detail, ''), sqlerrm);
      return;
    end if;
    raise exception '預期 % 但得到 % (%): % / sql=%', p_code, sqlerrm, sqlstate, v_detail, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_code, p_sql;
end $$;

create function emp_test.emp(p_name text) returns uuid language sql as $$
  select id from employees where employee_name_key(name) = employee_name_key(p_name);
$$;

grant usage on schema emp_test to authenticated, anon, service_role;
grant execute on all functions in schema emp_test to authenticated, anon, service_role;

-- ============================================================
-- 1) 姓名正規化函式
-- ============================================================
do $$ begin
  assert employee_clean_name('  王　 小明  ') = '王 小明', '全形／連續空白併為一個、去頭尾';
  assert employee_name_key('  AMY　 Wu ') = 'amy wu', 'key 再轉小寫';
  assert employee_name_key(null) = '', 'null → 空字串';
  raise notice 'ok  姓名正規化';
end $$;

-- ============================================================
-- 2) 回填
-- ============================================================
insert into mx_customers (id, name, sales_rep) values
  ('00000000-0000-0000-0000-00000000c701', '甲客戶', '王小明'),
  ('00000000-0000-0000-0000-00000000c702', '乙客戶', ' 王小明 '),      -- 同人：前後空白
  ('00000000-0000-0000-0000-00000000c703', '丙客戶', 'Amy Wu'),
  ('00000000-0000-0000-0000-00000000c704', '丁客戶', '張三、李四'),    -- 多人：不建、不關聯
  ('00000000-0000-0000-0000-00000000c705', '戊客戶', '-'),              -- 佔位：不建
  ('00000000-0000-0000-0000-00000000c706', '己客戶', null);

-- updated_at 一律設為過去時間：驗證回填不改動「最後更新」。
insert into erp_documents (id, doc_type, status, doc_no, customer_id, sales_rep, void_reason, updated_at) values
  ('00000000-0000-0000-0000-00000000d701', 'Q', 'draft',  null,          '00000000-0000-0000-0000-00000000c701', 'amy  wu', null,   '2020-01-01 00:00:00+00'),   -- 同 Amy Wu
  ('00000000-0000-0000-0000-00000000d702', 'Q', 'posted', 'QT11510901',  '00000000-0000-0000-0000-00000000c701', '王小明',  null,   '2020-01-01 00:00:00+00'),
  ('00000000-0000-0000-0000-00000000d703', 'Q', 'voided', 'QT11510902',  '00000000-0000-0000-0000-00000000c701', '王小明',  '測試', '2020-01-01 00:00:00+00'), -- 作廢：仍可回填 id
  ('00000000-0000-0000-0000-00000000d704', 'Q', 'voided', 'QT11510903',  '00000000-0000-0000-0000-00000000c701', '只在作廢單', '測試', '2020-01-01 00:00:00+00'); -- 只在作廢單：不建

insert into sr_reports (id, report_no, status, technician, void_reason, updated_at) values
  ('00000000-0000-0000-0000-00000000e701', 'X11510901', 'draft',     '李師傅', null,   '2020-01-01 00:00:00+00'),
  ('00000000-0000-0000-0000-00000000e702', 'X11510902', 'printed',   '王小明', null,   '2020-01-01 00:00:00+00'),   -- 王小明兼師傅
  ('00000000-0000-0000-0000-00000000e703', 'X11510903', 'voided',    '李師傅', '測試', '2020-01-01 00:00:00+00'), -- 作廢報告單：不回填
  ('00000000-0000-0000-0000-00000000e704', 'X11510904', 'voided',    '陳大華', '測試', '2020-01-01 00:00:00+00'), -- 只在作廢報告單：不建
  ('00000000-0000-0000-0000-00000000e705', 'X11510905', 'completed', '林一／林二', null, '2020-01-01 00:00:00+00');

do $$
declare v jsonb;
begin
  v := employees_backfill();
  assert (v->>'employees_created')::int = 3, format('應建 3 位員工（王小明、Amy Wu、李師傅），實際 %s', v);
  assert (v->>'customers_linked')::int = 3, format('客戶回填 3 筆，實際 %s', v);
  assert (v->>'documents_linked')::int = 3, format('單據回填 3 筆（含作廢單），實際 %s', v);
  assert (v->>'reports_linked')::int = 2, format('報告單回填 2 筆（不含作廢），實際 %s', v);

  assert (select count(*) from employees) = 3, '共 3 位員工';
  assert (select roles from employees where id = emp_test.emp('王小明')) = array['sales','technician'],
    '王小明：業務 + 師傅';
  assert (select roles from employees where id = emp_test.emp('李師傅')) = array['technician'], '李師傅：師傅';
  assert (select roles from employees where id = emp_test.emp('amy wu')) = array['sales'], 'Amy Wu：業務';
  assert (select name from employees where id = emp_test.emp('王小明')) = '王小明', '姓名為正規化後的寫法';
  assert (select active from employees where id = emp_test.emp('王小明')), '回填員工預設在職';
  assert emp_test.emp('只在作廢單') is null and emp_test.emp('陳大華') is null, '只出現在作廢單據不建員工';
  assert emp_test.emp('張三、李四') is null and emp_test.emp('-') is null, '多人與佔位值不建員工';

  assert (select sales_rep_id from mx_customers where id = '00000000-0000-0000-0000-00000000c702')
         = emp_test.emp('王小明'), '前後空白的客戶業務也對到王小明';
  assert (select sales_rep from mx_customers where id = '00000000-0000-0000-0000-00000000c702') = ' 王小明 ',
    '文字快照不變';
  assert (select sales_rep_id from mx_customers where id = '00000000-0000-0000-0000-00000000c704') is null,
    '多人文字不關聯';
  assert (select sales_rep_id from erp_documents where id = '00000000-0000-0000-0000-00000000d701')
         = emp_test.emp('Amy Wu'), '大小寫／空白不同仍對到同一人';
  assert (select sales_rep_id from erp_documents where id = '00000000-0000-0000-0000-00000000d703')
         = emp_test.emp('王小明'), '作廢 ERP 單據也回填';
  assert (select status from erp_documents where id = '00000000-0000-0000-0000-00000000d702') = 'posted',
    '回填不改單據狀態';
  assert (select technician_id from sr_reports where id = '00000000-0000-0000-0000-00000000e702')
         = emp_test.emp('王小明'), '報告單回填';
  assert (select technician_id from sr_reports where id = '00000000-0000-0000-0000-00000000e703') is null,
    '作廢報告單不回填';

  -- 回填不改動「最後更新」（updated_at 觸發器於回填期間暫停），回填後觸發器恢復
  assert (select updated_at from erp_documents where id = '00000000-0000-0000-0000-00000000d702')
         = '2020-01-01 00:00:00+00', '回填不改已過帳單據的 updated_at';
  assert (select updated_at from sr_reports where id = '00000000-0000-0000-0000-00000000e702')
         = '2020-01-01 00:00:00+00', '回填不改報告單的 updated_at（詳情頁「最後更新」）';
  assert not exists (
    select 1 from erp_documents where updated_at <> '2020-01-01 00:00:00+00'
  ) and not exists (
    select 1 from sr_reports where updated_at <> '2020-01-01 00:00:00+00'
  ), '所有單據／報告單的 updated_at 皆不變';
  assert (select tgenabled from pg_trigger where tgname = 'erp_documents_updated_at') = 'O'
     and (select tgenabled from pg_trigger where tgname = 'sr_reports_updated_at') = 'O',
    '回填後 updated_at 觸發器已恢復';

  -- 重跑：不重複建立、不重複更新
  v := employees_backfill();
  assert v = '{"employees_created":0,"customers_linked":0,"documents_linked":0,"reports_linked":0}'::jsonb,
    format('重跑應全為 0，實際 %s', v);
  assert (select count(*) from employees) = 3, '重跑後仍 3 位';

  -- 已存在的員工（例如先手動建檔）→ 只關聯、不重建
  insert into mx_customers (id, name, sales_rep) values
    ('00000000-0000-0000-0000-00000000c707', '庚客戶', '李師傅');
  v := employees_backfill();
  assert (v->>'employees_created')::int = 0 and (v->>'customers_linked')::int = 1,
    format('已有員工只關聯，實際 %s', v);
  assert (select roles from employees where id = emp_test.emp('李師傅')) = array['technician'],
    '重跑不更動既有員工的角色';
  raise notice 'ok  回填（建員工、回填外鍵、可重跑）';
end $$;

-- 回填後一般更新仍會刷新 updated_at（觸發器確實恢復）
update sr_reports set note = '回填後編輯' where id = '00000000-0000-0000-0000-00000000e702';
do $$ begin
  assert (select updated_at from sr_reports where id = '00000000-0000-0000-0000-00000000e702')
         > '2020-01-01 00:00:00+00', '回填後編輯報告單會刷新 updated_at';
  raise notice 'ok  回填保留 updated_at、觸發器恢復';
end $$;

-- ============================================================
-- 3) 約束
-- ============================================================
select emp_test.expect_error($q$insert into employees (name, roles) values ('  amy　wu ', '{sales}')$q$, '23505');
insert into employees (code, name, roles) values ('E01', '測試甲', '{sales}');
select emp_test.expect_error($q$insert into employees (code, name, roles) values (' e01 ', '測試乙', '{sales}')$q$, '23505');
select emp_test.expect_error($q$insert into employees (name, roles) values ('測試丙', '{}')$q$, '23514');
select emp_test.expect_error($q$insert into employees (name, roles) values ('測試丙', '{driver}')$q$, '23514');
select emp_test.expect_error($q$insert into employees (name, roles) values ('   ', '{sales}')$q$, '23514');
-- 空白代號不受唯一限制
insert into employees (code, name, roles) values (null, '測試丁', '{technician}'), ('', '測試戊', '{technician}');

-- ============================================================
-- 4) RLS：erp-only
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

do $$
declare
  v_id  uuid;
  v_doc uuid := '00000000-0000-0000-0000-00000000d711';
  v_doc2 uuid := '00000000-0000-0000-0000-00000000d712';
begin
  assert (select count(*) from employees) = 6, 'erp 可讀全部員工';
  insert into employees (name, roles) values ('ERP新增', '{sales}') returning id into v_id;
  update employees set note = 'erp 可改', active = false where id = v_id;
  assert (select note from employees where id = v_id) = 'erp 可改', 'erp 可更新';
  delete from employees where id = v_id;
  assert not exists (select 1 from employees where id = v_id), 'erp 可刪除未被引用的員工';

  -- 草稿帶 sales_rep_id → 過帳保留 → 作廢保留
  insert into erp_documents (id, doc_type, customer_id, sales_rep, sales_rep_id)
  values (v_doc, 'Q', '00000000-0000-0000-0000-00000000c703', 'Amy Wu', emp_test.emp('Amy Wu'));
  insert into erp_document_lines (document_id, line_no, line_type, item_text, qty, unit_price, amount)
  values (v_doc, 1, 'item', '測試品', 1, 100, 100);
  perform erp_post_document(v_doc);
  assert (select status from erp_documents where id = v_doc) = 'posted', '過帳';
  assert (select sales_rep_id from erp_documents where id = v_doc) = emp_test.emp('Amy Wu'), '過帳保留 sales_rep_id';
  assert (select sales_rep from erp_documents where id = v_doc) = 'Amy Wu', '過帳保留業務快照';
  perform erp_void_document(v_doc, '測試作廢');
  assert (select status from erp_documents where id = v_doc) = 'voided', '作廢';
  assert (select sales_rep_id from erp_documents where id = v_doc) = emp_test.emp('Amy Wu'), '作廢保留 sales_rep_id';

  -- 草稿未填業務 → 過帳由客戶補「文字」，id 維持空（報表以姓名對回員工）
  insert into erp_documents (id, doc_type, customer_id) values (v_doc2, 'Q', '00000000-0000-0000-0000-00000000c701');
  insert into erp_document_lines (document_id, line_no, line_type, item_text, qty, unit_price, amount)
  values (v_doc2, 1, 'item', '測試品', 1, 100, 100);
  perform erp_post_document(v_doc2);
  assert (select sales_rep from erp_documents where id = v_doc2) = '王小明', '過帳由客戶補業務文字';
  assert (select sales_rep_id from erp_documents where id = v_doc2) is null, '過帳不補 sales_rep_id';

  -- 客戶主檔：erp 可改 sales_rep_id
  update mx_customers set sales_rep = '李師傅', sales_rep_id = emp_test.emp('李師傅')
   where id = '00000000-0000-0000-0000-00000000c706';
  assert (select sales_rep_id from mx_customers where id = '00000000-0000-0000-0000-00000000c706')
         = emp_test.emp('李師傅'), 'erp 可設定客戶業務';
  raise notice 'ok  erp-only：讀寫員工、過帳／作廢保留 sales_rep_id';
end $$;

-- 已過帳單據不可由用戶端改業務
select emp_test.expect_error($q$update erp_documents set sales_rep_id = emp_test.emp('王小明') where id = '00000000-0000-0000-0000-00000000d702'$q$, 'not_draft');
-- 被引用的員工不可刪除（客戶、單據）
select emp_test.expect_error($q$delete from employees where id = emp_test.emp('Amy Wu')$q$, '23503');
-- 不存在的員工 id
select emp_test.expect_error($q$update mx_customers set sales_rep_id = gen_random_uuid() where id = '00000000-0000-0000-0000-00000000c701'$q$, '23503');

-- ============================================================
-- 5) RLS：service_report-only
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';

do $$
declare v_id uuid;
begin
  assert (select count(*) from employees) = 6, 'service_report 可讀全部員工';
  insert into employees (name, roles) values ('SR新增', '{technician}') returning id into v_id;
  update employees set code = 'T09' where id = v_id;
  assert (select code from employees where id = v_id) = 'T09', 'service_report 可更新';

  insert into sr_reports (id, report_no, technician, technician_id)
  values ('00000000-0000-0000-0000-00000000e711', 'X11510911', 'SR新增', v_id);
  assert (select technician_id from sr_reports where id = '00000000-0000-0000-0000-00000000e711') = v_id,
    '報告單可帶 technician_id';
  update sr_reports set technician = '李師傅', technician_id = emp_test.emp('李師傅')
   where id = '00000000-0000-0000-0000-00000000e711';
  assert (select technician_id from sr_reports where id = '00000000-0000-0000-0000-00000000e711')
         = emp_test.emp('李師傅'), '報告單可改維護人員';
  delete from employees where id = v_id;
  assert not exists (select 1 from employees where id = v_id), 'service_report 可刪除未被引用的員工';
  raise notice 'ok  service_report-only：讀寫員工、報告單 technician_id';
end $$;

-- 作廢報告單不可改（含 technician_id）；被作廢報告單引用的員工也不可刪
reset role;
insert into employees (name, roles) values ('只在作廢報告', '{technician}');
update sr_reports set technician = '只在作廢報告', technician_id = emp_test.emp('只在作廢報告')
 where id = '00000000-0000-0000-0000-00000000e701';
update sr_reports set status = 'voided', void_reason = '測試', voided_at = now()
 where id = '00000000-0000-0000-0000-00000000e701';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select emp_test.expect_error($q$update sr_reports set technician_id = null where id = '00000000-0000-0000-0000-00000000e701'$q$, 'voided');
-- 只被作廢報告單引用 → 外鍵 restrict 擋下（不會觸發 set null 而撞上作廢單唯讀）
select emp_test.expect_error($q$delete from employees where id = emp_test.emp('只在作廢報告')$q$, '23503');
do $$ begin
  assert emp_test.emp('只在作廢報告') is not null, '被作廢報告單引用的員工仍在';
end $$;

-- ============================================================
-- 6) RLS：無模組的 office／admin、anon
-- ============================================================
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
do $$ begin
  assert (select count(*) from employees) = 0, '無模組的 office 讀不到員工';
end $$;
select emp_test.expect_error($q$insert into employees (name, roles) values ('越權', '{sales}')$q$, '42501');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
do $$
declare n int;
begin
  assert (select count(*) from employees) = 0, '無模組的 admin 讀不到員工';
  update employees set note = '越權' where true;
  get diagnostics n = row_count;
  assert n = 0, '無模組的 admin 改不到任何員工';
  delete from employees where true;
  get diagnostics n = row_count;
  assert n = 0, '無模組的 admin 刪不到任何員工';
end $$;

set local role anon;
select emp_test.expect_error($q$select count(*) from employees$q$, '42501');
select emp_test.expect_error($q$select employees_backfill()$q$, '42501');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select emp_test.expect_error($q$select employees_backfill()$q$, '42501');

set local role service_role;
select emp_test.expect_error($q$select employees_backfill()$q$, '42501');

reset role;
do $$ begin raise notice '==== employees_test：全部斷言通過 ===='; end $$;

rollback;
