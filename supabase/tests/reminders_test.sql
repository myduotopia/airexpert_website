-- reminders_test.sql
-- ERP 提醒事項（issue #274，0040）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、TEST-*）。
--
-- 涵蓋：結構（欄位預設、週期與來源約束、unique(rule_id, due_date)、同廠商 auto_key 唯一）、
--       RLS（erp 可讀寫、無 erp 讀不到也寫不進、anon 無權限）、廠商刪除連帶刪除規則與處理紀錄、
--       同步 RPC erp_apply_reminder_sync（新增、重跑不重複、只更新 auto 不動 manual、格式錯誤、無權限）。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

create schema rem_test;
create function rem_test.login(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
$$;
create function rem_test.expect_error(p_sql text, p_code text)
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
grant usage on schema rem_test to authenticated, anon;
grant execute on all functions in schema rem_test to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000040a1', 'rem-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000040a2', 'rem-none@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000040a1', 'erp',   'rem-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000040a2', 'admin', 'rem-none@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000040a1', 'erp');
insert into erp_vendors (id, code, name, note) values
  ('00000000-0000-0000-0000-0000000040f1', 'TEST-R1', 'TEST-提醒廠商甲', '每月10號匯款'),
  ('00000000-0000-0000-0000-0000000040f2', 'TEST-R2', 'TEST-提醒廠商乙', null);

-- ============================================================
-- 1) 結構與約束（postgres 身分）
-- ============================================================
do $$
declare v_id uuid;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.erp_reminder_rules'::regclass), 'rules RLS 啟用';
  assert (select relrowsecurity from pg_class where oid = 'public.erp_reminder_occurrences'::regclass), 'occurrences RLS 啟用';
  assert (select array_agg(policyname::text order by policyname) from pg_policies
           where tablename in ('erp_reminder_rules', 'erp_reminder_occurrences'))
         = array['erp all erp_reminder_occurrences', 'erp all erp_reminder_rules'], 'policy 各一條（erp all）';
  assert not has_table_privilege('anon', 'public.erp_reminder_rules', 'select'), 'anon 無 rules select 權限';
  assert not has_table_privilege('anon', 'public.erp_reminder_occurrences', 'insert'), 'anon 無 occurrences insert 權限';
  assert not has_function_privilege('anon', 'public.erp_apply_reminder_sync(jsonb)', 'execute'), 'anon 不可執行同步 RPC';
  assert (select prosecdef = false from pg_proc where oid = 'public.erp_apply_reminder_sync(jsonb)'::regprocedure),
    '同步 RPC 為 security invoker';

  -- 預設值：manual、提前 7 天、啟用、起算日＝台灣今天
  insert into erp_reminder_rules (title, kind, day_of_month) values ('TEST-預設', 'monthly', 10)
    returning id into v_id;
  assert (select source = 'manual' and lead_days = 7 and active and not auto_missing
                 and start_date = (now() at time zone 'Asia/Taipei')::date
            from erp_reminder_rules where id = v_id), '預設值';
  delete from erp_reminder_rules where id = v_id;
  raise notice 'ok  結構、RLS policy、預設值';
end $$;

-- 週期欄位約束
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind) values ('x', 'monthly')$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month) values ('x', 'monthly', 0)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month) values ('x', 'monthly', 32)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month, weekday) values ('x', 'monthly', 10, 3)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, weekday) values ('x', 'weekly', 7)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, month, day_of_month) values ('x', 'yearly', 2, 30)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, month, day_of_month) values ('x', 'yearly', 4, -1)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind) values ('x', 'once')$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month) values ('  ', 'monthly', 1)$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month, lead_days) values ('x', 'monthly', 1, 91)$$, '23514');
-- 來源約束：auto 必有 auto_key 與廠商、不可單次；manual 不可有 auto_key
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month, source, vendor_id) values ('x', 'monthly', 1, 'auto', '00000000-0000-0000-0000-0000000040f1')$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month, source, auto_key) values ('x', 'monthly', 1, 'auto', 'm:1:x')$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, once_date, source, auto_key, vendor_id) values ('x', 'once', '2026-11-05', 'auto', 'o:x', '00000000-0000-0000-0000-0000000040f1')$$, '23514');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month, auto_key) values ('x', 'monthly', 1, 'm:1:x')$$, '23514');

do $$ begin
  -- 合法：月底、每年 2/29、單次
  insert into erp_reminder_rules (title, kind, day_of_month) values ('TEST-月底', 'monthly', -1);
  insert into erp_reminder_rules (title, kind, month, day_of_month) values ('TEST-閏日', 'yearly', 2, 29);
  insert into erp_reminder_rules (title, kind, once_date) values ('TEST-單次', 'once', '2026-11-05');
  delete from erp_reminder_rules where title like 'TEST-%';
  raise notice 'ok  合法週期可建立';
end $$;

-- 同廠商同 auto_key 唯一；不同廠商可同 key；manual 不受限
insert into erp_reminder_rules (id, vendor_id, title, kind, day_of_month, source, auto_key) values
  ('00000000-0000-0000-0000-0000000040b1', '00000000-0000-0000-0000-0000000040f1', '匯款', 'monthly', 10, 'auto', 'm:10:匯款');
select rem_test.expect_error($$insert into erp_reminder_rules (vendor_id, title, kind, day_of_month, source, auto_key) values ('00000000-0000-0000-0000-0000000040f1', '匯款', 'monthly', 10, 'auto', 'm:10:匯款')$$, '23505');
do $$ begin
  insert into erp_reminder_rules (vendor_id, title, kind, day_of_month, source, auto_key) values
    ('00000000-0000-0000-0000-0000000040f2', '匯款', 'monthly', 10, 'auto', 'm:10:匯款');
  insert into erp_reminder_rules (vendor_id, title, kind, day_of_month) values
    ('00000000-0000-0000-0000-0000000040f1', '匯款', 'monthly', 10),
    ('00000000-0000-0000-0000-0000000040f1', '匯款', 'monthly', 10);
  delete from erp_reminder_rules where id <> '00000000-0000-0000-0000-0000000040b1';
  raise notice 'ok  auto_key 同廠商唯一';
end $$;

-- 處理紀錄：unique(rule_id, due_date)、status 限 done／skipped
insert into erp_reminder_occurrences (rule_id, due_date, status) values
  ('00000000-0000-0000-0000-0000000040b1', '2026-11-10', 'done');
select rem_test.expect_error($$insert into erp_reminder_occurrences (rule_id, due_date, status) values ('00000000-0000-0000-0000-0000000040b1', '2026-11-10', 'skipped')$$, '23505');
select rem_test.expect_error($$insert into erp_reminder_occurrences (rule_id, due_date, status) values ('00000000-0000-0000-0000-0000000040b1', '2026-12-10', 'pending')$$, '23514');
do $$ begin
  insert into erp_reminder_occurrences (rule_id, due_date, status) values
    ('00000000-0000-0000-0000-0000000040b1', '2026-12-10', 'skipped');
  -- upsert（標記完成時改狀態）
  insert into erp_reminder_occurrences (rule_id, due_date, status, note) values
    ('00000000-0000-0000-0000-0000000040b1', '2026-12-10', 'done', '補記')
  on conflict (rule_id, due_date) do update set status = excluded.status, note = excluded.note;
  assert (select status = 'done' and note = '補記' from erp_reminder_occurrences
           where rule_id = '00000000-0000-0000-0000-0000000040b1' and due_date = '2026-12-10'), 'upsert';
  raise notice 'ok  處理紀錄 unique(rule_id, due_date)';
end $$;

-- ============================================================
-- 2) RLS
-- ============================================================
set local role authenticated;
do $$
declare v_id uuid;
begin
  perform rem_test.login('00000000-0000-0000-0000-0000000040a1');
  assert (select count(*) from erp_reminder_rules) = 1, 'erp 讀得到規則';
  assert (select count(*) from erp_reminder_occurrences) = 2, 'erp 讀得到處理紀錄';
  insert into erp_reminder_rules (vendor_id, title, kind, weekday)
    values ('00000000-0000-0000-0000-0000000040f2', '送貨', 'weekly', 3) returning id into v_id;
  assert (select created_by = '00000000-0000-0000-0000-0000000040a1' from erp_reminder_rules where id = v_id), 'created_by';
  update erp_reminder_rules set lead_days = 3 where id = v_id;
  insert into erp_reminder_occurrences (rule_id, due_date, status) values (v_id, '2026-11-04', 'done');
  assert (select handled_by = '00000000-0000-0000-0000-0000000040a1' from erp_reminder_occurrences where rule_id = v_id),
    'handled_by＝登入者';
  delete from erp_reminder_occurrences where rule_id = v_id;
  delete from erp_reminder_rules where id = v_id;

  perform rem_test.login('00000000-0000-0000-0000-0000000040a2');
  assert (select count(*) from erp_reminder_rules) = 0, '無 erp 讀不到規則';
  assert (select count(*) from erp_reminder_occurrences) = 0, '無 erp 讀不到處理紀錄';
  update erp_reminder_rules set title = '改不到';
  delete from erp_reminder_occurrences;
  raise notice 'ok  RLS：erp 可讀寫、無 erp 讀不到';
end $$;
select rem_test.login('00000000-0000-0000-0000-0000000040a2');
select rem_test.expect_error($$insert into erp_reminder_rules (title, kind, day_of_month) values ('x', 'monthly', 1)$$, '42501');
select rem_test.expect_error($$insert into erp_reminder_occurrences (rule_id, due_date, status) values ('00000000-0000-0000-0000-0000000040b1', '2027-01-10', 'done')$$, '42501');
select rem_test.expect_error($$select erp_apply_reminder_sync('{"insert":[],"update":[]}'::jsonb)$$, 'forbidden');
reset role;

do $$ begin
  assert (select title = '匯款' from erp_reminder_rules where id = '00000000-0000-0000-0000-0000000040b1'), '無 erp 的 update 無作用';
  assert (select count(*) from erp_reminder_occurrences) = 2, '無 erp 的 delete 無作用';
end $$;

set local role anon;
select rem_test.expect_error($$select count(*) from erp_reminder_rules$$, '42501');
select rem_test.expect_error($$select count(*) from erp_reminder_occurrences$$, '42501');
select rem_test.expect_error($$select erp_apply_reminder_sync('{}'::jsonb)$$, '42501');
reset role;

-- ============================================================
-- 3) 同步 RPC（erp 使用者）
-- ============================================================
insert into erp_reminder_rules (id, vendor_id, title, kind, day_of_month, source) values
  ('00000000-0000-0000-0000-0000000040b2', '00000000-0000-0000-0000-0000000040f1', '手動對帳', 'monthly', 20, 'manual');

set local role authenticated;
select rem_test.login('00000000-0000-0000-0000-0000000040a1');
select rem_test.expect_error($$select erp_apply_reminder_sync('[]'::jsonb)$$, 'validation');
select rem_test.expect_error($$select erp_apply_reminder_sync('{"insert":{}}'::jsonb)$$, 'validation');
select rem_test.expect_error($$select erp_apply_reminder_sync(null)$$, 'validation');
do $$
declare
  v_plan jsonb := jsonb_build_object(
    'insert', jsonb_build_array(
      -- 已存在（同廠商同 key）→ 略過
      jsonb_build_object('vendor_id', '00000000-0000-0000-0000-0000000040f1', 'auto_key', 'm:10:匯款', 'title', '匯款',
                         'kind', 'monthly', 'day_of_month', 10, 'source_text', '每月10號匯款', 'start_date', '2026-11-03'),
      jsonb_build_object('vendor_id', '00000000-0000-0000-0000-0000000040f1', 'auto_key', 'm:-1:對帳', 'title', '對帳',
                         'kind', 'monthly', 'day_of_month', -1, 'source_text', '月底對帳', 'start_date', '2026-11-03'),
      jsonb_build_object('vendor_id', '00000000-0000-0000-0000-0000000040f2', 'auto_key', 'w:3:送貨', 'title', '送貨',
                         'kind', 'weekly', 'weekday', 3, 'source_text', '每週三送貨', 'start_date', '2026-11-03')),
    'update', jsonb_build_array(
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000040b1', 'source_text', '每個月10日匯款',
                         'active', true, 'auto_missing', false),
      -- 指向 manual 規則 → 不可被改
      jsonb_build_object('id', '00000000-0000-0000-0000-0000000040b2', 'source_text', '不應寫入',
                         'active', false, 'auto_missing', false)));
  v_res jsonb;
begin
  v_res := erp_apply_reminder_sync(v_plan);
  assert v_res = '{"inserted": 2, "updated": 1}'::jsonb, format('第一次：%s', v_res);
  assert (select source = 'auto' and start_date = '2026-11-03' and active and lead_days = 7
            from erp_reminder_rules where auto_key = 'm:-1:對帳'), '新增的 auto 規則';
  assert (select source_text = '每個月10日匯款' from erp_reminder_rules
           where id = '00000000-0000-0000-0000-0000000040b1'), 'auto 規則原文已更新';
  assert (select source_text is null and active and not auto_missing and title = '手動對帳'
            from erp_reminder_rules where id = '00000000-0000-0000-0000-0000000040b2'), 'manual 規則不動';

  -- 重跑同一份計畫：不重複新增
  v_res := erp_apply_reminder_sync(v_plan);
  assert (v_res->>'inserted')::int = 0, format('重跑不重複新增：%s', v_res);
  assert (select count(*) from erp_reminder_rules where source = 'auto') = 3, 'auto 規則共 3 條';

  -- 停用並標記 auto_missing（備註不再出現）
  v_res := erp_apply_reminder_sync(jsonb_build_object('update', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-0000-0000-0000000040b1', 'source_text', '每個月10日匯款',
                       'active', false, 'auto_missing', true))));
  assert v_res = '{"inserted": 0, "updated": 1}'::jsonb, format('停用：%s', v_res);
  assert (select not active and auto_missing from erp_reminder_rules
           where id = '00000000-0000-0000-0000-0000000040b1'), '已停用並標記';
  -- 處理紀錄保留
  assert (select count(*) from erp_reminder_occurrences
           where rule_id = '00000000-0000-0000-0000-0000000040b1') = 2, '停用不刪處理紀錄';

  -- 格式錯誤的 auto 列（單次）→ 約束擋下、整批 rollback
  begin
    perform erp_apply_reminder_sync(jsonb_build_object('insert', jsonb_build_array(
      jsonb_build_object('vendor_id', '00000000-0000-0000-0000-0000000040f2', 'auto_key', 'x', 'title', 'x',
                         'kind', 'monthly', 'day_of_month', 5, 'source_text', 'x'),
      jsonb_build_object('vendor_id', '00000000-0000-0000-0000-0000000040f2', 'auto_key', 'y', 'title', 'y',
                         'kind', 'once', 'source_text', 'y'))));
    raise exception '預期約束錯誤';
  exception when check_violation then null;
  end;
  assert not exists (select 1 from erp_reminder_rules where auto_key = 'x'), '整批 rollback';
  raise notice 'ok  同步 RPC：新增、重跑不重複、只更新 auto、停用保留紀錄、錯誤整批 rollback';
end $$;
reset role;

-- ============================================================
-- 4) 廠商刪除連帶刪除規則與處理紀錄
-- ============================================================
do $$ begin
  delete from erp_vendors where id = '00000000-0000-0000-0000-0000000040f1';
  assert not exists (select 1 from erp_reminder_rules where vendor_id = '00000000-0000-0000-0000-0000000040f1'), '規則連帶刪除';
  assert not exists (select 1 from erp_reminder_occurrences), '處理紀錄連帶刪除';
  raise notice 'ok  廠商刪除連帶刪除';
end $$;

do $$ begin raise notice '==== reminders_test：全部斷言通過 ===='; end $$;
rollback;
