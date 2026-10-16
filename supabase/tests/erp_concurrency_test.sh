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

-- R8（#233）：S 兩行各 1 × 1,000、折扣 −1,000 → 明細合計 1,000；兩張銷退草稿各退不同行 1,000
insert into erp_items (id, code, name, kind, track_serial, track_stock, mx_card_type) values
  ('00000000-0000-0000-0000-0000000801c0', 'R8A', 'r8a', 'part', false, true, null),
  ('00000000-0000-0000-0000-0000000802c0', 'R8B', 'r8b', 'part', false, true, null);
insert into erp_documents (id, doc_type, doc_date, vendor_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000800a0', 'I', '2026-09-01', '00000000-0000-0000-0000-00000000b001', (select wh from ids));
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000800a0', 1, 'item', '00000000-0000-0000-0000-0000000801c0', 5, 100),
  ('00000000-0000-0000-0000-0000000800a0', 2, 'item', '00000000-0000-0000-0000-0000000802c0', 5, 100);
select erp_post_document('00000000-0000-0000-0000-0000000800a0');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id) values
  ('00000000-0000-0000-0000-0000000800a1', 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d001', (select wh from ids));
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price, amount) values
  ('00000000-0000-0000-0000-0000000801f1', '00000000-0000-0000-0000-0000000800a1', 1, 'item', '00000000-0000-0000-0000-0000000801c0', 1, 1000, 0),
  ('00000000-0000-0000-0000-0000000802f1', '00000000-0000-0000-0000-0000000800a1', 2, 'item', '00000000-0000-0000-0000-0000000802c0', 1, 1000, 0),
  ('00000000-0000-0000-0000-0000000803f1', '00000000-0000-0000-0000-0000000800a1', 3, 'discount', null, 0, 0, -1000);
select erp_post_document('00000000-0000-0000-0000-0000000800a1');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id) values
  ('00000000-0000-0000-0000-0000000800a2', 'SR', '2026-09-03', '00000000-0000-0000-0000-00000000d001', (select wh from ids), '00000000-0000-0000-0000-0000000800a1'),
  ('00000000-0000-0000-0000-0000000800a3', 'SR', '2026-09-03', '00000000-0000-0000-0000-00000000d001', (select wh from ids), '00000000-0000-0000-0000-0000000800a1');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000000800a2', 1, 'item', '00000000-0000-0000-0000-0000000801c0', 1, 1000, '00000000-0000-0000-0000-0000000801f1'),
  ('00000000-0000-0000-0000-0000000800a3', 1, 'item', '00000000-0000-0000-0000-0000000802c0', 1, 1000, '00000000-0000-0000-0000-0000000802f1');

-- R9／R10（#249）：各一位客戶，預收 1,000（收款不沖銷）
insert into mx_customers (id, name) values
  ('00000000-0000-0000-0000-00000000d009', 'C9'),
  ('00000000-0000-0000-0000-00000000d010', 'C10');
select erp_post_payment('{"direction":"in","pay_date":"2026-09-01","customer_id":"00000000-0000-0000-0000-00000000d009","method":"cash","amount":1000}');
select erp_post_payment('{"direction":"in","pay_date":"2026-09-01","customer_id":"00000000-0000-0000-0000-00000000d010","method":"cash","amount":1000}');

-- R11／R12（#249 review）：客戶預收 1,000（收款不沖銷）＋ 未收銷貨 800、500（服務品項，不動庫存）
--   ＋ 銷退全退第二張銷貨 500（SR 未沖，−500）。#253 起退款上限 = 預收 − 未結應收淨額：
--   未結應收淨額 = 800 + 500 − 500 = 800；沖掉 800 後為 0，上限回到預收，R11／R12 仍驗證同一筆預收不可超領。
insert into mx_customers (id, name) values ('00000000-0000-0000-0000-00000000d011', 'C11');
insert into erp_items (id, code, name, kind, track_serial, track_stock) values
  ('00000000-0000-0000-0000-0000001100c0', 'R11', 'r11', 'service', false, false);
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-0000001100a1', 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d011', (select wh from ids), 'exempt'),
  ('00000000-0000-0000-0000-0000001100a2', 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d011', (select wh from ids), 'exempt');
insert into erp_document_lines (id, document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000001100f1', '00000000-0000-0000-0000-0000001100a1', 1, 'item', '00000000-0000-0000-0000-0000001100c0', 1, 800),
  ('00000000-0000-0000-0000-0000001100f2', '00000000-0000-0000-0000-0000001100a2', 1, 'item', '00000000-0000-0000-0000-0000001100c0', 1, 500);
select erp_post_document('00000000-0000-0000-0000-0000001100a1');
select erp_post_document('00000000-0000-0000-0000-0000001100a2');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, source_doc_id, tax_type) values
  ('00000000-0000-0000-0000-0000001100a3', 'SR', '2026-09-03', '00000000-0000-0000-0000-00000000d011', (select wh from ids),
   '00000000-0000-0000-0000-0000001100a2', 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price, source_line_id) values
  ('00000000-0000-0000-0000-0000001100a3', 1, 'item', '00000000-0000-0000-0000-0000001100c0', 1, 500, '00000000-0000-0000-0000-0000001100f2');
select erp_post_document('00000000-0000-0000-0000-0000001100a3');
select erp_post_payment('{"direction":"in","pay_date":"2026-09-01","customer_id":"00000000-0000-0000-0000-00000000d011","method":"cash","amount":1000}');

-- R13–R17（#253 退款上限）：服務品項 R11；各一位客戶
--   R13／R14：銷貨 1,000 已由收款 P1 1,000 沖清，另收預收 P2 500 → 未結應收 0、預收 500、上限 500
--   R15／R16：預收 1,000，銷貨 600 草稿（未過帳）
--   R17：預收 1,000，銷貨 600 已過帳未收 → 上限 400
insert into mx_customers (id, name) values
  ('00000000-0000-0000-0000-00000000d013', 'C13'), ('00000000-0000-0000-0000-00000000d014', 'C14'),
  ('00000000-0000-0000-0000-00000000d015', 'C15'), ('00000000-0000-0000-0000-00000000d016', 'C16'),
  ('00000000-0000-0000-0000-00000000d017', 'C17');
do $$
declare r int; t text; c uuid; wh uuid := (select wh from ids);
begin
  foreach r in array array[13, 14, 15, 16, 17] loop
    t := lpad(r::text, 8, '0');
    c := ('00000000-0000-0000-0000-00000000d0' || r::text)::uuid;
    insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
      (('00000000-0000-0000-0000-' || t || '00a1')::uuid, 'S', '2026-09-02', c, wh, 'exempt');
    insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price) values
      (('00000000-0000-0000-0000-' || t || '00a1')::uuid, 1, 'item', '00000000-0000-0000-0000-0000001100c0', 1,
       case when r in (13, 14) then 1000 else 600 end);
    if r in (13, 14) then
      perform erp_post_document(('00000000-0000-0000-0000-' || t || '00a1')::uuid);
      perform erp_post_payment(jsonb_build_object('direction', 'in', 'pay_date', '2026-09-03', 'customer_id', c,
        'method', 'transfer', 'amount', 1000,
        'allocations', jsonb_build_array(jsonb_build_object('document_id', '00000000-0000-0000-0000-' || t || '00a1', 'amount', 1000))));
      perform erp_post_payment(jsonb_build_object('direction', 'in', 'pay_date', '2026-09-04', 'customer_id', c,
        'method', 'cash', 'amount', 500));
    else
      if r = 17 then
        perform erp_post_document(('00000000-0000-0000-0000-' || t || '00a1')::uuid);
      end if;
      perform erp_post_payment(jsonb_build_object('direction', 'in', 'pay_date', '2026-09-01', 'customer_id', c,
        'method', 'cash', 'amount', 1000));
    end if;
  end loop;
end $$;

-- R18／R19（#253 review：退款鎖定後才提交的新收款）：各一位客戶，預收 P1 2,000（2026-09-05，不沖銷）
--   R18 另有銷貨 500 已過帳未收（未結應收 500 → 上限 1,500）；R19 無單據。
insert into mx_customers (id, name) values
  ('00000000-0000-0000-0000-00000000d018', 'C18'), ('00000000-0000-0000-0000-00000000d019', 'C19');
insert into erp_documents (id, doc_type, doc_date, customer_id, warehouse_id, tax_type) values
  ('00000000-0000-0000-0000-0000001800a1', 'S', '2026-09-02', '00000000-0000-0000-0000-00000000d018', (select wh from ids), 'exempt');
insert into erp_document_lines (document_id, line_no, line_type, item_id, qty, unit_price) values
  ('00000000-0000-0000-0000-0000001800a1', 1, 'item', '00000000-0000-0000-0000-0000001100c0', 1, 500);
select erp_post_document('00000000-0000-0000-0000-0000001800a1');
select erp_post_payment('{"direction":"in","pay_date":"2026-09-05","customer_id":"00000000-0000-0000-0000-00000000d018","method":"cash","amount":2000}');
select erp_post_payment('{"direction":"in","pay_date":"2026-09-05","customer_id":"00000000-0000-0000-0000-00000000d019","method":"cash","amount":2000}');
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

echo "== R8（#233）兩張銷退單同時退同一銷貨單的不同行，各自未超過、合計超過原單金額"
race "select erp_post_document('00000000-0000-0000-0000-0000000800a2');" \
     "select erp_post_document('00000000-0000-0000-0000-0000000800a3');"
expect_no_error "A 銷退過帳成功" "$OUT_A"
expect_grep "B 銷退過帳累計金額超過被拒" "$OUT_B" "累計銷退金額"
expect_eq "已過帳銷退數" "$(val "select count(*) from erp_documents where id in ('00000000-0000-0000-0000-0000000800a2','00000000-0000-0000-0000-0000000800a3') and status = 'posted'")" "1"

# B 用不同月份：避開同一取號列（erp_doc_sequences）的鎖，才能驗證退款本身的 for update 鎖
echo "== R9（#249）兩張退款單同時從同一客戶預收退款（預收 1,000、各退 800）"
race "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"2026-09-10\",\"customer_id\":\"00000000-0000-0000-0000-00000000d009\",\"method\":\"transfer\",\"amount\":800}');" \
     "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"2026-10-10\",\"customer_id\":\"00000000-0000-0000-0000-00000000d009\",\"method\":\"cash\",\"amount\":800}');"
expect_no_error "A 退款過帳成功" "$OUT_A"
expect_grep "B 退款超過預收被拒" "$OUT_B" "ERROR:  over_allocation"
expect_eq "已過帳退款數" "$(val "select count(*) from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d009' and kind = 'refund' and status = 'posted'")" "1"
expect_eq "R9 剩餘預收" "$(val "select unallocated::int from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d009'")" "200"

echo "== R10（#249）先退款（動用預收），同時作廢該預收的收款"
R10_PAY="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d010' and kind = 'payment'")"
race "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"2026-09-10\",\"customer_id\":\"00000000-0000-0000-0000-00000000d010\",\"method\":\"transfer\",\"amount\":500}');" \
     "select erp_void_payment('$R10_PAY', 'race');"
expect_no_error "A 退款過帳成功" "$OUT_A"
expect_grep "B 作廢收款 has_dependents" "$OUT_B" "ERROR:  has_dependents"
expect_eq "收款仍 posted" "$(val "select status from erp_payments where id = '$R10_PAY'")" "posted"
expect_eq "R10 剩餘預收" "$(val "select unallocated::int from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d010'")" "500"

echo "== R11（#249 review）同一筆預收：補沖銷 800 與退款 800 同時（預收 1,000，不可超領）"
R11_PAY="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d011' and kind = 'payment'")"
race "select erp_allocate_payment('$R11_PAY', '[{\"document_id\":\"00000000-0000-0000-0000-0000001100a1\",\"amount\":800}]');" \
     "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"2026-09-10\",\"customer_id\":\"00000000-0000-0000-0000-00000000d011\",\"method\":\"transfer\",\"amount\":800}');"
expect_no_error "A 補沖銷成功" "$OUT_A"
expect_grep "B 退款超過剩餘預收被拒" "$OUT_B" "ERROR:  over_allocation"
expect_eq "R11 剩餘預收" "$(val "select unallocated::int from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d011'")" "200"

echo "== R12（#249 review）反向：先退款 200（用完剩餘預收），同時補沖銷另一張銷貨 200"
race "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"2026-09-11\",\"customer_id\":\"00000000-0000-0000-0000-00000000d011\",\"method\":\"cash\",\"amount\":200}');" \
     "select erp_allocate_payment('$R11_PAY', '[{\"document_id\":\"00000000-0000-0000-0000-0000001100a2\",\"amount\":200}]');"
expect_no_error "A 退款 200（用完預收）成功" "$OUT_A"
expect_grep "B 補沖銷超過剩餘預收被拒" "$OUT_B" "ERROR:  over_allocation"
expect_eq "R12 剩餘預收" "$(val "select unallocated::int from erp_party_balances where party_type = 'customer' and party_id = '00000000-0000-0000-0000-00000000d011'")" "0"
expect_eq "R12 第二張銷貨仍未沖" "$(val "select outstanding::int from erp_document_balances where document_id = '00000000-0000-0000-0000-0000001100a2'")" "500"

# ── #253 退款上限（0030）：退款只鎖該對象的收付款、不鎖單據（分析見 0030 檔頭「鎖」）──
party_bal() { val "select balance::int || '/' || unallocated::int from erp_party_balances where party_type = 'customer' and party_id = '$1'"; }
refund_sql() { # $1 客戶 id 尾碼 $2 日期 $3 金額
  printf '%s' "select erp_post_refund('{\"direction\":\"in\",\"pay_date\":\"$2\",\"customer_id\":\"00000000-0000-0000-0000-00000000d0$1\",\"method\":\"transfer\",\"amount\":$3}');"
}
# B 以 DO block 執行並回報耗時（client_min_messages = warning 才看得到）
timed() { printf '%s' "do \$t\$ declare t0 timestamptz := clock_timestamp(); begin perform $1; raise warning 'B_ELAPSED=%', round(extract(epoch from clock_timestamp() - t0)::numeric, 1); end \$t\$;"; }

echo "== R13（#253 D1）先作廢已沖銷的原收款（應收回升 1,000），同時退款 500（作廢前上限 500）"
R13_P1="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d013' and amount = 1000")"
race "select erp_void_payment('$R13_P1', 'race');" "$(refund_sql 13 2026-09-10 500)"
expect_no_error "A 作廢原收款成功" "$OUT_A"
expect_grep "B 退款等鎖後看到應收回升，被上限擋下" "$OUT_B" "ERROR:  validation"
expect_grep "B 訊息含可退上限 0" "$OUT_B" "可退上限 0.00"
expect_eq "R13 未過帳退款" "$(val "select count(*) from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d013' and kind = 'refund'")" "0"
expect_eq "R13 應收／預收" "$(party_bal 00000000-0000-0000-0000-00000000d013)" "1000/500"

echo "== R14（#253）反向：先退款 500（用完上限），同時作廢已沖銷的原收款"
R14_P1="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d014' and amount = 1000")"
race "$(refund_sql 14 2026-09-10 500)" "select erp_void_payment('$R14_P1', 'race');"
expect_no_error "A 退款成功" "$OUT_A"
expect_no_error "B 作廢原收款等鎖後成功（先退款、後作廢的合法順序）" "$OUT_B"
expect_eq "R14 應收／預收" "$(party_bal 00000000-0000-0000-0000-00000000d014)" "1000/0"

echo "== R15（#253）先退款 1,000（未結應收 0），同時過帳新銷貨 600：銷貨不需等退款"
race "$(refund_sql 15 2026-09-10 1000)" "$(timed "erp_post_document('00000000-0000-0000-0000-0000001500a1')")"
expect_no_error "A 退款成功" "$OUT_A"
expect_no_error "B 銷貨過帳成功" "$OUT_B"
expect_grep "B 未等待 A（不鎖單據）" "$OUT_B" "B_ELAPSED=0\."
expect_eq "R15 應收／預收（= 先退款、後銷貨）" "$(party_bal 00000000-0000-0000-0000-00000000d015)" "600/0"

echo "== R16（#253）先過帳新銷貨 600（未提交），同時退款 1,000：退款看不到未提交的銷貨、不等待"
race "select erp_post_document('00000000-0000-0000-0000-0000001600a1');" "$(timed "$(refund_sql 16 2026-09-10 1000 | sed -e 's/^select //' -e 's/;$//')")"
expect_no_error "A 銷貨過帳成功" "$OUT_A"
expect_no_error "B 退款成功" "$OUT_B"
expect_grep "B 未等待 A" "$OUT_B" "B_ELAPSED=0\."
expect_eq "R16 應收／預收（= 先退款、後銷貨的序列順序）" "$(party_bal 00000000-0000-0000-0000-00000000d016)" "600/0"

echo "== R17（#253）先補沖銷 600（預收 1,000 → 400、應收 600 → 0），同時退款 500（補沖銷前上限 400）"
R17_PAY="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d017' and kind = 'payment'")"
race "select erp_allocate_payment('$R17_PAY', '[{\"document_id\":\"00000000-0000-0000-0000-0000001700a1\",\"amount\":600}]');" \
     "$(refund_sql 17 2026-09-10 500)"
expect_no_error "A 補沖銷成功" "$OUT_A"
expect_grep "B 退款等鎖後以新餘額檢查（超過預收 400 → over_allocation）" "$OUT_B" "ERROR:  over_allocation"
OUT_C="$(printf '%s\n' "$AUTH" "$(refund_sql 17 2026-09-10 400)" | q 2>&1)" || true
expect_no_error "之後退款 400 成功" "$OUT_C"
expect_eq "R17 應收／預收" "$(party_bal 00000000-0000-0000-0000-00000000d017)" "0/0"

# ── #253 review：退款鎖定收付款「之後」才提交的新收款 ──
# 退款 A 鎖完該客戶的收付款、算完上限後，在取號（erp_doc_sequences 的 RF 列）被 S0 擋住；
# 期間 B 提交一張日期較早的新收款 P_new（不在 A 的鎖集合內），C 開交易對 P_new 補沖銷／作廢並持鎖；
# 放行 A 後，A 的 FIFO 若讀到 P_new（READ COMMITTED 每句新快照），會以 C 未提交前的餘額扣減 P_new。
# 預期：退款只從已鎖定的收付款扣減，P_new 不被動用、任何收付款的 unallocated 都不為負。
wait_for() { # $1 條件 SQL（回傳 t 即成立）
  for _ in $(seq 1 100); do
    [ "$(val "$1")" = "t" ] && return 0
    sleep 0.1
  done
  return 1
}
pay_avail_sql() { # $1 客戶 id：每張有效收款的 unallocated（金額 − 沖銷 − 被退款），逗號分隔、依日期
  printf '%s' "select string_agg((p.amount
      - coalesce((select sum(a.amount) from erp_payment_allocations a where a.payment_id = p.id), 0)
      - coalesce((select sum(rs.amount) from erp_refund_sources rs join erp_payments r on r.id = rs.refund_id and r.status = 'posted'
                   where rs.source_payment_id = p.id), 0))::int::text, ',' order by p.pay_date, p.doc_no)
    from erp_payments p where p.customer_id = '$1' and p.kind = 'payment' and p.status = 'posted'"
}
# late_payment_race <客戶尾碼> <C 的 SQL（:NEW 代入新收款 id）>：結果存 OUT_A（退款）、OUT_C、NEW_PAY
late_payment_race() {
  local cust="$1" c_sql="$2"
  val "insert into erp_doc_sequences (prefix, period, last_no) values ('RF', '11511', 0) on conflict do nothing" >/dev/null
  printf '%s\n' "set application_name = 'erp_race_s0';" "begin;" \
    "select 1 from erp_doc_sequences where prefix = 'RF' and period = '11511' for update;" \
    "select pg_sleep(60);" "commit;" | q >"$TMP/s0.out" 2>&1 &
  local s0_pid=$!
  wait_for "select count(*) = 1 from pg_stat_activity where application_name = 'erp_race_s0' and query like 'select pg_sleep%'" \
    || echo "  WARN  S0 未進入 sleep"
  printf '%s\n' "set application_name = 'erp_race_a';" "$AUTH" "$(refund_sql "$cust" 2026-11-10 1000)" \
    | q >"$TMP/a.out" 2>&1 &
  local a_pid=$!
  wait_for "select count(*) = 1 from pg_stat_activity where application_name = 'erp_race_a' and wait_event_type = 'Lock'" \
    || echo "  WARN  退款 A 未在取號處等待"
  printf '%s\n' "$AUTH" \
    "select erp_post_payment('{\"direction\":\"in\",\"pay_date\":\"2026-09-01\",\"customer_id\":\"00000000-0000-0000-0000-00000000d0$cust\",\"method\":\"cash\",\"amount\":500}');" \
    | q >/dev/null 2>&1
  NEW_PAY="$(val "select id from erp_payments where customer_id = '00000000-0000-0000-0000-00000000d0$cust' and pay_date = '2026-09-01'")"
  printf '%s\n' "set application_name = 'erp_race_c';" "$AUTH" "begin;" "${c_sql//:NEW/$NEW_PAY}" \
    "select pg_sleep($HOLD);" "commit;" | q >"$TMP/c.out" 2>&1 &
  local c_pid=$!
  wait_for "select count(*) = 1 from pg_stat_activity where application_name = 'erp_race_c' and query like 'select pg_sleep%'" \
    || echo "  WARN  C 未進入 sleep（可能已失敗）"
  val "select pg_cancel_backend(pid) from pg_stat_activity where application_name = 'erp_race_s0'" >/dev/null
  wait "$s0_pid" || true
  wait "$c_pid" || true
  wait "$a_pid" || true
  OUT_A="$(cat "$TMP/a.out")"
  OUT_C="$(cat "$TMP/c.out")"
}

echo "== R18（#253 review）退款鎖定後才提交的新收款，同時被補沖銷：退款不得動用它"
late_payment_race 18 "select erp_allocate_payment(':NEW', '[{\"document_id\":\"00000000-0000-0000-0000-0000001800a1\",\"amount\":500}]');"
expect_no_error "A 退款 1,000 成功" "$OUT_A"
expect_no_error "C 補沖銷新收款成功" "$OUT_C"
expect_eq "R18 退款來源未含新收款" "$(val "select count(*) from erp_refund_sources where source_payment_id = '$NEW_PAY'")" "0"
expect_eq "R18 各收款 unallocated（新收款, P1）" "$(val "$(pay_avail_sql 00000000-0000-0000-0000-00000000d018)")" "0,1000"
expect_eq "R18 應收／預收" "$(party_bal 00000000-0000-0000-0000-00000000d018)" "0/1000"

echo "== R19（#253 review）退款鎖定後才提交的新收款，同時被作廢：退款不得扣自已作廢的收款"
late_payment_race 19 "select erp_void_payment(':NEW', 'race');"
expect_no_error "A 退款 1,000 成功" "$OUT_A"
expect_no_error "C 作廢新收款成功" "$OUT_C"
expect_eq "R19 退款來源未含已作廢收款" "$(val "select count(*) from erp_refund_sources where source_payment_id = '$NEW_PAY'")" "0"
expect_eq "R19 各收款 unallocated（P1）" "$(val "$(pay_avail_sql 00000000-0000-0000-0000-00000000d019)")" "1000"
expect_eq "R19 應收／預收" "$(party_bal 00000000-0000-0000-0000-00000000d019)" "0/1000"

if [ "$FAILS" -ne 0 ]; then
  echo "==> ERP CONCURRENCY TESTS FAILED（$FAILS 項）" >&2
  exit 1
fi
echo "==> ALL ERP CONCURRENCY TESTS PASSED"
