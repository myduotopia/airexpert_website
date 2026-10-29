-- 0037_report_technicians.sql
-- 維護報告單多技師工時分攤 ＋ ERP 週報「維護完成紀錄」唯讀 RPC（issue #271）。
--   * 資料表 sr_report_technicians：一張報告單可有多位技師（主技師＋協同技師），各自工時比例 share（0 < share ≤ 1）。
--   * 觸發器：
--       sr_report_technicians_guard（BEFORE INSERT／UPDATE／DELETE）：所屬報告單已作廢 → 任何身分皆不可新增／修改／刪除
--         （與 sr_guard_report「作廢單唯讀」一致）；已結案（completed）沿用既有規則＝仍可修改。
--       sr_reports_sync_primary_technician（AFTER INSERT／UPDATE OF technician_id ON sr_reports）：
--         主技師（sr_reports.technician_id）變動時自動同步 is_primary 那一列（舊程式或 SQL 直接改 technician_id 也不會脫鉤）；
--         technician_id 清為 null 時整張單的技師列（含協同）全部移除。
--   * RPC：
--       sr_set_report_technicians(p_report_id, p_primary_share, p_collaborators)：security invoker，
--         一次（同一交易）重設某張報告單的全部技師列（主技師取自 sr_reports.technician_id）。
--       erp_meeting_maintenance(p_from, p_to)：security definer，has_module('erp') 才可呼叫，
--         只回傳週報需要的欄位（已結案、未作廢、report_date 在區間內）。
--   * 回填：既有 technician_id 非空、未作廢、尚無任何技師列的報告單 → 主技師 share 1。
-- 依賴 0020（has_module）、0021／0022（sr_reports、sr_guard_report）、0027（employees、sr_reports.technician_id）、
--   0032（has_module 職位權限版）。不修改任何既有物件（不動 sr_guard_report、sr_reports 的 policy）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（以 pooler 連線或 SQL Editor 貼上執行，身分須為 postgres）。
-- ⚠️ 須先於前端程式上線：新版程式會呼叫 sr_set_report_technicians／erp_meeting_maintenance、讀 sr_report_technicians。
--    舊程式搭配本檔不受影響（只多一張表；改 technician_id 時由觸發器同步主技師列）。
-- 本檔可重複執行：create table / index if not exists、create or replace function、
--   drop policy / trigger / constraint if exists 後再建立；回填只補「尚無任何技師列」的報告單。
--
-- 錯誤契約（沿用 0020 §9）：raise exception using errcode = 'P0001', message = '<code>', detail = '<中文訊息>'
--   code ∈ forbidden / validation / voided
--
-- 實作決策：
--   1. ERP 能否讀 sr_reports？不能——sr_reports 只有 has_module('service_report') 的 policy，且含電話、統編、
--      聯絡人、地址、內部備註等欄位。週報在 ERP 底下，若為了週報替 sr_reports 加 erp 的 select policy，
--      ERP 使用者就能以 PostgREST 讀到整列。故改用 security definer RPC erp_meeting_maintenance：
--      第一行檢查 has_module('erp')，只回傳報表需要的欄位（日期、單號、客戶名稱、損壞狀況、設備／型號、
--      服務項目、回填結果、料件、建議事項、技師與比例），且只回已結案的報告單。
--      sr_report_technicians 同理不加 erp policy（fail-closed）；ERP 只經由上述 RPC 讀技師比例。
--   2. 主技師仍是 sr_reports.technician_id（＋ technician 姓名快照，列印用），sr_report_technicians 以 is_primary
--      標記同一人（每張單最多一列 is_primary，部分唯一索引）。主技師列由觸發器跟著 technician_id 同步，
--      協同技師與比例由 sr_set_report_technicians 寫入；兩者都在 DB 端，前端只負責送出。
--   3. share 為 numeric(4,2)、check 0 < share ≤ 1；不檢查同一張單的比例總和（兩人各算 1 天也合理，由前端提示）。
--   4. employee_id on delete restrict（與 0027 相同理由：被引用的員工只能停用；set null 會撞作廢單唯讀）；
--      report_id on delete cascade（草稿刪除時一併刪除）。cascade 刪除時父列已不存在，guard 放行。
--   5. guard 以 security definer 讀父報告單狀態（不受呼叫者 RLS 影響，避免「看不到父列」被誤判為 cascade）。
--   6. 回填略過作廢報告單：作廢單任何身分皆不可改（guard），詳情／列印仍以 technician 文字快照顯示。

-- ============================================================
-- 1) 資料表
-- ============================================================
create table if not exists sr_report_technicians (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references sr_reports(id) on delete cascade,
  employee_id uuid not null references employees(id)  on delete restrict,
  share       numeric(4,2) not null default 1,
  sort_order  int not null default 0,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table sr_report_technicians drop constraint if exists sr_report_technicians_share_check;
alter table sr_report_technicians add constraint sr_report_technicians_share_check
  check (share > 0 and share <= 1);

alter table sr_report_technicians drop constraint if exists sr_report_technicians_sort_order_check;
alter table sr_report_technicians add constraint sr_report_technicians_sort_order_check
  check (sort_order >= 0);

alter table sr_report_technicians drop constraint if exists sr_report_technicians_report_employee_key;
alter table sr_report_technicians add constraint sr_report_technicians_report_employee_key
  unique (report_id, employee_id);

-- 每張報告單最多一位主技師
create unique index if not exists sr_report_technicians_primary_key
  on sr_report_technicians (report_id) where is_primary;
-- 外鍵檢查（刪除員工）與依技師彙總
create index if not exists sr_report_technicians_employee_idx
  on sr_report_technicians (employee_id);

comment on table sr_report_technicians is
  '維護報告單技師與工時比例（主技師＋協同技師，0037）；主技師同 sr_reports.technician_id（is_primary）';
comment on column sr_report_technicians.share is '工時比例：0 < share ≤ 1（例：兩人各 0.5）';

-- ============================================================
-- 2) 守門：作廢報告單的技師列唯讀（任何身分）
-- ============================================================
create or replace function sr_guard_report_technician()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.report_id is distinct from old.report_id then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '不可變更技師列所屬的報告單';
  end if;

  select status into v_status
    from sr_reports
   where id = case when tg_op = 'DELETE' then old.report_id else new.report_id end;

  if not found then
    -- 父報告單已刪除（on delete cascade）→ 放行；新增時交給外鍵檢查回報。
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_status = 'voided' then
    raise exception using errcode = 'P0001', message = 'voided',
      detail = '報告單已作廢，不可修改技師';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function sr_guard_report_technician() from public, anon, authenticated;

drop trigger if exists sr_report_technicians_guard on sr_report_technicians;
create trigger sr_report_technicians_guard
  before insert or update or delete on sr_report_technicians
  for each row execute function sr_guard_report_technician();

-- ============================================================
-- 3) 主技師同步：sr_reports.technician_id 變動 → is_primary 列跟著變
--    security invoker：API 角色走 RLS（能改 sr_reports 的人即有 service_report，可寫技師列）。
-- ============================================================
create or replace function sr_sync_primary_technician()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_share numeric(4,2);
begin
  if tg_op = 'UPDATE' and new.technician_id is not distinct from old.technician_id then
    return null;
  end if;
  if new.status = 'voided' then
    return null;
  end if;

  select share into v_share
    from sr_report_technicians
   where report_id = new.id and is_primary;

  if new.technician_id is null then
    -- 清除主技師 → 全部技師列一併移除（與 sr_set_report_technicians「沒有主技師時不可有協同技師」一致，
    -- 避免報表出現只有協同技師、沒有主技師的單）。
    delete from sr_report_technicians where report_id = new.id;
    return null;
  end if;

  -- 移除舊主技師列；新主技師若原本是協同技師，該列一併移除（避免同一人兩列）。
  delete from sr_report_technicians
   where report_id = new.id
     and (is_primary or employee_id = new.technician_id);

  insert into sr_report_technicians (report_id, employee_id, share, sort_order, is_primary)
  values (new.id, new.technician_id, coalesce(v_share, 1), 0, true);
  return null;
end;
$$;
revoke execute on function sr_sync_primary_technician() from public, anon, authenticated;

drop trigger if exists sr_reports_sync_primary_technician on sr_reports;
create trigger sr_reports_sync_primary_technician
  after insert or update of technician_id on sr_reports
  for each row execute function sr_sync_primary_technician();

-- ============================================================
-- 4) RLS 與表權限（比照 sr_reports：service_report 可讀寫；ERP 經由 erp_meeting_maintenance 讀）
-- ============================================================
alter table sr_report_technicians enable row level security;

drop policy if exists "service_report select sr_report_technicians" on sr_report_technicians;
create policy "service_report select sr_report_technicians" on sr_report_technicians
  for select to authenticated using ((select has_module('service_report')));

drop policy if exists "service_report insert sr_report_technicians" on sr_report_technicians;
create policy "service_report insert sr_report_technicians" on sr_report_technicians
  for insert to authenticated with check ((select has_module('service_report')));

drop policy if exists "service_report update sr_report_technicians" on sr_report_technicians;
create policy "service_report update sr_report_technicians" on sr_report_technicians
  for update to authenticated
  using ((select has_module('service_report')))
  with check ((select has_module('service_report')));

drop policy if exists "service_report delete sr_report_technicians" on sr_report_technicians;
create policy "service_report delete sr_report_technicians" on sr_report_technicians
  for delete to authenticated using ((select has_module('service_report')));

revoke all on table sr_report_technicians from anon;
revoke truncate, references, trigger on table sr_report_technicians from public, authenticated;

-- ============================================================
-- 5) 重設某張報告單的技師（主技師比例 + 協同技師）
--    p_collaborators：[{ "employee_id": uuid, "share": number }, …]（順序＝顯示順序）
--    主技師取自 sr_reports.technician_id；沒有主技師時不可有協同技師（全部列刪除）。
-- ============================================================
create or replace function sr_set_report_technicians(
  p_report_id     uuid,
  p_primary_share numeric,
  p_collaborators jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_report  record;
  v_items   jsonb := coalesce(p_collaborators, '[]'::jsonb);
  v_item    jsonb;
  v_emp     uuid;
  v_share   numeric;
  v_seen    uuid[] := '{}';
  v_ord     int := 0;
  v_count   int := 0;
begin
  if not has_module('service_report') then
    raise exception using errcode = 'P0001', message = 'forbidden',
      detail = '沒有機台維護報告單模組權限';
  end if;

  select id, status, technician_id into v_report
    from sr_reports where id = p_report_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '找不到報告單';
  end if;
  if v_report.status = 'voided' then
    raise exception using errcode = 'P0001', message = 'voided',
      detail = '報告單已作廢，不可修改技師';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '協同技師格式不正確';
  end if;
  if jsonb_array_length(v_items) > 10 then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '協同技師最多 10 位';
  end if;
  if v_report.technician_id is null and jsonb_array_length(v_items) > 0 then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '有協同技師時，主技師須從員工清單選擇';
  end if;

  if v_report.technician_id is not null then
    if p_primary_share is null or p_primary_share <= 0 or p_primary_share > 1
       or p_primary_share <> round(p_primary_share, 2) then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = '主技師工時比例須大於 0、不超過 1，最多兩位小數';
    end if;
    v_seen := array[v_report.technician_id];
  end if;

  delete from sr_report_technicians where report_id = p_report_id;

  if v_report.technician_id is not null then
    insert into sr_report_technicians (report_id, employee_id, share, sort_order, is_primary)
    values (p_report_id, v_report.technician_id, p_primary_share, 0, true);
    v_count := 1;
  end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_ord := v_ord + 1;
    begin
      v_emp := (v_item ->> 'employee_id')::uuid;
      v_share := (v_item ->> 'share')::numeric;
    exception when others then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = format('第 %s 位協同技師資料不正確', v_ord);
    end;
    if v_emp is null then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = format('第 %s 位協同技師請從員工清單選擇', v_ord);
    end if;
    if v_emp = any (v_seen) then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = '同一位技師不可重複列出';
    end if;
    if v_share is null or v_share <= 0 or v_share > 1 or v_share <> round(v_share, 2) then
      raise exception using errcode = 'P0001', message = 'validation',
        detail = format('第 %s 位協同技師工時比例須大於 0、不超過 1，最多兩位小數', v_ord);
    end if;
    v_seen := v_seen || v_emp;
    insert into sr_report_technicians (report_id, employee_id, share, sort_order, is_primary)
    values (p_report_id, v_emp, v_share, v_ord, false);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke execute on function sr_set_report_technicians(uuid, numeric, jsonb) from public, anon;
grant execute on function sr_set_report_technicians(uuid, numeric, jsonb) to authenticated;

-- ============================================================
-- 6) ERP 週報：維護完成紀錄（見決策 1）
--    只回已結案（completed）的報告單；作廢、草稿、已列印未結案皆不列。
--    區間最長 366 天（防止一次撈整個資料庫）。
-- ============================================================
create or replace function erp_meeting_maintenance(p_from date, p_to date)
returns table (
  id            uuid,
  report_no     text,
  report_date   date,
  customer_name text,
  summary       text,
  equipment     text,
  model         text,
  service_items text[],
  results       jsonb,
  parts         jsonb,
  suggestions   text[],
  technician    text,
  technicians   jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not has_module('erp') then
    raise exception using errcode = 'P0001', message = 'forbidden',
      detail = '沒有 ERP 模組權限';
  end if;
  if p_from is null or p_to is null then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '請指定起訖日期';
  end if;
  if p_from > p_to then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '起日不可晚於迄日';
  end if;
  if p_to - p_from > 366 then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = '查詢區間最長一年';
  end if;

  return query
  select r.id, r.report_no, r.report_date, r.customer_name, r.summary, r.equipment, r.model,
         r.service_items, r.results, r.parts, r.suggestions, r.technician,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'employee_id', t.employee_id,
                    'name',        e.name,
                    'code',        e.code,
                    'share',       t.share,
                    'is_primary',  t.is_primary)
                  order by t.is_primary desc, t.sort_order, e.name)
             from sr_report_technicians t
             join employees e on e.id = t.employee_id
            where t.report_id = r.id
         ), '[]'::jsonb)
    from sr_reports r
   where r.status = 'completed'
     and r.report_date between p_from and p_to
   order by r.report_date, r.report_no;
end;
$$;
revoke execute on function erp_meeting_maintenance(date, date) from public, anon;
grant execute on function erp_meeting_maintenance(date, date) to authenticated;

-- ============================================================
-- 7) 回填（可重複執行）：既有主技師 → share 1（略過作廢單與已有技師列的報告單）
-- ============================================================
insert into sr_report_technicians (report_id, employee_id, share, sort_order, is_primary)
select r.id, r.technician_id, 1, 0, true
  from sr_reports r
 where r.technician_id is not null
   and r.status <> 'voided'
   and not exists (select 1 from sr_report_technicians t where t.report_id = r.id);
