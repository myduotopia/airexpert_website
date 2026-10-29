-- 0040：ERP 提醒事項（#274）：提醒規則、每次到期的處理紀錄、備註同步 RPC。
--
-- ── 資料表 ─────────────────────────────────────────────────────────
--   erp_reminder_rules：提醒規則
--     vendor_id（可空；廠商刪除時一併刪除其規則）、title（事項）、
--     週期以明確欄位表示：kind ∈ monthly／weekly／yearly／once
--       monthly：day_of_month 1–31 或 -1（月底）；大於當月天數時取月底（前端 lib/erp/reminders/schedule.ts 計算）
--       weekly ：weekday 0（日）–6（六）
--       yearly ：month 1–12 + day_of_month（該月合法日期，2/29 於平年取 2/28）
--       once   ：once_date
--     start_date（起算日：此日之前的到期不列，新規則不會一次冒出過去的逾期；單次規則不看）、
--     lead_days（提前天數，預設 7，0–90）、active、
--     source ∈ auto（由廠商備註解析）／manual（手動）、source_text（原始備註片段）、note（備註）、
--     auto_key（auto 規則的識別鍵＝週期＋標題，例 m:10:匯款；同一廠商唯一，manual 為 null）、
--     auto_missing（auto 規則因備註不再出現而被同步停用；備註再出現時同步會重新啟用）。
--   erp_reminder_occurrences：每次到期的處理紀錄（rule_id + due_date 唯一）
--     status ∈ done（完成）／skipped（略過）、note、handled_by、handled_at。有紀錄的到期就不再出現在清單。
--
-- ── 同步 RPC ───────────────────────────────────────────────────────
--   erp_apply_reminder_sync(p_plan jsonb) returns jsonb { inserted, updated }
--     p_plan = { insert: [{vendor_id, auto_key, title, kind, day_of_month, weekday, month, source_text, start_date}],
--                update: [{id, source_text, active, auto_missing}] }
--     計畫由前端純函式 planVendorReminderSync（lib/erp/reminders/sync.ts）依備註解析結果算出；
--     本函式只負責在單一交易內套用，並再把關：只新增 source='auto'、只更新 source='auto' 的列（manual 一律不動），
--     同一廠商同 auto_key 已存在時略過（on conflict do nothing，可重複執行）。
--   security invoker：沿用呼叫者的 RLS（has_module('erp')）。API 角色無 erp 模組 → forbidden。
--   維運腳本（scripts/sync-vendor-reminders.ts，postgres 身分）可直接呼叫。
--
-- ── 權限 ───────────────────────────────────────────────────────────
--   RLS：兩表皆 (select has_module('erp'))，與 0020 的 erp_* 同一套；anon 撤銷全部權限。
--
-- 依賴：0020（erp_vendors、has_module、set_updated_at）。錯誤同 erp_raise 的格式（P0001、message＝代碼、detail＝中文），
-- 但 erp_raise 對 authenticated 已撤銷 execute，invoker 函式內改直接 raise。不修改任何既有物件。
-- 本檔可重複執行：create table／index if not exists、create or replace function、drop policy／trigger if exists。

-- ============================================================
-- 1) 提醒規則
-- ============================================================
create table if not exists erp_reminder_rules (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid references erp_vendors(id) on delete cascade,
  title        text not null check (btrim(title) <> '' and char_length(title) <= 100),
  kind         text not null check (kind in ('monthly','weekly','yearly','once')),
  day_of_month smallint check (day_of_month between 1 and 31 or day_of_month = -1),
  weekday      smallint check (weekday between 0 and 6),
  month        smallint check (month between 1 and 12),
  once_date    date,
  start_date   date not null default ((now() at time zone 'Asia/Taipei')::date),
  lead_days    smallint not null default 7 check (lead_days between 0 and 90),
  active       boolean not null default true,
  source       text not null default 'manual' check (source in ('auto','manual')),
  source_text  text,
  auto_key     text,
  auto_missing boolean not null default false,
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 週期欄位：每種 kind 只能有自己的欄位
  constraint erp_reminder_rules_schedule_shape check (
       (kind = 'monthly' and day_of_month is not null and weekday is null and month is null and once_date is null)
    or (kind = 'weekly'  and weekday is not null and day_of_month is null and month is null and once_date is null)
    or (kind = 'yearly'  and month is not null and day_of_month between 1 and
          (case when month = 2 then 29 when month in (4,6,9,11) then 30 else 31 end)
          and weekday is null and once_date is null)
    or (kind = 'once'    and once_date is not null and day_of_month is null and weekday is null and month is null)
  ),
  -- auto 規則必有識別鍵與廠商、不可為單次；manual 沒有識別鍵、不會被同步標記
  constraint erp_reminder_rules_auto_shape check (
       (source = 'auto' and auto_key is not null and vendor_id is not null and kind <> 'once')
    or (source = 'manual' and auto_key is null and not auto_missing)
  )
);
create index if not exists erp_reminder_rules_vendor_idx on erp_reminder_rules (vendor_id) where vendor_id is not null;
create unique index if not exists erp_reminder_rules_auto_key on erp_reminder_rules (vendor_id, auto_key) where source = 'auto';

comment on table erp_reminder_rules is 'ERP 提醒規則（#274）：每月／每週／每年／單次；auto 由廠商備註解析、manual 手動';

-- ============================================================
-- 2) 每次到期的處理紀錄
-- ============================================================
create table if not exists erp_reminder_occurrences (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid not null references erp_reminder_rules(id) on delete cascade,
  due_date   date not null,
  status     text not null check (status in ('done','skipped')),
  note       text,
  handled_by uuid default auth.uid(),
  handled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_reminder_occurrences_rule_due_key unique (rule_id, due_date)
);
create index if not exists erp_reminder_occurrences_due_idx on erp_reminder_occurrences (due_date);

comment on table erp_reminder_occurrences is 'ERP 提醒每次到期的處理紀錄（完成／略過）；有紀錄者不再出現在提醒清單（#274）';

-- ============================================================
-- 3) updated_at、RLS、表權限
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['erp_reminder_rules','erp_reminder_occurrences']
  loop
    execute format('drop trigger if exists %1$s_updated_at on %1$I;', t);
    execute format(
      'create trigger %1$s_updated_at before update on %1$I for each row execute function set_updated_at();',
      t
    );
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "erp all %1$s" on %1$I;', t);
    execute format(
      'create policy "erp all %1$s" on %1$I for all to authenticated using ((select has_module(''erp''))) with check ((select has_module(''erp'')));',
      t
    );
    execute format('revoke all on table %I from anon;', t);
    execute format('revoke truncate, references, trigger on table %I from public, authenticated;', t);
  end loop;
end $$;

-- ============================================================
-- 4) 同步 RPC
-- ============================================================
create or replace function erp_apply_reminder_sync(p_plan jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
  v_updated  integer := 0;
begin
  if current_user in ('anon', 'authenticated') and not (select has_module('erp')) then
    raise exception using errcode = 'P0001', message = 'forbidden', detail = '沒有 ERP 模組權限';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
     or jsonb_typeof(coalesce(p_plan->'insert', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_plan->'update', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'validation', detail = '同步資料格式錯誤。';
  end if;

  with src as (
    select *
      from jsonb_to_recordset(coalesce(p_plan->'insert', '[]'::jsonb)) as x(
        vendor_id uuid, auto_key text, title text, kind text, day_of_month smallint,
        weekday smallint, month smallint, source_text text, start_date date)
  ), ins as (
    insert into erp_reminder_rules
      (vendor_id, title, kind, day_of_month, weekday, month, start_date, source, source_text, auto_key)
    select vendor_id, title, kind, day_of_month, weekday, month,
           coalesce(start_date, (now() at time zone 'Asia/Taipei')::date), 'auto', source_text, auto_key
      from src
    on conflict (vendor_id, auto_key) where source = 'auto' do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  with src as (
    select *
      from jsonb_to_recordset(coalesce(p_plan->'update', '[]'::jsonb)) as x(
        id uuid, source_text text, active boolean, auto_missing boolean)
  ), upd as (
    update erp_reminder_rules r
       set source_text  = s.source_text,
           active       = coalesce(s.active, r.active),
           auto_missing = coalesce(s.auto_missing, r.auto_missing)
      from src s
     where r.id = s.id
       and r.source = 'auto'
    returning 1
  )
  select count(*) into v_updated from upd;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated);
end;
$$;

comment on function erp_apply_reminder_sync(jsonb) is
  '套用廠商備註 → auto 提醒規則的同步計畫（只動 source=auto；可重複執行）；security invoker 沿用 erp RLS（#274，0040）';

revoke execute on function erp_apply_reminder_sync(jsonb) from public, anon;
grant execute on function erp_apply_reminder_sync(jsonb) to authenticated;
