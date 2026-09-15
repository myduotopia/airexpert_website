#!/usr/bin/env bash
# ERP 併發測試（issue #172 review #3 #4 #5）：拋棄式 Docker Postgres 17，套用 migrations 後
# 以兩個真實 session 競爭，驗證第二個 session 被正確序列化／拒絕。任何斷言失敗 → exit 1。
# 結束（成功或失敗）時自動移除容器。絕不連線正式 DB。
#
# 用法：bash supabase/tests/erp_concurrency_test.sh
#       MIGRATIONS_DIR=/path/to/migrations bash supabase/tests/erp_concurrency_test.sh   # 指定 migrations
#
# 每個 race：session A 開交易 → 執行 RPC → pg_sleep(HOLD) 持鎖；等 A 進入 sleep 後 session B 執行競爭操作。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT/migrations}"
IMAGE="${PG_IMAGE:-postgres:17-alpine}"
NAME="airexpert-erp-conc-$$"
HOLD="${HOLD:-3}"
TMP="$(mktemp -d)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "==> 啟動 $IMAGE（容器 $NAME）"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null \
     && docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

q() { docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$NAME" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"; }
val() { docker exec -i "$NAME" psql -U postgres -d postgres -X -tAc "$1"; }

echo "==> 建立 Supabase stub"
q <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
alter table storage.objects enable row level security;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

echo "==> 套用 migrations（$MIGRATIONS_DIR）"
for f in "$MIGRATIONS_DIR"/*.sql; do
  q -1 < "$f" >/dev/null
done

AUTH="set role authenticated;
set request.jwt.claims = '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}';"

echo "==> 建立測試資料（已提交）"
q <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'office@airexpert.com.tw');
insert into admin_profiles (id, role, email) values ('00000000-0000-0000-0000-000000000001', 'office', 'office@airexpert.com.tw');
insert into admin_module_grants values ('00000000-0000-0000-0000-000000000001', 'erp') on conflict do nothing;
set role authenticated;
set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

create temp table ids as select (select id from erp_warehouses where code = 'MAIN') as wh;
insert into mx_customers (id, name) values ('00000000-0000-0000-0000-00000000d001', 'C1');
insert into erp_vendors (id, code, name) values ('00000000-0000-0000-0000-00000000b001', 'V', 'v');
insert into erp_items (id, code, name, kind, track_serial, track_stock, mx_card_type) values
  ('00000000-0000-0000-0000-0000000100c0', 'R1', 'r1', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000200c0', 'R2', 'r2', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000300c0', 'R3', 'r3', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000400c0', 'R4', 'r4', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000500c0', 'R5', 'r5', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000600c0', 'R6', 'r6', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000700c0', 'R7', 'r7', 'machine', true, true, 'compressor');

-- R1：P 1 台，兩張 I 各收 1
insert into erp_documents (id, doc_type, doc_date, vendor_id) values
  ('00000000-0000-0000-0000-0000000100a0', 'P', '2026-09-01', '00000000-0000-0000-0000-00000000b001');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000100f0', '00000000-0000-0000-0000-0000000100a0', 1, 'item', '00000000-0000-0000-0000-0000000100c0', 1, 100);
select erp_post_document('00000000-0000-0000-0000-0000000100a0');
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000100a1', 'I', '2026-09-02', '00000000-0000-0000-0000-00000000b001', (select wh from ids)),
  ('00000000-0000-0000-0000-0000000100a2', 'I', '2026-09-02', '00000000-0000-0000-0000-00000000b001', (select wh from ids));
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000000100a1', 1, 'item', '00000000-0000-0000-0000-0000000100c0', 1, 100, '00000000-0000-0000-0000-0000000100f0'),
  ('00000000-0000-0000-0000-0000000100a2', 1, 'item', '00000000-0000-0000-0000-0000000100c0', 1, 100, '00000000-0000-0000-0000-0000000100f0');

-- R2／R3／R6：I 10 → S 4（已過帳）→ SR 草稿退 4
do $$
declare r int; t text; wh uuid := (select wh from ids);
begin
  foreach r in array array[2, 3, 6] loop
    t := lpad(r::text, 8, '0');
    insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
      (('00000000-0000-0000-0000-' || t || '00a0')::uuid, 'I', '2026-09-01', '00000000-0000-0000-0000-00000000b001', wh);
    insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price) values
      (('00000000-0000-0000-0000-' || t || '00a0')::uuid, 1, 'item', ('00000000-0000-0000-0000-' || t || '00c0')::uuid, 10, 100);
    perform erp_post_document(('00000000-0000-0000-0000-' || t || '00a0')::uuid);
    insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
      (('00000000-0000-0000-0000-' || t || '00a1')::uuid, 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d001', wh);
    insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
      (('00000000-0000-0000-0000-' || t || '00f1')::uuid, ('00000000-0000-0000-0000-' || t || '00a1')::uuid, 1, 'item',
       ('00000000-0000-0000-0000-' || t || '00c0')::uuid, 4, 500);
    perform erp_post_document(('00000000-0000-0000-0000-' || t || '00a1')::uuid);
    insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id) values
      (('00000000-0000-0000-0000-' || t || '00a2')::uuid, 'SR', '2026-09-03', '00000000-0000-0000-0000-00000000d001', wh,
       ('00000000-0000-0000-0000-' || t || '00a1')::uuid),
      (('00000000-0000-0000-0000-' || t || '00a3')::uuid, 'SR', '2026-09-03', '00000000-0000-0000-0000-00000000d001', wh,
       ('00000000-0000-0000-0000-' || t || '00a1')::uuid);
    insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
      (('00000000-0000-0000-0000-' || t || '00a2')::uuid, 1, 'item', ('00000000-0000-0000-0000-' || t || '00c0')::uuid, 4, 500,
       ('00000000-0000-0000-0000-' || t || '00f1')::uuid),
      (('00000000-0000-0000-0000-' || t || '00a3')::uuid, 1, 'item', ('00000000-0000-0000-0000-' || t || '00c0')::uuid, 4, 500,
       ('00000000-0000-0000-0000-' || t || '00f1')::uuid);
  end loop;
end $$;

-- R4：P 5（已過帳）→ I 草稿收 5
insert into erp_documents (id, doc_type, doc_date, vendor_id) values
  ('00000000-0000-0000-0000-0000000400a0', 'P', '2026-09-01', '00000000-0000-0000-0000-00000000b001');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000400f0', '00000000-0000-0000-0000-0000000400a0', 1, 'item', '00000000-0000-0000-0000-0000000400c0', 5, 100);
select erp_post_document('00000000-0000-0000-0000-0000000400a0');
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id) values
  ('00000000-0000-0000-0000-0000000400a1', 'I', '2026-09-02', '00000000-0000-0000-0000-00000000b001', (select wh from ids), '00000000-0000-0000-0000-0000000400a0');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000000400a1', 1, 'item', '00000000-0000-0000-0000-0000000400c0', 5, 100, '00000000-0000-0000-0000-0000000400f0');

-- R5：I 5（已過帳）→ PR 草稿退 2
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000500a0', 'I', '2026-09-01', '00000000-0000-0000-0000-00000000b001', (select wh from ids));
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000500f0', '00000000-0000-0000-0000-0000000500a0', 1, 'item', '00000000-0000-0000-0000-0000000500c0', 5, 100);
select erp_post_document('00000000-0000-0000-0000-0000000500a0');
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id, source_doc_id) values
  ('00000000-0000-0000-0000-0000000500a1', 'PR', '2026-09-02', '00000000-0000-0000-0000-00000000b001', (select wh from ids), '00000000-0000-0000-0000-0000000500a0');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000000500a1', 1, 'item', '00000000-0000-0000-0000-0000000500c0', 2, 100, '00000000-0000-0000-0000-0000000500f0');

-- R7：I 機台 R7-001 → S 售出（自動建立保養卡機台）
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000700a0', 'I', '2026-09-01', '00000000-0000-0000-0000-00000000b001', (select wh from ids));
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, serial_nos) values
  ('00000000-0000-0000-0000-0000000700a0', 1, 'item', '00000000-0000-0000-0000-0000000700c0', 1, 1000, array['R7-001']);
select erp_post_document('00000000-0000-0000-0000-0000000700a0');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000700a1', 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d001', (select wh from ids));
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000700f1', '00000000-0000-0000-0000-0000000700a1', 1, 'item', '00000000-0000-0000-0000-0000000700c0', 1, 2000);
insert into erp_document_line_serials (line_id, serial_id)
  select '00000000-0000-0000-0000-0000000700f1', id from erp_serials where serial_no = 'R7-001';
select erp_post_document('00000000-0000-0000-0000-0000000700a1');
SQL

FAILS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1" >&2; FAILS=$((FAILS + 1)); }
expect_eq() { # $1 描述 $2 實際 $3 預期
  if [ "$2" = "$3" ]; then pass "$1（$2）"; else fail "$1：預期 $3，實際 $2"; fi
}
expect_grep() { # $1 描述 $2 文字 $3 pattern
  if printf '%s' "$2" | grep -q -- "$3"; then pass "$1"; else fail "$1：輸出未含「$3」：$(printf '%s' "$2" | tr '\n' ' ')"; fi
}
expect_no_error() { # $1 描述 $2 文字
  if printf '%s' "$2" | grep -q "ERROR"; then fail "$1：$(printf '%s' "$2" | tr '\n' ' ')"; else pass "$1"; fi
}

# race <A 的 SQL> <B 的 SQL>：A 在交易內執行後 pg_sleep 持鎖；A 進入 sleep 後才跑 B。結果存 OUT_A／OUT_B。
race() {
  local a_sql="$1" b_sql="$2" a_file="$TMP/a.out"
  printf '%s\n' "set application_name = 'erp_race_a';" "$AUTH" "begin;" "$a_sql" "select pg_sleep($HOLD);" "commit;" \
    | q >"$a_file" 2>&1 &
  local a_pid=$!
  local ready=0
  for _ in $(seq 1 100); do
    if [ "$(val "select count(*) from pg_stat_activity where application_name = 'erp_race_a' and state = 'active' and query like 'select pg_sleep%'")" = "1" ]; then
      ready=1
      break
    fi
    sleep 0.1
  done
  [ "$ready" = 1 ] || echo "  WARN  session A 未進入 sleep（可能已失敗）"
  OUT_B="$(printf '%s\n' "$AUTH" "$b_sql" | q 2>&1)" || true
  wait "$a_pid" || true
  OUT_A="$(cat "$a_file")"
}

doc_status() { val "select status from erp_documents where id = '$1'"; }
stock() { val "select coalesce(sum(qty), 0)::int from erp_stock_levels where item_id = '$1'"; }

echo "== R1（#3）兩張進貨單同時收同一採購行（採購 1、各收 1）"
race "select erp_post_document('00000000-0000-0000-0000-0000000100a1');" \
     "select erp_post_document('00000000-0000-0000-0000-0000000100a2');"
expect_no_error "A 進貨過帳成功" "$OUT_A"
expect_grep "B 進貨過帳 over_receipt" "$OUT_B" "ERROR:  over_receipt"
expect_eq "採購行累計已收" "$(val "select sum(l.qty)::int from erp_document_lines l join erp_documents d on d.id = l.document_id where l.source_line_id = '00000000-0000-0000-0000-0000000100f0' and d.status = 'posted'")" "1"
expect_eq "R1 存量" "$(stock 00000000-0000-0000-0000-0000000100c0)" "1"

echo "== R2（#4）先作廢銷貨單，同時過帳引用它的銷退單"
race "select erp_void_document('00000000-0000-0000-0000-0000000200a1', 'race');" \
     "select erp_post_document('00000000-0000-0000-0000-0000000200a2');"
expect_no_error "A 作廢銷貨成功" "$OUT_A"
expect_grep "B 銷退過帳被拒（來源已作廢）" "$OUT_B" "ERROR:  validation"
expect_eq "S 狀態" "$(doc_status 00000000-0000-0000-0000-0000000200a1)" "voided"
expect_eq "SR 狀態" "$(doc_status 00000000-0000-0000-0000-0000000200a2)" "draft"
expect_eq "R2 存量（10 − 4 + 4）" "$(stock 00000000-0000-0000-0000-0000000200c0)" "10"

echo "== R3（#4）先過帳銷退單，同時作廢其來源銷貨單"
race "select erp_post_document('00000000-0000-0000-0000-0000000300a2');" \
     "select erp_void_document('00000000-0000-0000-0000-0000000300a1', 'race');"
expect_no_error "A 銷退過帳成功" "$OUT_A"
expect_grep "B 作廢銷貨 has_dependents" "$OUT_B" "ERROR:  has_dependents"
expect_eq "S 狀態" "$(doc_status 00000000-0000-0000-0000-0000000300a1)" "posted"
expect_eq "SR 狀態" "$(doc_status 00000000-0000-0000-0000-0000000300a2)" "posted"
expect_eq "R3 存量（10 − 4 + 4）" "$(stock 00000000-0000-0000-0000-0000000300c0)" "10"

echo "== R4（#4）先作廢採購單，同時過帳引用它的進貨單"
race "select erp_void_document('00000000-0000-0000-0000-0000000400a0', 'race');" \
     "select erp_post_document('00000000-0000-0000-0000-0000000400a1');"
expect_no_error "A 作廢採購成功" "$OUT_A"
expect_grep "B 進貨過帳被拒（來源已作廢）" "$OUT_B" "ERROR:  validation"
expect_eq "I 狀態" "$(doc_status 00000000-0000-0000-0000-0000000400a1)" "draft"
expect_eq "R4 存量" "$(stock 00000000-0000-0000-0000-0000000400c0)" "0"

echo "== R5（#4）先過帳進退單，同時作廢其來源進貨單"
race "select erp_post_document('00000000-0000-0000-0000-0000000500a1');" \
     "select erp_void_document('00000000-0000-0000-0000-0000000500a0', 'race');"
expect_no_error "A 進退過帳成功" "$OUT_A"
expect_grep "B 作廢進貨 has_dependents" "$OUT_B" "ERROR:  has_dependents"
expect_eq "I 狀態" "$(doc_status 00000000-0000-0000-0000-0000000500a0)" "posted"
expect_eq "R5 存量（5 − 2）" "$(stock 00000000-0000-0000-0000-0000000500c0)" "3"

echo "== R6（#3）兩張銷退單同時退同一銷貨行（售 4、各退 4）"
race "select erp_post_document('00000000-0000-0000-0000-0000000600a2');" \
     "select erp_post_document('00000000-0000-0000-0000-0000000600a3');"
expect_no_error "A 銷退過帳成功" "$OUT_A"
expect_grep "B 銷退過帳超退被拒" "$OUT_B" "ERROR:  validation"
expect_eq "已過帳銷退數" "$(val "select count(*) from erp_documents where id in ('00000000-0000-0000-0000-0000000600a2','00000000-0000-0000-0000-0000000600a3') and status = 'posted'")" "1"
expect_eq "R6 存量（10 − 4 + 4）" "$(stock 00000000-0000-0000-0000-0000000600c0)" "10"

echo "== R7（#5）先新增保養紀錄，同時作廢建立該機台的銷貨單"
race "insert into mx_records (machine_id, service_date, note) select mx_machine_id, current_date, 'race' from erp_serials where serial_no = 'R7-001';" \
     "select erp_void_document('00000000-0000-0000-0000-0000000700a1', 'race');"
expect_no_error "A 新增保養紀錄成功" "$OUT_A"
expect_no_error "B 作廢銷貨成功" "$OUT_B"
expect_grep "B 回傳保留機台警告" "$OUT_B" "保養紀錄"
expect_eq "保養卡機台仍存在" "$(val "select count(*) from mx_machines where serial_no = 'R7-001'")" "1"
expect_eq "保養紀錄未被 cascade 刪除" "$(val "select count(*) from mx_records where note = 'race'")" "1"

if [ "$FAILS" -ne 0 ]; then
  echo "==> ERP CONCURRENCY TESTS FAILED（$FAILS 項）" >&2
  exit 1
fi
echo "==> ALL ERP CONCURRENCY TESTS PASSED"
