#!/usr/bin/env bash
# 本機以 Docker 起一個拋棄式 Postgres 17，模擬 Supabase 基本環境後依序套用
# supabase/migrations/*.sql，再依序執行 supabase/tests/erp_posting_test.sql、
# service_report_test.sql、service_plan_test.sql、employees_test.sql 與 employee_hr_test.sql。
# Vault（vault.decrypted_secrets）只在本機以資料表 + view 模擬，並放入「測試用」金鑰。
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

-- Supabase 預設把 pgcrypto 等 extension 裝在 extensions schema（0031 呼叫 extensions.pgp_sym_encrypt）
create schema extensions;

-- Supabase Vault 模擬（僅本機測試）：vault.decrypted_secrets 與 vault.create_secret()。
-- 與正式環境相同，API 角色（anon／authenticated／service_role）對 vault schema 沒有 usage。
create schema vault;
create table vault.secrets (
  id     uuid primary key default gen_random_uuid(),
  name   text unique,
  secret text not null
);
create view vault.decrypted_secrets as
  select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text) returns uuid
language sql as $$
  insert into vault.secrets (name, secret) values (new_name, new_secret) returning id;
$$;
-- 本機測試金鑰（明顯虛構，只存在於拋棄式容器）
select vault.create_secret('local-test-only-key-0000000000000000000000', 'employee_pii_key');

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

# 以下重跑在「已有 hr 授權與 office／manager／空角色員工」的狀態下進行：0031 之後重跑 0021／0027
# 不可因收窄的模組／角色檢查而失敗。資料全為虛構，重跑完即刪除（最後「確認 rollback 未留資料」會檢查）。
echo "==> 放入重跑用資料（hr 授權、新角色員工）"
psql_run <<'SQL'
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f0a1', 'rerun-test@example.invalid');
insert into admin_module_grants (user_id, module) values ('00000000-0000-0000-0000-00000000f0a1', 'hr');
insert into employees (id, name, roles) values
  ('00000000-0000-0000-0000-00000000f0b1', '重跑測試甲', '{office,manager}'),
  ('00000000-0000-0000-0000-00000000f0b2', '重跑測試乙', '{}');
SQL

echo "==> 重跑 0020（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0020_erp_foundation.sql"

echo "==> 重跑 0021（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0021_service_report.sql"

# 0022 會 create or replace sr_guard_report（擴充作廢單 FK set null 例外），
# 故重跑順序必須在 0021 之後，與正式 DB 的套用順序一致。
echo "==> 重跑 0022（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0022_service_plan.sql"

# 0023 會 create or replace erp_post_document；重跑 0020 會蓋回舊版，故需在其後重跑。
echo "==> 重跑 0023（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0023_quote_free_text_lines.sql"
echo "==> 重跑 0024（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0024_quote_line_item_text.sql"
# 0025 以 0024 為底 create or replace erp_post_document，需在 0024 之後重跑。
echo "==> 重跑 0025（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0025_quote_subtotal_lines.sql"
echo "==> 重跑 0026（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0026_customer_fax_recipient_email.sql"
# 0027 依賴 0020（has_module、erp_documents）、0021／0022（sr_reports），需在其後重跑。
echo "==> 重跑 0027（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0027_employees.sql"

# 0028 以 0025 為底 create or replace erp_post_document（銷退累計金額上限）；重跑 0020／0023–0025 會蓋回舊版，故需最後重跑。
echo "==> 重跑 0028（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0028_sales_return_amount_cap.sql"

# 0029 以 0020 為底 create or replace 收付款函式（erp_allocate_payment／erp_post_payment／erp_void_payment）、
# erp_next_doc_no 與 erp_party_balances；重跑 0020 會蓋回舊版，故需在 0020 之後、放最後重跑。
echo "==> 重跑 0029（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0029_payment_offset_refund.sql"

# 0030 以 0029 為底 create or replace erp_post_refund（退款上限 = 預收 − 未結應收）；重跑 0029 會蓋回舊版，故需最後重跑。
echo "==> 重跑 0030（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0030_refund_cap_open_receivable.sql"

# 0031 放寬 0021 的模組檢查與 0027 的角色檢查；0021／0027 的約束已同步為相同允許值。
echo "==> 重跑 0031（驗證可重複執行）"
psql_run -1 < "$ROOT/migrations/0031_employee_hr.sql"

echo "==> 移除重跑用資料"
psql_run <<'SQL'
delete from employees where id in ('00000000-0000-0000-0000-00000000f0b1', '00000000-0000-0000-0000-00000000f0b2');
delete from admin_module_grants where user_id = '00000000-0000-0000-0000-00000000f0a1';
delete from auth.users where id = '00000000-0000-0000-0000-00000000f0a1';
SQL

echo "==> 執行 erp_posting_test.sql"
psql_run < "$ROOT/tests/erp_posting_test.sql"

echo "==> 執行 service_report_test.sql"
psql_run < "$ROOT/tests/service_report_test.sql"

echo "==> 執行 service_plan_test.sql"
psql_run < "$ROOT/tests/service_plan_test.sql"

echo "==> 執行 employees_test.sql"
psql_run < "$ROOT/tests/employees_test.sql"

echo "==> 執行 employee_hr_test.sql"
psql_run < "$ROOT/tests/employee_hr_test.sql"

echo "==> 確認 rollback 未留資料"
LEFT=$(docker exec "$NAME" psql -U postgres -tAc \
  "select (select count(*) from erp_documents) + (select count(*) from erp_items) + (select count(*) from auth.users) + (select count(*) from sr_reports) + (select count(*) from sr_sequences) + (select count(*) from sr_service_plans) + (select count(*) from sr_service_plan_stages) + (select count(*) from sr_machine_plans) + (select count(*) from employees) + (select count(*) from employee_private) + (select count(*) from employee_private_access_log) + (select count(*) from admin_module_grants where module = 'hr')")
if [ "$LEFT" != "0" ]; then
  echo "FAIL：測試後仍殘留 $LEFT 列" >&2
  exit 1
fi

echo "==> ALL ERP + SERVICE REPORT + SERVICE PLAN + EMPLOYEES + HR TESTS PASSED"
