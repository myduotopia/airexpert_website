-- 0021_service_report.sql
-- 機台維護報告單地基（issue #191，spec：docs/superpowers/specs/2026-09-17-service-report-design.md §3.1、§4、§4.3、§4.4）
--   * 模組授權：admin_module_grants 模組檢查放寬為 ('erp','service_report')；seed 僅授權 office@airexpert.com.tw
--   * 資料表：sr_sequences（派工單號取號）、sr_reports（報告單，含表頭快照、回填結果、料件、列印／結案／作廢紀錄）
--   * RLS：sr_reports → has_module('service_report') 可 select / insert / update；
--          delete 僅限「草稿且從未列印」（作廢取代刪除）
--          sr_sequences → 用戶端完全不可存取，只由 security definer 的 sr_next_report_no 寫入
--   * mx_customers、mx_machines：另加 has_module('service_report') 的 select policy（只讀，供選取帶入）
--   * sr_next_report_no(date)：security definer、併發安全，格式 X + 民國年(3) + 月(2) + 流水號(≥3 位)
--   * 觸發器：已作廢的報告單不可再修改；created_by／created_at 不可變更
-- 依賴 0001（set_updated_at()）、0011（mx_customers／mx_machines）、0020（admin_module_grants、has_module）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（以 pooler 連線或 SQL Editor 貼上執行）。
-- 本檔設計為可重複執行：create table / index if not exists、create or replace function、
--   drop policy / trigger / constraint if exists 後再建立、seed 皆 on conflict do nothing。
--   （若之後改了表結構，重跑本檔不會補欄位；schema 調整請另開新 migration。）
--
-- 錯誤契約（沿用 0020 §9）：raise exception using errcode = 'P0001', message = '<code>', detail = '<中文訊息>'
--   code ∈ forbidden / validation / voided
--
-- 實作決策：
--   1. 0020 的模組檢查為欄位內 check，約束名稱由 Postgres 自動產生（admin_module_grants_module_check）。
--      為避免名稱不同而殘留舊約束，改以 pg_constraint 找出 admin_module_grants 上所有「引用 module 欄位的
--      check 約束」一併刪除，再建立具名的 admin_module_grants_module_check。
--   2. 狀態轉換（列印／結案／重新開啟／作廢）由 server action 以條件更新完成（spec §4.4）；
--      DB 僅做最小防線：作廢單唯讀（任何身分皆擋，含 service_role）、作廢需原因、不得改 created_by／created_at。
--   3. sr_sequences 啟用 RLS 且無任何 policy，並撤銷 anon／authenticated 全部權限；
--      sr_next_report_no 為 security definer（擁有者不受 RLS），第一行檢查 has_module 為唯一閘門。
--   4. 流水號 > 999 時自然變 4 位以上（lpad 會截斷過長字串，故 ≥ 1000 不經 lpad）。
--   5. parts 預設值 = spec §4.2 的 10 列（第 8、9 列品名空白），qty 皆為空字串。

-- ============================================================
-- 1) 模組授權：放寬模組檢查 + seed
-- ============================================================
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.admin_module_grants'::regclass
      and con.contype = 'c'
      and att.attname = 'module'
  loop
    execute format('alter table admin_module_grants drop constraint %I;', c.conname);
  end loop;
end $$;

alter table admin_module_grants add constraint admin_module_grants_module_check
  check (module in ('erp', 'service_report'));

-- seed：僅 office@airexpert.com.tw（帳號不存在時不插入任何列）
insert into admin_module_grants (user_id, module)
select id, 'service_report' from auth.users where lower(email) = 'office@airexpert.com.tw'
on conflict do nothing;

-- ============================================================
-- 2) 資料表
-- ============================================================
create table if not exists sr_sequences (
  period  text primary key,                    -- 民國年月，如 '11509'
  last_no int  not null default 0
);

create table if not exists sr_reports (
  id              uuid primary key default gen_random_uuid(),
  report_no       text not null,                        -- 派工單號，如 X11509009（正規化後唯一）
  report_date     date not null default current_date,   -- 維護日期
  time_slot       text check (time_slot in ('morning','noon','afternoon')),
  status          text not null default 'draft'
                  check (status in ('draft','printed','completed','voided')),

  customer_id     uuid references mx_customers(id) on delete set null,
  machine_id      uuid references mx_machines(id)  on delete set null,

  -- 表頭快照（列印用；改保養卡不影響舊單）
  header_code     text,                                 -- 左上代號，如 KK855-2
  customer_name   text,
  phone           text,
  tax_id          text,
  contact         text,                                 -- 聯絡人（含手機）
  address         text,
  equipment       text,                                 -- 設備，如「PUMA SP50VH5 50HP 空壓機」
  model           text,                                 -- 型號
  voltage         text,                                 -- 電壓
  serial_no       text,                                 -- 編號
  machine_state   text check (machine_state in ('running','standby')),
  service_items   text[] not null default '{}',         -- new_trial / routine / periodic / repair / other
  summary         text,                                 -- 修護記要及建議

  -- 回填結果（現場手寫 → 行政回填）
  results         jsonb not null default '{}'::jsonb,   -- spec §4.1
  parts           jsonb not null default
    '[{"no":1,"name":"螺旋專用油","qty":""},
      {"no":2,"name":"機油濾清器","qty":""},
      {"no":3,"name":"空氣濾清器(外)","qty":""},
      {"no":4,"name":"空氣濾清器(內)","qty":""},
      {"no":5,"name":"油氣分離器","qty":""},
      {"no":6,"name":"自動排水器","qty":""},
      {"no":7,"name":"過濾器濾蕊","qty":""},
      {"no":8,"name":"","qty":""},
      {"no":9,"name":"","qty":""},
      {"no":10,"name":"維護及保養工資","qty":""}]'::jsonb,   -- spec §4.2，固定 10 列
  suggestions     text[] not null default '{}',         -- transmission / motor / rotor
  technician      text,                                 -- 維護人員
  customer_signer text,                                 -- 客戶簽名人（回填）
  note            text,                                 -- 內部備註（不列印）

  print_count      int not null default 0 check (print_count >= 0),
  first_printed_at timestamptz,
  last_printed_at  timestamptz,
  completed_at     timestamptz,
  voided_at        timestamptz,
  void_reason      text,

  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 作廢需原因
  constraint sr_reports_void_reason_check
    check (status <> 'voided' or (void_reason is not null and btrim(void_reason) <> ''))
);
create unique index if not exists sr_reports_report_no_key on sr_reports (upper(btrim(report_no)));
create index if not exists sr_reports_date_idx     on sr_reports (report_date desc);
create index if not exists sr_reports_customer_idx on sr_reports (customer_id);
create index if not exists sr_reports_machine_idx  on sr_reports (machine_id);
create index if not exists sr_reports_status_idx   on sr_reports (status);

drop trigger if exists sr_reports_updated_at on sr_reports;
create trigger sr_reports_updated_at before update on sr_reports
  for each row execute function set_updated_at();

-- ============================================================
-- 3) 守門觸發器：作廢單唯讀；created_by／created_at 不可變更
-- ============================================================
create or replace function sr_guard_report()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'voided' then
    raise exception using errcode = 'P0001', message = 'voided',
      detail = '報告單已作廢，不可修改';
  end if;
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '不可變更建立者或建立時間';
  end if;
  return new;
end;
$$;
revoke execute on function sr_guard_report() from public, anon, authenticated;

drop trigger if exists sr_reports_guard on sr_reports;
create trigger sr_reports_guard before update on sr_reports
  for each row execute function sr_guard_report();

-- ============================================================
-- 4) RLS 與表權限
-- ============================================================
alter table sr_reports   enable row level security;
alter table sr_sequences enable row level security;

drop policy if exists "service_report select sr_reports" on sr_reports;
create policy "service_report select sr_reports" on sr_reports
  for select to authenticated using ((select has_module('service_report')));

drop policy if exists "service_report insert sr_reports" on sr_reports;
create policy "service_report insert sr_reports" on sr_reports
  for insert to authenticated with check ((select has_module('service_report')));

drop policy if exists "service_report update sr_reports" on sr_reports;
create policy "service_report update sr_reports" on sr_reports
  for update to authenticated
  using ((select has_module('service_report')))
  with check ((select has_module('service_report')));

-- 刪除僅限「草稿且從未列印」
drop policy if exists "service_report delete draft sr_reports" on sr_reports;
create policy "service_report delete draft sr_reports" on sr_reports
  for delete to authenticated
  using (status = 'draft' and print_count = 0 and (select has_module('service_report')));

-- sr_sequences：無任何 policy（fail-closed），只由 sr_next_report_no（definer）存取
revoke all on table sr_sequences from public, anon, authenticated;

revoke all on table sr_reports from anon;
revoke truncate, references, trigger on table sr_reports from public, authenticated;

-- mx_customers / mx_machines：service_report 只讀
drop policy if exists "service_report select mx_customers" on mx_customers;
create policy "service_report select mx_customers" on mx_customers
  for select to authenticated using ((select has_module('service_report')));

drop policy if exists "service_report select mx_machines" on mx_machines;
create policy "service_report select mx_machines" on mx_machines
  for select to authenticated using ((select has_module('service_report')));

-- ============================================================
-- 5) 取號：X + 民國年(3) + 月(2) + 流水號(3，超過 999 自然變 4 位)
-- ============================================================
create or replace function sr_next_report_no(p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text;
  v_no int;
begin
  if not has_module('service_report') then
    raise exception using errcode = 'P0001', message = 'forbidden',
      detail = '沒有機台維護報告單模組權限';
  end if;
  if p_date is null then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '取號需要維護日期';
  end if;

  v_period := lpad((extract(year from p_date)::int - 1911)::text, 3, '0')
              || to_char(p_date, 'MM');

  insert into sr_sequences as s (period, last_no)
  values (v_period, 1)
  on conflict (period) do update set last_no = s.last_no + 1
  returning s.last_no into v_no;

  return 'X' || v_period
         || case when v_no < 1000 then lpad(v_no::text, 3, '0') else v_no::text end;
end;
$$;
revoke execute on function sr_next_report_no(date) from public, anon;
grant execute on function sr_next_report_no(date) to authenticated;
