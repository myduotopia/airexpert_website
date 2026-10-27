-- customer_source_test.sql
-- 客戶來源 mx_customers.source（issue #266，0035）SQL 測試。全程 begin; … rollback;，不留任何資料。
-- 本機：bash supabase/tests/local-db.sh（拋棄式 Docker Postgres 17）。測試資料全為虛構（*.invalid、ZQ 開頭編號）。
--
-- 涵蓋：欄位型別（text、可空、無預設、無 check）、partial index、mx_customers 的 RLS policy 集合未變；
--       erp／保養卡（office）可讀寫 source、service_report 只讀、無模組與 anon 讀不到；
--       1,200 筆假資料下，列表的來源篩選（FB／其他有值／未填，對應 PostgREST 的 ilike／not.is.null／is.null）
--       與分頁排序（code nulls last, name）結果正確。

\set ON_ERROR_STOP 1
\o /dev/null
begin;

-- ============================================================
-- 1) 結構
-- ============================================================
do $$ begin
  assert (select data_type = 'text' and is_nullable = 'YES' and column_default is null
            from information_schema.columns
           where table_schema = 'public' and table_name = 'mx_customers' and column_name = 'source'),
    'source：text、可空、無預設';
  assert not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mx_customers'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%source%'),
    'source 無 check 約束（自由文字）';
  assert (select indexdef ilike '%(source)%where (source is not null)%'
            from pg_indexes where tablename = 'mx_customers' and indexname = 'mx_customers_source_idx'),
    'partial index mx_customers_source_idx';
  -- RLS：0035 不新增／變更 policy；集合與 0020／0021／0032 建立的一致
  assert (select array_agg(policyname::text order by policyname) from pg_policies
           where schemaname = 'public' and tablename = 'mx_customers')
         = array['erp insert mx_customers', 'erp select mx_customers', 'erp update mx_customers',
                 'maintenance all mx_customers', 'service_report select mx_customers'],
    'mx_customers policy 集合不變';
  assert not exists (
    select 1 from pg_policies where tablename = 'mx_customers'
       and (coalesce(qual, '') ilike '%source%' or coalesce(with_check, '') ilike '%source%')),
    'policy 不涉及 source';
  assert (select relrowsecurity from pg_class where oid = 'public.mx_customers'::regclass), 'RLS 仍啟用';
  raise notice 'ok  結構、索引、RLS policy';
end $$;

-- ============================================================
-- 2) RLS：誰能讀寫 source
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000035a1', 'src-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a2', 'src-office@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a3', 'src-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a4', 'src-none@example.invalid');
insert into admin_profiles (id, role, email) values
  ('00000000-0000-0000-0000-0000000035a1', 'erp',    'src-erp@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a2', 'office', 'src-office@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a3', 'erp',    'src-sr@example.invalid'),
  ('00000000-0000-0000-0000-0000000035a4', 'staff',  'src-none@example.invalid');
insert into admin_module_grants (user_id, module) values
  ('00000000-0000-0000-0000-0000000035a1', 'erp'),
  ('00000000-0000-0000-0000-0000000035a3', 'service_report');
insert into mx_customers (id, code, name, source) values
  ('00000000-0000-0000-0000-0000000035c1', 'ZQ0001', '來源測試甲', 'FB'),
  ('00000000-0000-0000-0000-0000000035c2', 'ZQ0002', '來源測試乙', null);

create schema source_test;
create function source_test.login(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
$$;
grant usage on schema source_test to authenticated, anon;
grant execute on all functions in schema source_test to authenticated, anon;

set local role authenticated;
do $$ begin
  -- erp：可讀、可改、可新增
  perform source_test.login('00000000-0000-0000-0000-0000000035a1');
  assert (select source from mx_customers where code = 'ZQ0001') = 'FB', 'erp 讀得到 source';
  update mx_customers set source = '展覽' where code = 'ZQ0002';
  assert (select source from mx_customers where code = 'ZQ0002') = '展覽', 'erp 可更新 source';
  insert into mx_customers (code, name, source) values ('ZQ0003', '來源測試丙', 'FB');

  -- 保養卡（office 角色）：可讀寫
  perform source_test.login('00000000-0000-0000-0000-0000000035a2');
  assert (select count(*) from mx_customers where code like 'ZQ%') = 3, 'office 讀得到';
  update mx_customers set source = null where code = 'ZQ0003';
  assert (select source from mx_customers where code = 'ZQ0003') is null, 'office 可更新 source';

  -- service_report：只讀
  perform source_test.login('00000000-0000-0000-0000-0000000035a3');
  assert (select source from mx_customers where code = 'ZQ0001') = 'FB', 'service_report 讀得到 source';
  update mx_customers set source = '改不到' where code = 'ZQ0001';
  -- 沒有模組：讀不到
  perform source_test.login('00000000-0000-0000-0000-0000000035a4');
  assert (select count(*) from mx_customers) = 0, '無模組讀不到客戶';
  raise notice 'ok  RLS：erp／office 可讀寫、service_report 只讀、無模組讀不到';
end $$;
reset role;

do $$ begin
  assert (select source from mx_customers where code = 'ZQ0001') = 'FB', 'service_report 的 update 沒有作用';
end $$;

set local role anon;
do $$ begin
  begin
    assert (select count(*) from mx_customers) = 0, 'anon 讀不到客戶';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok  anon 讀不到客戶';
end $$;
reset role;

-- ============================================================
-- 3) 1,200 筆假資料：來源篩選與分頁
-- ============================================================
delete from mx_customers where code like 'ZQ%';
-- 每 10 筆：1 筆 FB、1 筆 fb（大小寫不同）、1 筆其他來源、其餘未填；另有 20 筆無編號
insert into mx_customers (code, name, source)
select 'ZQ' || lpad(g::text, 4, '0'),
       '分頁測試' || g,
       case g % 10 when 0 then 'FB' when 1 then 'fb' when 2 then '展覽' else null end
  from generate_series(1, 1200) g;
insert into mx_customers (code, name) select null, '無編號' || g from generate_series(1, 20) g;

do $$
declare
  v_fb int; v_other int; v_none int; v_page text[];
begin
  -- source=fb：ilike 'FB'（無萬用字元＝不分大小寫的相等）
  select count(*) into v_fb from mx_customers where code like 'ZQ%' and source ilike 'FB';
  assert v_fb = 240, format('FB 篩選 240 筆（得到 %s）', v_fb);
  -- source=other：not.is.null + not.ilike.FB
  select count(*) into v_other from mx_customers
   where code like 'ZQ%' and source is not null and not (source ilike 'FB');
  assert v_other = 120, format('其他來源 120 筆（得到 %s）', v_other);
  -- source=none：is.null
  select count(*) into v_none from mx_customers where (code like 'ZQ%' or code is null) and source is null;
  assert v_none = 860, format('未填 860 筆（得到 %s）', v_none);
  assert v_fb + v_other + 840 = 1200, '三類互斥且涵蓋全部有編號者';

  -- 列表排序與分頁（order code asc nulls last, name; range 50 筆）：第 24 頁（1,151–1,200）與第 25 頁（無編號）
  v_page := array(
    select code from mx_customers where code like 'ZQ%' or code is null
     order by code asc nulls last, name limit 50 offset 1150);
  assert cardinality(v_page) = 50, '第 24 頁 50 筆';
  assert v_page[1] = 'ZQ1151' and v_page[50] = 'ZQ1200', '第 24 頁為 ZQ1151–ZQ1200';
  assert (select count(*) from (
    select code from mx_customers where code like 'ZQ%' or code is null
     order by code asc nulls last, name limit 50 offset 1200) s where code is null) = 20,
    '無編號排最後（第 25 頁）';
  raise notice 'ok  1,200 筆：來源篩選與分頁';
end $$;

-- 檢查 planner 可用 partial index 篩出有來源的列（不強制使用，只確認能建出計畫）
explain select id from mx_customers where source is not null;

do $$ begin raise notice '==== customer_source_test：全部斷言通過 ===='; end $$;

rollback;
