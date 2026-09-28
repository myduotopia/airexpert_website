-- 0022_service_plan.sql
-- 保養方案與到期提醒地基（issue #200，spec：docs/superpowers/specs/2026-09-29-service-plan-design.md §4、§4.1）
--   * 資料表：sr_service_plans（方案）、sr_service_plan_stages（階段＋料件）、sr_machine_plans（逐台指定，覆寫馬力比對）
--   * sr_reports 新增 plan_stage_id（on delete set null）＋ plan_stage_hours／plan_stage_label 快照與部分索引
--   * RLS：三張新表 → has_module('service_report') 可 select / insert / update / delete（方案為設定資料，允許刪除）
--          mx_records → 新增 has_module('service_report') 的 **select** policy（提醒與時數判定需要；既有 office policy 不動）
--   * sr_guard_report（0021）擴充：作廢單唯讀的 FK on delete set null 例外，加入 plan_stage_id
-- 依賴 0001（set_updated_at()）、0011（mx_machines／mx_records）、0020（has_module）、0021（sr_reports／sr_guard_report）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（以 pooler 連線或 SQL Editor 貼上執行）。
-- 本檔設計為可重複執行：create table / index if not exists、add column if not exists、
--   create or replace function、drop policy / trigger / constraint if exists 後再建立。
--   （若之後改了表結構，重跑本檔不會補欄位；schema 調整請另開新 migration。）
--
-- 實作決策：
--   1. parts 形狀驗證改用 **CHECK 約束**（非觸發器）：`check (sr_parts_valid(parts))`，
--      sr_parts_valid(jsonb) 為 immutable SQL 函式（CHECK 內不能直接寫子查詢，故包成函式）。
--      規則（最小驗證）：必須是 jsonb 陣列，且每個元素為物件並有非空白的 name；
--      qty／unit 不驗（沿用報告單 parts 的文字模型，允許空字串與「1桶」）。空陣列合法（預設值）。
--      表已存在時 create table if not exists 不會補約束，故約束以 drop … if exists → add 的方式單獨建立。
--   2. sr_service_plan_stages 的 (plan_id, hours) 唯一索引已可服務「依方案取階段、依時數排序」的查詢，
--      故不再另建 spec §4 所列的 sr_service_plan_stages_plan_idx（同鍵完全重複的次要索引）。
--   3. sr_machine_plans 另建 plan_id 索引：刪除方案時的 cascade 與「方案已套用機台數」統計都走此鍵。
--   4. sr_guard_report 擴充（spec §4.1 只說「觸發器維持不變」，但未考慮作廢單）：
--      0021 的作廢單唯讀只對 customer_id／machine_id 的「FK on delete set null」開例外，
--      若不加 plan_stage_id，則只要有任何**作廢單**引用某階段，刪除該階段／方案就會被擋下（'voided'）。
--      這與 spec「方案／階段可刪除，報告單已有快照」相牴觸，故最小擴充例外清單至 plan_stage_id。
--      其餘行為完全不變 —— 未作廢的報告單，plan_stage_* 在草稿或已列印後皆可修改／清除（僅單號／列印／狀態受限）。

-- ============================================================
-- 1) 料件形狀驗證（見決策 1）
-- ============================================================
create or replace function sr_parts_valid(p jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(btrim(e ->> 'name'), '') = ''
     );
$$;
grant execute on function sr_parts_valid(jsonb) to authenticated;

-- ============================================================
-- 2) 資料表
-- ============================================================
-- 保養方案（一組階段，對應一類機台）
create table if not exists sr_service_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                       -- 「20HP 空壓機」
  hp_tags    text[] not null default '{}',        -- 適用馬力，如 {'20HP','20'}；比對時正規化
  active     boolean not null default true,
  note       text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 方案名稱唯一（大小寫／前後空白不敏感）
create unique index if not exists sr_service_plans_name_key
  on sr_service_plans (lower(btrim(name)));

-- 階段（時數里程碑 + 料件清單）
create table if not exists sr_service_plan_stages (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references sr_service_plans(id) on delete cascade,
  hours      int  not null check (hours > 0 and hours <= 1000000),
  label      text not null,                       -- 「基礎保養」「年度保養」
  parts      jsonb not null default '[]'::jsonb,  -- [{ "name": "螺旋專用油", "qty": "1", "unit": "桶" }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sr_service_plan_stages_plan_hours_key
  on sr_service_plan_stages (plan_id, hours);

alter table sr_service_plan_stages drop constraint if exists sr_service_plan_stages_parts_check;
alter table sr_service_plan_stages add constraint sr_service_plan_stages_parts_check
  check (sr_parts_valid(parts));

-- 逐台指定方案（覆寫馬力比對）。獨立表，避免動到 mx_machines 的 RLS。
create table if not exists sr_machine_plans (
  machine_id uuid primary key references mx_machines(id) on delete cascade,
  plan_id    uuid not null references sr_service_plans(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists sr_machine_plans_plan_idx on sr_machine_plans (plan_id);

drop trigger if exists sr_service_plans_updated_at on sr_service_plans;
create trigger sr_service_plans_updated_at before update on sr_service_plans
  for each row execute function set_updated_at();

drop trigger if exists sr_service_plan_stages_updated_at on sr_service_plan_stages;
create trigger sr_service_plan_stages_updated_at before update on sr_service_plan_stages
  for each row execute function set_updated_at();

drop trigger if exists sr_machine_plans_updated_at on sr_machine_plans;
create trigger sr_machine_plans_updated_at before update on sr_machine_plans
  for each row execute function set_updated_at();

-- ============================================================
-- 3) 報告單記錄套用的階段（快照保留語意，階段刪除後仍看得出來）
-- ============================================================
alter table sr_reports
  add column if not exists plan_stage_id    uuid references sr_service_plan_stages(id) on delete set null,
  add column if not exists plan_stage_hours int,
  add column if not exists plan_stage_label text;

comment on column sr_reports.plan_stage_id is
  '本單對應的保養階段；階段刪除時轉 null（plan_stage_hours／plan_stage_label 快照仍在）。清為 null 即視為該階段未開過。';

create index if not exists sr_reports_plan_stage_idx
  on sr_reports (machine_id, plan_stage_id) where plan_stage_id is not null;

-- ============================================================
-- 4) 守門觸發器：作廢單唯讀的 FK set null 例外加入 plan_stage_id（見決策 4）
--    其餘與 0021 相同；本檔須在 0021 之後套用。
-- ============================================================
create or replace function sr_guard_report()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'voided' then
    -- 例外：FK on delete set null（只把 customer_id／machine_id／plan_stage_id 設為 NULL，其餘不變）
    if (to_jsonb(new) - 'customer_id' - 'machine_id' - 'plan_stage_id' - 'updated_at')
         = (to_jsonb(old) - 'customer_id' - 'machine_id' - 'plan_stage_id' - 'updated_at')
       and (new.customer_id   is null or new.customer_id   is not distinct from old.customer_id)
       and (new.machine_id    is null or new.machine_id    is not distinct from old.machine_id)
       and (new.plan_stage_id is null or new.plan_stage_id is not distinct from old.plan_stage_id)
       and (new.customer_id is distinct from old.customer_id
            or new.machine_id is distinct from old.machine_id
            or new.plan_stage_id is distinct from old.plan_stage_id) then
      return new;
    end if;
    raise exception using errcode = 'P0001', message = 'voided',
      detail = '報告單已作廢，不可修改';
  end if;
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '不可變更建立者或建立時間';
  end if;

  -- 受信任身分（service_role／SQL Editor／definer RPC／FK 動作）不套用以下稽核限制
  if current_user::text not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.print_count < old.print_count then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '列印次數不可減少';
  end if;
  if old.first_printed_at is not null
     and new.first_printed_at is distinct from old.first_printed_at then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '首次列印時間不可變更';
  end if;
  if old.print_count > 0 and new.status = 'draft' then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '已列印的報告單不可改回草稿';
  end if;
  if old.print_count > 0 and new.report_no is distinct from old.report_no then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '已列印的報告單不可改派工單號';
  end if;
  -- 狀態轉換白名單：同狀態、draft→printed、printed→completed、completed→printed、非作廢→voided
  if new.status is distinct from old.status
     and not (
       (old.status = 'draft'     and new.status = 'printed')
       or (old.status = 'printed'   and new.status = 'completed')
       or (old.status = 'completed' and new.status = 'printed')
       or new.status = 'voided'
     ) then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('報告單狀態不可由 %s 改為 %s', old.status, new.status);
  end if;
  return new;
end;
$$;
revoke execute on function sr_guard_report() from public, anon, authenticated;

drop trigger if exists sr_reports_guard on sr_reports;
create trigger sr_reports_guard before update on sr_reports
  for each row execute function sr_guard_report();

-- ============================================================
-- 5) RLS 與表權限
-- ============================================================
alter table sr_service_plans       enable row level security;
alter table sr_service_plan_stages enable row level security;
alter table sr_machine_plans       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sr_service_plans', 'sr_service_plan_stages', 'sr_machine_plans']
  loop
    execute format('drop policy if exists "service_report select %1$s" on %1$I;', t);
    execute format(
      'create policy "service_report select %1$s" on %1$I for select to authenticated'
      || ' using ((select has_module(''service_report'')));', t);

    execute format('drop policy if exists "service_report insert %1$s" on %1$I;', t);
    execute format(
      'create policy "service_report insert %1$s" on %1$I for insert to authenticated'
      || ' with check ((select has_module(''service_report'')));', t);

    execute format('drop policy if exists "service_report update %1$s" on %1$I;', t);
    execute format(
      'create policy "service_report update %1$s" on %1$I for update to authenticated'
      || ' using ((select has_module(''service_report'')))'
      || ' with check ((select has_module(''service_report'')));', t);

    execute format('drop policy if exists "service_report delete %1$s" on %1$I;', t);
    execute format(
      'create policy "service_report delete %1$s" on %1$I for delete to authenticated'
      || ' using ((select has_module(''service_report'')));', t);

    execute format('revoke all on table %I from anon;', t);
    execute format('revoke truncate, references, trigger on table %I from public, authenticated;', t);
  end loop;
end $$;

-- mx_records：service_report 只讀（提醒與目前時數判定需要；既有 office policy 不動）
drop policy if exists "service_report select mx_records" on mx_records;
create policy "service_report select mx_records" on mx_records
  for select to authenticated using ((select has_module('service_report')));
