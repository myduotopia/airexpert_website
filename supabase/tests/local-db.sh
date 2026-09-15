#!/usr/bin/env bash
# 本機以 Docker 起一個拋棄式 Postgres 17，模擬 Supabase 基本環境後依序套用
# supabase/migrations/*.sql，再執行 supabase/tests/erp_posting_test.sql。
# 結束（成功或失敗）時自動移除容器。絕不連線正式 DB。
#
# 用法：bash supabase/tests/local-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${PG_IMAGE:-postgres:17-alpine}"
NAME="airexpert-erp-test-$$"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
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

psql_run() {
  # $1 = 顯示名稱；stdin = SQL
  docker exec -i "$NAME" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

echo "==> 建立 Supabase stub（roles / auth / storage / 預設權限）"
psql_run <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key,
  email text
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid;
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;

-- Supabase 預設：public schema 物件自動授權給 API 角色（RLS 再把關）
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL

for f in "$ROOT"/migrations/*.sql; do
  echo "==> 套用 $(basename "$f")"
  psql_run -1 < "$f"
done

echo "==> 重跑 0020（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0020_erp_foundation.sql"

echo "==> 執行 erp_posting_test.sql"
psql_run < "$ROOT/tests/erp_posting_test.sql"

echo "==> 確認 rollback 未留資料"
LEFT=$(docker exec "$NAME" psql -U postgres -tAc \
  "select (select count(*) from erp_documents) + (select count(*) from erp_items) + (select count(*) from auth.users)")
if [ "$LEFT" != "0" ]; then
  echo "FAIL：測試後仍殘留 $LEFT 列" >&2
  exit 1
fi

echo "==> ALL ERP TESTS PASSED"
