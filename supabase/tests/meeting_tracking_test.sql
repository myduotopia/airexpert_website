-- meeting_tracking_test.sql
-- 週報追蹤資料（issue #272，0038）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、TEST-*）。
--
-- 涵蓋：結構（RLS 啟用、policy、view 為 security_invoker）；約束（狀態、訂金覆寫、交機起迄、空白描述、
--       進度恰屬一筆、文字長度）；一致性觸發器（連結單據須為同客戶 Q／S、機台須屬同客戶）；
--       updated_at 觸發器；進度 cascade 刪除、單據／機台刪除後 set null；
--       view：訂金判斷依據（連結 S 的沖銷、連結 Q 轉出 S 的沖銷、作廢收款不計、客戶預收）、最新進度與筆數、
--       search_text；RLS：erp 可讀寫刪、無模組讀不到也寫不進、anon 無權限。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

create schema mt_test;
create function mt_test.expect_error(p_sql text, p_pattern text)
returns void language plpgsql as $$
declare
  v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    if sqlerrm ilike '%' || p_pattern || '%' or sqlstate = p_pattern
       or coalesce(v_detail, '') ilike '%' || p_pattern || '%' then
      raise notice 'ok  [%] %', p_pattern, sqlerrm;
      return;
    end if;
    raise exception '預期 % 但得到 % (%): sql=%', p_pattern, sqlerrm, sqlstate, p_sql;
  end;
  raise exception '預期 % 但執行成功：%', p_pattern, p_sql;
end $$;
grant usage on schema mt_test to authenticated, anon;
grant execute on all functions in schema mt_test to authenticated, anon;

-- ============================================================
-- 1) 結構
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['delivery_jobs', 'repair_jobs', 'machine_issues', 'tracking_progress'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || '：RLS 啟用';
    assert (select array_agg(cmd::text order by cmd) from pg_policies where tablename = t)
           = array['DELETE', 'INSERT', 'SELECT', 'UPDATE'], t || '：四種 policy';
    assert not exists (select 1 from pg_policies where tablename = t
                        and coalesce(qual, with_check) not ilike '%has_module(''erp''::text)%'), t || '：policy 皆為 has_module(erp)';
    assert not exists (select 1 from pg_policies where tablename = t and roles <> '{authenticated}'), t || '：policy 只給 authenticated';
    assert not has_table_privilege('anon', 'public.' || t, 'select'), t || '：anon 無 select';
    assert not has_table_privilege('anon', 'public.' || t, 'insert'), t || '：anon 無 insert';
    assert exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass
                    and tgname = t || '_updated_at'), t || '：updated_at 觸發器';
  end loop;
  foreach t in array array['delivery_jobs_view', 'delivery_document_options', 'repair_jobs_view', 'machine_issues_view'] loop
    assert (select reloptions @> array['security_invoker=true'] from pg_class where oid = ('public.' || t)::regclass),
      t || '：security_invoker';
    assert not has_table_privilege('anon', 'public.' || t, 'select'), t || '：anon 無 select';
    assert has_table_privilege('authenticated', 'public.' || t, 'select'), t || '：authenticated 可 select';
    assert not has_table_privilege('authenticated', 'public.' || t, 'insert')
       and not has_table_privilege('authenticated', 'public.' || t, 'update')
       and not has_table_privilege('authenticated', 'public.' || t, 'delete'), t || '：authenticated 不可寫入 view';
  end loop;
  raise notice 'ok  結構';
end $$;

-- ============================================================
-- 2) 測試資料（postgres 身分）
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000038a1', 'mt-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000038a2', 'mt-none@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000038a1', 'erp',   'mt-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000038a2', 'admin', 'mt-none@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000038a1', 'erp');

insert into mx_customers (id, code, name) values
  ('00000000-0000-0000-0000-0000000038c1', 'ZT0001', 'TEST-追蹤客戶甲'),
  ('00000000-0000-0000-0000-0000000038c2', 'ZT0002', 'TEST-追蹤客戶乙');
insert into employees (id, name, roles) values
  ('00000000-0000-0000-0000-0000000038e1', 'TEST-業務甲', '{sales}'),
  ('00000000-0000-0000-0000-0000000038e2', 'TEST-師傅甲', '{technician}');
insert into mx_machines (id, customer_id, serial_no, model, purchased_at) values
  ('00000000-0000-0000-0000-00000038aa21', '00000000-0000-0000-0000-0000000038c1', 'ZT-SN-001', 'TEST-M100', '2026-08-01'),
  ('00000000-0000-0000-0000-00000038aa22', '00000000-0000-0000-0000-0000000038c2', 'ZT-SN-002', 'TEST-M200', '2026-08-02');

-- 客戶甲：Q1（無轉出）、Q2 → S2（被收款沖 3,000）、S3（直接銷貨，只被作廢收款沖）、P1（採購單，不可連結）
-- 客戶乙：Q9（他客戶），另有未沖銷預收 500
insert into erp_vendors (id, code, name) values ('00000000-0000-0000-0000-0000000038f1', 'ZT-V1', 'TEST-追蹤廠商');
insert into erp_documents (id, doc_type, doc_no, doc_date, status, customer_id, vendor_id, source_doc_id, total_amount, total_twd) values
  ('00000000-0000-0000-0000-0000000038d1', 'Q', 'ZQ1', '2026-10-01', 'posted', '00000000-0000-0000-0000-0000000038c1', null, null, 10000, 10000),
  ('00000000-0000-0000-0000-0000000038d2', 'Q', 'ZQ2', '2026-10-02', 'posted', '00000000-0000-0000-0000-0000000038c1', null, null, 20000, 20000),
  ('00000000-0000-0000-0000-0000000038d3', 'S', 'ZS2', '2026-10-03', 'posted', '00000000-0000-0000-0000-0000000038c1', null, '00000000-0000-0000-0000-0000000038d2', 20000, 20000),
  ('00000000-0000-0000-0000-0000000038d4', 'S', 'ZS3', '2026-10-04', 'posted', '00000000-0000-0000-0000-0000000038c1', null, null, 5000, 5000),
  ('00000000-0000-0000-0000-0000000038d5', 'P', 'ZP1', '2026-10-05', 'posted', null, '00000000-0000-0000-0000-0000000038f1', null, 100, 100),
  ('00000000-0000-0000-0000-0000000038d6', 'Q', 'ZQ9', '2026-10-06', 'posted', '00000000-0000-0000-0000-0000000038c2', null, null, 100, 100),
  ('00000000-0000-0000-0000-0000000038d7', 'Q', null,  '2026-10-07', 'draft',  '00000000-0000-0000-0000-0000000038c1', null, null, 100, 100),
  ('00000000-0000-0000-0000-0000000038d8', 'Q', 'ZQ8', '2026-10-08', 'voided', '00000000-0000-0000-0000-0000000038c1', null, null, 100, 100);
insert into erp_payments (id, direction, kind, doc_no, pay_date, customer_id, method, amount, status) values
  ('00000000-0000-0000-0000-0000000038b1', 'in', 'payment', 'ZRC1', '2026-10-10', '00000000-0000-0000-0000-0000000038c1', 'transfer', 3000, 'posted'),
  ('00000000-0000-0000-0000-0000000038b2', 'in', 'payment', 'ZRC2', '2026-10-11', '00000000-0000-0000-0000-0000000038c1', 'cash',      700, 'voided'),
  ('00000000-0000-0000-0000-0000000038b3', 'in', 'payment', 'ZRC3', '2026-10-12', '00000000-0000-0000-0000-0000000038c2', 'cash',      500, 'posted');
insert into erp_payment_allocations (payment_id, document_id, amount) values
  ('00000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038d3', 3000),
  ('00000000-0000-0000-0000-0000000038b2', '00000000-0000-0000-0000-0000000038d4', 700);

-- ============================================================
-- 3) erp 使用者：新增、約束、觸發器、view
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000038a1","role":"authenticated"}';

do $$
declare
  v record;
  v_updated timestamptz;
begin
  insert into delivery_jobs (id, customer_id, document_id, sales_rep_id, delivery_owner_id, equipment, delivery_start, delivery_end, note)
  values
    ('00000000-0000-0000-0000-00000038aa11', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d1',
     '00000000-0000-0000-0000-0000000038e1', null, 'TEST-螺旋式空壓機', null, null, null),
    ('00000000-0000-0000-0000-00000038aa12', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d2',
     null, '00000000-0000-0000-0000-0000000038e2', 'TEST-乾燥機', '2026-11-03', '2026-11-03', '後處理設備未交'),
    ('00000000-0000-0000-0000-00000038aa13', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d4',
     null, null, null, '2026-11-03', '2026-11-05', null),
    ('00000000-0000-0000-0000-00000038aa14', '00000000-0000-0000-0000-0000000038c2', null,
     null, null, null, null, null, null);

  -- 預設值
  select * into v from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa11';
  assert v.status = 'in_progress' and v.materials_confirmed = false and v.deposit_override is null, '交機預設值';
  assert v.created_by = '00000000-0000-0000-0000-0000000038a1', 'created_by = auth.uid()';

  -- 訂金判斷依據
  select * into v from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa11';
  assert v.linked_allocated = 0, format('Q1 無轉出銷貨：已沖銷 0，得到 %s', v.linked_allocated);
  assert v.customer_prepaid = 0, format('客戶甲無預收，得到 %s', v.customer_prepaid);
  assert v.customer_name = 'TEST-追蹤客戶甲' and v.customer_code = 'ZT0001', 'view 帶客戶';
  assert v.sales_rep_name = 'TEST-業務甲' and v.delivery_owner_name is null, 'view 帶業務、交機負責人待確認';
  assert v.doc_type = 'Q' and v.doc_no = 'ZQ1' and v.doc_status = 'posted', 'view 帶連結單據';
  select * into v from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa12';
  assert v.linked_allocated = 3000, format('Q2 轉出 S2 被沖 3,000，得到 %s', v.linked_allocated);
  assert v.search_text ilike '%後處理設備未交%' and v.search_text ilike '%TEST-師傅甲%' and v.search_text ilike '%ZQ2%',
    'search_text 含注意事項、交機負責人、單號';
  select * into v from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa13';
  assert v.linked_allocated = 0, format('S3 只有作廢收款：不計，得到 %s', v.linked_allocated);
  select * into v from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa14';
  assert v.linked_allocated = 0 and v.customer_prepaid = 500, format('客戶乙預收 500，得到 %s', v.customer_prepaid);

  -- 可連結單據：Q／S、未作廢（含草稿），帶已沖銷金額
  assert (select array_agg(coalesce(doc_no, 'draft') order by doc_date) from delivery_document_options
           where customer_id = '00000000-0000-0000-0000-0000000038c1')
         = array['ZQ1', 'ZQ2', 'ZS2', 'ZS3', 'draft'], '可連結單據：同客戶 Q／S、不含作廢與採購單';
  assert (select linked_allocated from delivery_document_options where doc_no = 'ZQ2') = 3000, '選項：Q2 已沖銷 3,000';
  assert (select linked_allocated from delivery_document_options where doc_no = 'ZS2') = 3000, '選項：S2 已沖銷 3,000';
  assert (select linked_allocated from delivery_document_options where doc_no = 'ZS3') = 0, '選項：S3 作廢收款不計';

  -- 手動覆寫
  update delivery_jobs set deposit_override = 'received' where id = '00000000-0000-0000-0000-00000038aa11';
  assert (select deposit_override from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa11') = 'received',
    '手動覆寫寫入';

  -- updated_at
  -- 同一交易內 now() 不變：更新時傳入舊值，觸發器應改回 now()（= 新增時的預設值）
  select updated_at into v_updated from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa14';
  update delivery_jobs set updated_at = '2000-01-01' where id = '00000000-0000-0000-0000-00000038aa14';
  assert (select updated_at from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa14') = v_updated,
    'updated_at 由觸發器設為 now()，不採用傳入值';
  raise notice 'ok  交機進度：新增、view、訂金依據、覆寫、updated_at';
end $$;

-- 約束與一致性觸發器
select mt_test.expect_error($$insert into delivery_jobs (customer_id, status) values ('00000000-0000-0000-0000-0000000038c1', 'done')$$, 'delivery_jobs_status_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, deposit_override) values ('00000000-0000-0000-0000-0000000038c1', 'auto')$$, 'delivery_jobs_deposit_override_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, delivery_start) values ('00000000-0000-0000-0000-0000000038c1', '2026-11-01')$$, 'delivery_jobs_window_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, delivery_end) values ('00000000-0000-0000-0000-0000000038c1', '2026-11-01')$$, 'delivery_jobs_window_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, delivery_start, delivery_end) values ('00000000-0000-0000-0000-0000000038c1', '2026-11-02', '2026-11-01')$$, 'delivery_jobs_window_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, equipment) values ('00000000-0000-0000-0000-0000000038c1', repeat('x', 501))$$, 'delivery_jobs_text_len_check');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, document_id) values ('00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d5')$$, '只能連結報價單或銷貨單');
select mt_test.expect_error($$insert into delivery_jobs (customer_id, document_id) values ('00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d6')$$, '不是此客戶的單據');
select mt_test.expect_error($$update delivery_jobs set customer_id = '00000000-0000-0000-0000-0000000038c2' where id = '00000000-0000-0000-0000-00000038aa11'$$, '不是此客戶的單據');
select mt_test.expect_error($$insert into delivery_jobs (customer_id) values (null)$$, '23502');

do $$
declare
  v record;
begin
  insert into repair_jobs (id, customer_id, received_on, model, description, owner_id) values
    ('00000000-0000-0000-0000-00000038aa31', '00000000-0000-0000-0000-0000000038c1', '2026-10-20', 'TEST-M100', 'TEST-異音', '00000000-0000-0000-0000-0000000038e2'),
    ('00000000-0000-0000-0000-00000038aa32', '00000000-0000-0000-0000-0000000038c2', '2026-10-21', null, 'TEST-漏油', null);
  assert (select status from repair_jobs where id = '00000000-0000-0000-0000-00000038aa31') = 'pending', '維修預設待確認';

  insert into tracking_progress (repair_job_id, progress_date, content, created_at) values
    ('00000000-0000-0000-0000-00000038aa31', '2026-10-21', 'TEST-拆機檢查', '2026-10-21 09:00+08'),
    ('00000000-0000-0000-0000-00000038aa31', '2026-10-23', 'TEST-更換軸承', '2026-10-23 09:00+08'),
    -- 同日較晚建立者為最新
    ('00000000-0000-0000-0000-00000038aa31', '2026-10-23', 'TEST-試車完成', '2026-10-23 15:00+08'),
    -- 日期較早但較晚建立：不是最新
    ('00000000-0000-0000-0000-00000038aa31', '2026-10-22', 'TEST-補登', '2026-10-24 09:00+08');

  select * into v from repair_jobs_view where id = '00000000-0000-0000-0000-00000038aa31';
  assert v.latest_progress = 'TEST-試車完成' and v.latest_progress_date = '2026-10-23',
    format('最新進度依日期、建立時間，得到 %s', v.latest_progress);
  assert v.progress_count = 4, '進度筆數';
  assert v.owner_name = 'TEST-師傅甲' and v.search_text ilike '%異音%' and v.search_text ilike '%TEST-M100%', 'view 帶負責人與搜尋字串';
  select * into v from repair_jobs_view where id = '00000000-0000-0000-0000-00000038aa32';
  assert v.latest_progress is null and v.progress_count = 0, '無進度';

  insert into machine_issues (id, customer_id, machine_id, model, delivered_on, description, occurred_on, is_key) values
    ('00000000-0000-0000-0000-00000038aa41', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-00000038aa21',
     'TEST-M100', '2026-08-01', 'TEST-高溫跳機', '2026-10-15', true),
    ('00000000-0000-0000-0000-00000038aa42', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-00000038aa21',
     'TEST-M100', '2026-08-01', 'TEST-面板異常', '2026-10-16', false);
  insert into tracking_progress (machine_issue_id, progress_date, content) values
    ('00000000-0000-0000-0000-00000038aa41', '2026-10-16', 'TEST-已聯絡原廠');
  select * into v from machine_issues_view where id = '00000000-0000-0000-0000-00000038aa41';
  assert v.status = 'handling' and v.is_key and v.machine_serial_no = 'ZT-SN-001', 'view 帶機號、重點追蹤';
  assert v.latest_progress = 'TEST-已聯絡原廠' and v.progress_count = 1, '新機問題最新進度';
  assert v.search_text ilike '%ZT-SN-001%' and v.search_text ilike '%高溫%', '搜尋字串含機號、問題';
  assert (select count(*) from machine_issues where machine_id = '00000000-0000-0000-0000-00000038aa21') = 2,
    '同一台機器可有多筆問題';
  raise notice 'ok  進廠維修、新機問題、時間軸';
end $$;

select mt_test.expect_error($$insert into repair_jobs (customer_id, description, status) values ('00000000-0000-0000-0000-0000000038c1', 'x', 'closed')$$, 'repair_jobs_status_check');
select mt_test.expect_error($$insert into repair_jobs (customer_id, description) values ('00000000-0000-0000-0000-0000000038c1', '   ')$$, 'repair_jobs_description_check');
select mt_test.expect_error($$insert into machine_issues (customer_id, description, status) values ('00000000-0000-0000-0000-0000000038c1', 'x', 'done')$$, 'machine_issues_status_check');
select mt_test.expect_error($$insert into machine_issues (customer_id, description) values ('00000000-0000-0000-0000-0000000038c1', '')$$, 'machine_issues_description_check');
select mt_test.expect_error($$insert into machine_issues (customer_id, machine_id, description) values ('00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-00000038aa22', 'x')$$, '不屬於此客戶');
select mt_test.expect_error($$insert into tracking_progress (content) values ('x')$$, 'tracking_progress_parent_check');
select mt_test.expect_error($$insert into tracking_progress (repair_job_id, machine_issue_id, content) values ('00000000-0000-0000-0000-00000038aa31', '00000000-0000-0000-0000-00000038aa41', 'x')$$, 'tracking_progress_parent_check');
select mt_test.expect_error($$insert into tracking_progress (repair_job_id, content) values ('00000000-0000-0000-0000-00000038aa31', ' ')$$, 'tracking_progress_content_check');

do $$ begin
  -- 進度日期預設今天
  insert into tracking_progress (repair_job_id, content) values ('00000000-0000-0000-0000-00000038aa32', 'TEST-預設日期');
  assert (select progress_date from tracking_progress where content = 'TEST-預設日期') = current_date, '進度日期預設今天';
  -- 刪除維修單：進度 cascade
  delete from repair_jobs where id = '00000000-0000-0000-0000-00000038aa31';
  assert not exists (select 1 from tracking_progress where repair_job_id = '00000000-0000-0000-0000-00000038aa31'),
    '刪除維修單連同進度';
  raise notice 'ok  進度預設日期、cascade 刪除';
end $$;
reset role;
reset request.jwt.claims;

-- 單據、機台刪除 → 追蹤資料保留、解除連結（postgres 身分；草稿單據可刪）
do $$ begin
  insert into delivery_jobs (id, customer_id, document_id) values
    ('00000000-0000-0000-0000-00000038aa15', '00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038d7');
  delete from erp_documents where id = '00000000-0000-0000-0000-0000000038d7';
  assert (select document_id from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa15') is null, '單據刪除 → set null';
  delete from mx_machines where id = '00000000-0000-0000-0000-00000038aa21';
  assert (select count(*) from machine_issues where machine_id is null and customer_id = '00000000-0000-0000-0000-0000000038c1') = 2,
    '機台刪除 → set null、問題保留';
  raise notice 'ok  單據／機台刪除後解除連結';
end $$;

-- 連結單據的「已沖銷」只算同客戶的銷貨單（模擬連結的草稿報價單事後被改成他客戶後轉出銷貨：
-- 以 postgres 身分直接建立客戶乙、來源為客戶甲 Q1 的已過帳 S，並以客戶乙的收款沖銷）
do $$ begin
  insert into erp_documents (id, doc_type, doc_no, doc_date, status, customer_id, source_doc_id, total_amount, total_twd) values
    ('00000000-0000-0000-0000-0000000038d9', 'S', 'ZS9', '2026-10-09', 'posted', '00000000-0000-0000-0000-0000000038c2',
     '00000000-0000-0000-0000-0000000038d1', 500, 500);
  insert into erp_payment_allocations (payment_id, document_id, amount) values
    ('00000000-0000-0000-0000-0000000038b3', '00000000-0000-0000-0000-0000000038d9', 500);
  assert (select linked_allocated from delivery_jobs_view where id = '00000000-0000-0000-0000-00000038aa11') = 0,
    '連結 Q1：他客戶的銷貨沖銷不計入';
  assert (select linked_allocated from delivery_document_options where doc_no = 'ZQ1') = 0,
    '選項 Q1：他客戶的銷貨沖銷不計入';
  raise notice 'ok  已沖銷只算同客戶銷貨單';
end $$;

-- ============================================================
-- 4) RLS：無模組、anon
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000038a2","role":"authenticated"}';
do $$ begin
  assert (select count(*) from delivery_jobs) = 0, '無模組讀不到交機進度';
  assert (select count(*) from repair_jobs) = 0, '無模組讀不到進廠維修';
  assert (select count(*) from machine_issues) = 0, '無模組讀不到新機問題';
  assert (select count(*) from tracking_progress) = 0, '無模組讀不到進度';
  assert (select count(*) from delivery_jobs_view) = 0, '無模組讀不到交機 view';
  assert (select count(*) from delivery_document_options) = 0, '無模組讀不到可連結單據（不外洩單據金額）';
  assert (select count(*) from repair_jobs_view) = 0 and (select count(*) from machine_issues_view) = 0, '無模組讀不到 view';
  -- update／delete 無作用（RLS 過濾）
  update repair_jobs set status = 'done';
  delete from machine_issues;
  raise notice 'ok  無模組讀不到';
end $$;
select mt_test.expect_error($$insert into repair_jobs (customer_id, description) values ('00000000-0000-0000-0000-0000000038c1', 'x')$$, '42501');
select mt_test.expect_error($$insert into delivery_jobs (customer_id) values ('00000000-0000-0000-0000-0000000038c1')$$, '42501');
reset role;
reset request.jwt.claims;

do $$ begin
  assert (select status from repair_jobs where id = '00000000-0000-0000-0000-00000038aa32') = 'pending', '無模組的 update 沒有作用';
  assert (select count(*) from machine_issues) = 2, '無模組的 delete 沒有作用';
end $$;

set local role anon;
select mt_test.expect_error($$select count(*) from delivery_jobs$$, '42501');
select mt_test.expect_error($$select count(*) from tracking_progress$$, '42501');
select mt_test.expect_error($$select count(*) from machine_issues_view$$, '42501');
select mt_test.expect_error($$insert into repair_jobs (customer_id, description) values ('00000000-0000-0000-0000-0000000038c1', 'x')$$, '42501');
reset role;

-- erp 使用者可刪除
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000038a1","role":"authenticated"}';
do $$ begin
  delete from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa14';
  assert not exists (select 1 from delivery_jobs where id = '00000000-0000-0000-0000-00000038aa14'), 'erp 可刪除交機進度';
  raise notice 'ok  RLS：erp 可刪、無模組與 anon 不可';
end $$;
reset role;

\o
\echo meeting_tracking_test: ALL PASSED
rollback;
