-- 0038_meeting_tracking.sql
-- 週報追蹤資料（issue #272，掛在 #271 的 ERP「週報」tab 下）：交機進度、進廠維修、新機問題。
--
--   * delivery_jobs（交機進度）：客戶、來源報價單／銷貨單（選填）、訂金（自動判斷＋手動覆寫）、負責業務、
--     交機負責人（null = 待確認）、材料確認、機器設備、交機時間（起迄日期，皆空 = 待確認）、注意事項、狀態。
--   * repair_jobs（進廠維修）：客戶、進廠日期、機型（選填）、問題描述、負責人（選填）、狀態。
--   * machine_issues（新機問題）：客戶、機台（mx_machines，選填）、機型、交機日期、問題描述、發生日期、
--     負責人（選填）、狀態、重點追蹤。
--   * tracking_progress（處理進度時間軸）：repair_jobs 與 machine_issues 共用，每列恰屬於其中一筆
--     （兩個可空外鍵 + check 恰一個非空；on delete cascade）。清單顯示最新一筆（日期 desc、建立時間 desc）。
--   * 清單用 view（security_invoker：沿用呼叫者 RLS）：*_view 帶入客戶／員工名稱、最新進度、
--     search_text（關鍵字搜尋用）；delivery_jobs_view 另帶訂金自動判斷所需的兩個數字：
--       linked_allocated  = 連結單據相關「已過帳銷貨單」被已過帳收款沖銷的金額合計
--                           （連結 S → 該張；連結 Q → 由該 Q 轉出（source_doc_id）的 S）
--       customer_prepaid  = 客戶未沖銷預收（erp_party_balances.unallocated，0029 版：已扣退款）
--     判斷規則在前端 lib/erp/tracking/deposit.ts（已沖銷 > 0 或預收 > 0 → 已收；否則未收；手動覆寫優先）。
--   * delivery_document_options：建立交機進度時可連結的單據（Q／S、未作廢）與其 linked_allocated。
--
-- RLS：四張表皆 has_module('erp') 可 select / insert / update / delete；anon 無任何權限。
-- 一致性觸發器（invoker 身分）：連結單據須為同客戶的報價單或銷貨單；機台須屬於同客戶。
--   錯誤以 raise exception 'validation' using detail = 中文訊息（前端 erpErrorMessage 直接顯示 detail）。
-- 外鍵：客戶 on delete restrict（同 erp_documents）；員工 on delete restrict（同 0027：被引用只能停用）；
--   單據、機台 on delete set null（草稿單據刪除、作廢銷貨刪除機台時，追蹤資料保留、只解除連結）。
--
-- 依賴 0001（set_updated_at()）、0011（mx_customers、mx_machines）、0020（has_module、erp_documents、
--      erp_payments、erp_payment_allocations）、0027（employees）、0029（erp_party_balances）、0032（has_module 版本）。
-- 本檔可重複執行：create table / index if not exists、drop constraint / policy / trigger if exists 後再建立、
--   create or replace function / view（欄位清單固定，重跑不改變欄位順序）。
-- ⚠️ 套用正式 DB 前需使用者確認並先備份；須先於前端程式上線（新頁面讀寫這些表與 view）。

-- ============================================================
-- 1) 資料表
-- ============================================================
create table if not exists delivery_jobs (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references mx_customers(id) on delete restrict,
  document_id         uuid references erp_documents(id) on delete set null,   -- 來源報價單／銷貨單（選填）
  deposit_override    text,                    -- null = 自動判斷（無連結單據時視為未收）；received／not_received = 手動
  sales_rep_id        uuid references employees(id) on delete restrict,       -- 負責業務
  delivery_owner_id   uuid references employees(id) on delete restrict,       -- 交機負責人（null = 待確認）
  materials_confirmed boolean not null default false,                         -- 材料確認
  equipment           text,                    -- 機器設備
  delivery_start      date,                    -- 交機時間（起）；起迄皆空 = 待確認
  delivery_end        date,                    -- 交機時間（迄）；同起日 = 單日
  note                text,                    -- 注意事項（例：後處理設備未交）
  status              text not null default 'in_progress',
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists repair_jobs (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references mx_customers(id) on delete restrict,
  received_on date not null default current_date,  -- 進廠日期
  model       text,                                -- 機型／機台（選填）
  description text not null,                       -- 問題描述
  owner_id    uuid references employees(id) on delete restrict,  -- 負責人（選填）
  status      text not null default 'pending',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists machine_issues (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references mx_customers(id) on delete restrict,
  machine_id   uuid references mx_machines(id) on delete set null,  -- 選填；選了由前端帶入交機日期與機型
  model        text,                                             -- 機型
  delivered_on date,                                             -- 交機日期
  description  text not null,                                    -- 問題描述
  occurred_on  date not null default current_date,               -- 發生日期
  owner_id     uuid references employees(id) on delete restrict, -- 負責人（選填）
  status       text not null default 'handling',
  is_key       boolean not null default false,                   -- 重點追蹤（報表醒目底色）
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists tracking_progress (
  id               uuid primary key default gen_random_uuid(),
  repair_job_id    uuid references repair_jobs(id) on delete cascade,
  machine_issue_id uuid references machine_issues(id) on delete cascade,
  progress_date    date not null default current_date,
  content          text not null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- 2) 約束（drop if exists 後重建：重跑時套用最新條件）
-- ============================================================
alter table delivery_jobs drop constraint if exists delivery_jobs_status_check;
alter table delivery_jobs add constraint delivery_jobs_status_check
  check (status in ('in_progress', 'delivered', 'cancelled'));
alter table delivery_jobs drop constraint if exists delivery_jobs_deposit_override_check;
alter table delivery_jobs add constraint delivery_jobs_deposit_override_check
  check (deposit_override is null or deposit_override in ('received', 'not_received'));
-- 起迄同時有值或同時為空（只填一個時前端會補成單日）；迄不早於起
alter table delivery_jobs drop constraint if exists delivery_jobs_window_check;
alter table delivery_jobs add constraint delivery_jobs_window_check
  check ((delivery_start is null) = (delivery_end is null)
         and (delivery_end is null or delivery_end >= delivery_start));
alter table delivery_jobs drop constraint if exists delivery_jobs_text_len_check;
alter table delivery_jobs add constraint delivery_jobs_text_len_check
  check (char_length(coalesce(equipment, '')) <= 500 and char_length(coalesce(note, '')) <= 1000);

alter table repair_jobs drop constraint if exists repair_jobs_status_check;
alter table repair_jobs add constraint repair_jobs_status_check
  check (status in ('pending', 'inspecting', 'vendor', 'quoted', 'awaiting_customer', 'done', 'returned'));
alter table repair_jobs drop constraint if exists repair_jobs_description_check;
alter table repair_jobs add constraint repair_jobs_description_check
  check (btrim(description) <> '' and char_length(description) <= 2000);
alter table repair_jobs drop constraint if exists repair_jobs_model_check;
alter table repair_jobs add constraint repair_jobs_model_check
  check (char_length(coalesce(model, '')) <= 100);

alter table machine_issues drop constraint if exists machine_issues_status_check;
alter table machine_issues add constraint machine_issues_status_check
  check (status in ('handling', 'awaiting_vendor', 'resolved', 'discussing'));
alter table machine_issues drop constraint if exists machine_issues_description_check;
alter table machine_issues add constraint machine_issues_description_check
  check (btrim(description) <> '' and char_length(description) <= 2000);
alter table machine_issues drop constraint if exists machine_issues_model_check;
alter table machine_issues add constraint machine_issues_model_check
  check (char_length(coalesce(model, '')) <= 100);

alter table tracking_progress drop constraint if exists tracking_progress_parent_check;
alter table tracking_progress add constraint tracking_progress_parent_check
  check (num_nonnulls(repair_job_id, machine_issue_id) = 1);
alter table tracking_progress drop constraint if exists tracking_progress_content_check;
alter table tracking_progress add constraint tracking_progress_content_check
  check (btrim(content) <> '' and char_length(content) <= 2000);

-- ============================================================
-- 3) 索引（客戶、狀態、日期、負責人；外鍵刪除檢查）
-- ============================================================
create index if not exists delivery_jobs_customer_idx      on delivery_jobs (customer_id);
create index if not exists delivery_jobs_status_start_idx  on delivery_jobs (status, delivery_start);
create index if not exists delivery_jobs_document_idx      on delivery_jobs (document_id) where document_id is not null;
create index if not exists delivery_jobs_sales_rep_idx     on delivery_jobs (sales_rep_id) where sales_rep_id is not null;
create index if not exists delivery_jobs_owner_idx         on delivery_jobs (delivery_owner_id) where delivery_owner_id is not null;

create index if not exists repair_jobs_customer_idx        on repair_jobs (customer_id);
create index if not exists repair_jobs_status_received_idx on repair_jobs (status, received_on);
create index if not exists repair_jobs_owner_idx           on repair_jobs (owner_id) where owner_id is not null;

create index if not exists machine_issues_customer_idx     on machine_issues (customer_id);
create index if not exists machine_issues_status_occurred_idx on machine_issues (status, occurred_on);
create index if not exists machine_issues_machine_idx      on machine_issues (machine_id) where machine_id is not null;
create index if not exists machine_issues_owner_idx        on machine_issues (owner_id) where owner_id is not null;

create index if not exists tracking_progress_repair_idx
  on tracking_progress (repair_job_id, progress_date desc, created_at desc) where repair_job_id is not null;
create index if not exists tracking_progress_issue_idx
  on tracking_progress (machine_issue_id, progress_date desc, created_at desc) where machine_issue_id is not null;

-- ============================================================
-- 4) updated_at 觸發器（沿用 0001 的 set_updated_at()）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['delivery_jobs', 'repair_jobs', 'machine_issues', 'tracking_progress']
  loop
    execute format('drop trigger if exists %1$s_updated_at on %1$I;', t);
    execute format(
      'create trigger %1$s_updated_at before update on %1$I for each row execute function set_updated_at();',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 5) 一致性檢查觸發器（invoker：讀不到的單據／機台視同不存在）
-- ============================================================
create or replace function delivery_jobs_check_document()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type text;
  v_customer uuid;
begin
  if new.document_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.document_id is not distinct from old.document_id
     and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;
  select d.doc_type, d.customer_id into v_type, v_customer
    from erp_documents d where d.id = new.document_id;
  if not found then
    raise exception 'validation' using errcode = 'P0001', detail = '找不到連結的單據。';
  end if;
  if v_type not in ('Q', 'S') then
    raise exception 'validation' using errcode = 'P0001', detail = '交機進度只能連結報價單或銷貨單。';
  end if;
  if v_customer is distinct from new.customer_id then
    raise exception 'validation' using errcode = 'P0001', detail = '連結的單據不是此客戶的單據。';
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_jobs_check_document on delivery_jobs;
create trigger delivery_jobs_check_document before insert or update on delivery_jobs
  for each row execute function delivery_jobs_check_document();

create or replace function machine_issues_check_machine()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer uuid;
begin
  if new.machine_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.machine_id is not distinct from old.machine_id
     and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;
  select m.customer_id into v_customer from mx_machines m where m.id = new.machine_id;
  if not found then
    raise exception 'validation' using errcode = 'P0001', detail = '找不到所選機台。';
  end if;
  if v_customer is distinct from new.customer_id then
    raise exception 'validation' using errcode = 'P0001', detail = '所選機台不屬於此客戶。';
  end if;
  return new;
end;
$$;

drop trigger if exists machine_issues_check_machine on machine_issues;
create trigger machine_issues_check_machine before insert or update on machine_issues
  for each row execute function machine_issues_check_machine();

revoke execute on function delivery_jobs_check_document() from public, anon;
revoke execute on function machine_issues_check_machine() from public, anon;

-- ============================================================
-- 6) RLS 與表權限
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['delivery_jobs', 'repair_jobs', 'machine_issues', 'tracking_progress']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "erp select %1$s" on %1$I;', t);
    execute format(
      'create policy "erp select %1$s" on %1$I for select to authenticated using ((select has_module(''erp'')));',
      t);
    execute format('drop policy if exists "erp insert %1$s" on %1$I;', t);
    execute format(
      'create policy "erp insert %1$s" on %1$I for insert to authenticated with check ((select has_module(''erp'')));',
      t);
    execute format('drop policy if exists "erp update %1$s" on %1$I;', t);
    execute format(
      'create policy "erp update %1$s" on %1$I for update to authenticated '
      'using ((select has_module(''erp''))) with check ((select has_module(''erp'')));',
      t);
    execute format('drop policy if exists "erp delete %1$s" on %1$I;', t);
    execute format(
      'create policy "erp delete %1$s" on %1$I for delete to authenticated using ((select has_module(''erp'')));',
      t);
    execute format('revoke all on table %I from anon;', t);
    execute format('revoke truncate, references, trigger on table %I from public, authenticated;', t);
  end loop;
end $$;

-- ============================================================
-- 7) 清單 view（security_invoker）
-- ============================================================
-- 交機進度：客戶／員工名稱、連結單據、訂金判斷依據、搜尋字串
create or replace view delivery_jobs_view
with (security_invoker = true) as
select j.id,
       j.customer_id,
       j.document_id,
       j.deposit_override,
       j.sales_rep_id,
       j.delivery_owner_id,
       j.materials_confirmed,
       j.equipment,
       j.delivery_start,
       j.delivery_end,
       j.note,
       j.status,
       j.created_at,
       j.updated_at,
       c.code  as customer_code,
       c.name  as customer_name,
       sr.name as sales_rep_name,
       ow.name as delivery_owner_name,
       d.doc_type,
       d.doc_no,
       d.status as doc_status,
       coalesce(la.allocated, 0)::numeric(14,2) as linked_allocated,
       coalesce(pb.unallocated, 0)::numeric(14,2) as customer_prepaid,
       concat_ws(' ', c.code, c.name, j.equipment, j.note, d.doc_no, sr.name, ow.name) as search_text
  from delivery_jobs j
  join mx_customers c on c.id = j.customer_id
  left join employees sr on sr.id = j.sales_rep_id
  left join employees ow on ow.id = j.delivery_owner_id
  left join erp_documents d on d.id = j.document_id
  left join lateral (
    select sum(pa.amount) as allocated
      from erp_documents s
      join erp_payment_allocations pa on pa.document_id = s.id
      join erp_payments p on p.id = pa.payment_id and p.status = 'posted'
     where j.document_id is not null
       and s.doc_type = 'S' and s.status = 'posted'
       and (s.id = j.document_id or s.source_doc_id = j.document_id)
  ) la on true
  left join erp_party_balances pb on pb.party_type = 'customer' and pb.party_id = j.customer_id;

-- 可連結的單據（報價單／銷貨單、未作廢）與其相關銷貨單已沖銷金額
create or replace view delivery_document_options
with (security_invoker = true) as
select d.id,
       d.customer_id,
       d.doc_type,
       d.doc_no,
       d.doc_date,
       d.status,
       d.total_twd,
       d.sales_rep_id,
       d.sales_rep,
       coalesce((
         select sum(pa.amount)
           from erp_documents s
           join erp_payment_allocations pa on pa.document_id = s.id
           join erp_payments p on p.id = pa.payment_id and p.status = 'posted'
          where s.doc_type = 'S' and s.status = 'posted'
            and (s.id = d.id or s.source_doc_id = d.id)
       ), 0)::numeric(14,2) as linked_allocated
  from erp_documents d
 where d.doc_type in ('Q', 'S') and d.status <> 'voided';

-- 進廠維修：最新進度與進度筆數
create or replace view repair_jobs_view
with (security_invoker = true) as
select j.id,
       j.customer_id,
       j.received_on,
       j.model,
       j.description,
       j.owner_id,
       j.status,
       j.created_at,
       j.updated_at,
       c.code as customer_code,
       c.name as customer_name,
       ow.name as owner_name,
       lp.progress_date as latest_progress_date,
       lp.content as latest_progress,
       coalesce(pc.n, 0)::int as progress_count,
       concat_ws(' ', c.code, c.name, j.model, j.description, ow.name) as search_text
  from repair_jobs j
  join mx_customers c on c.id = j.customer_id
  left join employees ow on ow.id = j.owner_id
  left join lateral (
    select tp.progress_date, tp.content
      from tracking_progress tp
     where tp.repair_job_id = j.id
     order by tp.progress_date desc, tp.created_at desc, tp.id desc
     limit 1
  ) lp on true
  left join lateral (
    select count(*) as n from tracking_progress tp where tp.repair_job_id = j.id
  ) pc on true;

-- 新機問題：機台機號、最新進度與進度筆數
create or replace view machine_issues_view
with (security_invoker = true) as
select i.id,
       i.customer_id,
       i.machine_id,
       i.model,
       i.delivered_on,
       i.description,
       i.occurred_on,
       i.owner_id,
       i.status,
       i.is_key,
       i.created_at,
       i.updated_at,
       c.code as customer_code,
       c.name as customer_name,
       m.serial_no as machine_serial_no,
       ow.name as owner_name,
       lp.progress_date as latest_progress_date,
       lp.content as latest_progress,
       coalesce(pc.n, 0)::int as progress_count,
       concat_ws(' ', c.code, c.name, i.model, m.serial_no, i.description, ow.name) as search_text
  from machine_issues i
  join mx_customers c on c.id = i.customer_id
  left join mx_machines m on m.id = i.machine_id
  left join employees ow on ow.id = i.owner_id
  left join lateral (
    select tp.progress_date, tp.content
      from tracking_progress tp
     where tp.machine_issue_id = i.id
     order by tp.progress_date desc, tp.created_at desc, tp.id desc
     limit 1
  ) lp on true
  left join lateral (
    select count(*) as n from tracking_progress tp where tp.machine_issue_id = i.id
  ) pc on true;

revoke all on delivery_jobs_view, delivery_document_options, repair_jobs_view, machine_issues_view from anon;
grant select on delivery_jobs_view, delivery_document_options, repair_jobs_view, machine_issues_view to authenticated;

comment on table delivery_jobs is '交機進度（週報，#272）';
comment on column delivery_jobs.deposit_override is '訂金手動覆寫：null＝自動判斷（無連結單據＝未收）；received／not_received';
comment on column delivery_jobs.delivery_owner_id is '交機負責人；null＝待確認';
comment on table repair_jobs is '進廠維修（週報，#272）';
comment on table machine_issues is '新機問題（週報，#272）';
comment on table tracking_progress is '處理進度時間軸（repair_jobs／machine_issues 共用，#272）';
