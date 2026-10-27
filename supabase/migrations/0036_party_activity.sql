-- 0036：客戶／廠商詳情頁「相關單據」RPC erp_party_activity（#267）。
--
-- ── 用途 ───────────────────────────────────────────────────────────
-- 客戶詳情頁列出 報價 Q、銷貨 S、銷退 SR、收款 RC（含 0 元沖抵單）、客戶退款 RF；
-- 廠商詳情頁列出 採購 P、進貨 I、進退 PR、付款 PM（含沖抵單）、廠商退款 VR。
-- 單據（erp_documents）與收付款（erp_payments）是兩張表，要「合併後」新到舊排序再分頁，
-- 用 PostgREST 分別查兩表無法正確分頁，故以 union all + order by + limit／offset 在 DB 端完成。
--
-- ── 介面 ───────────────────────────────────────────────────────────
--   erp_party_activity(p_party_type text, p_party_id uuid, p_doc_types text[] default null,
--                      p_include_voided boolean default false, p_limit int default 20, p_offset int default 0)
--   returns jsonb：{ "total": 符合條件的總筆數, "rows": [ … 本頁 … ] }
--     回 jsonb（而非 setof）是為了「超出頁數」時 rows 為空仍能拿到 total，前端可提示並連回最後一頁。
--   每列：kind（document／payment）、id、doc_type（單據：Q/S/SR/P/I/PR；收付款類別：RC/RF/PM/VR，
--         RC／PM 含金額 0 的沖抵單）、doc_no（草稿為 null）、date（單據日期／收付款日期）、
--         status（draft／posted／voided）、amount_twd（單據 total_twd，SR／PR 為正數同單據畫面；收付款金額）、
--         outstanding（僅已過帳 S/SR/I/PR：同 erp_document_balances，SR／PR 為負；其餘 null）、
--         unallocated（僅已過帳 RC／PM：金額 − 沖銷 − 被退款，同 erp_party_balances（0029）；退款單與作廢 null）、
--         created_at。
--   參數：
--     p_party_type：'customer'／'vendor'，其他 → validation。p_party_id 為 null → validation。
--     p_doc_types：null 或空陣列 = 該對象的全部類別；含不屬於該對象的類別（例客戶查 P）→ validation。
--     p_include_voided：預設 false（不含作廢單據與作廢收付款）。
--     p_limit：null → 20，限制在 1..100；p_offset：null 或負數 → 0。
--   排序：date desc, created_at desc, id desc（id 讓同日同時間的列順序穩定，分頁不重複不遺漏）。
--
-- ── 權限：security invoker（不用 definer）──────────────────────────────
--   函式沿用呼叫者的 RLS：erp_documents／erp_payments／erp_payment_allocations／erp_refund_sources 皆為
--   (select has_module('erp')) policy，沒有 erp 模組的使用者查到 total 0、rows []，不會外洩任何列；
--   與 0020 的 erp_document_balances／erp_party_balances（security_invoker view）同一套把關，不必在函式內另外檢查。
--   只做唯讀查詢（stable），不需要 definer 的提權；anon 不可執行（revoke），authenticated 可執行。
--
-- ── 效能 ───────────────────────────────────────────────────────────
--   四個 union all 分支各自以對象 id 過濾，走 0020 既有的部分索引：
--     erp_documents_customer_idx（customer_id）、erp_documents_vendor_idx（vendor_id）、
--     erp_payments_customer_idx（customer_id）、erp_payments_vendor_idx（vendor_id）。
--   單一對象的單據＋收付款量級為數百至數千列，排序與 count 在記憶體內完成即可，不另建複合索引。
--   未沖餘額／未沖銷只對「本頁」（≤ 100 列）計算，走 erp_payment_allocations_document_idx／_payment_idx、
--   erp_refund_sources_source_idx，不掃全表、不經過 erp_document_balances 的全表彙總。
--
-- 依賴：0020（erp_documents、erp_payments、erp_payment_allocations、has_module RLS）、0029（erp_payments.kind、
--   erp_refund_sources）。不修改任何既有物件。
-- 本檔可重複執行：create or replace function、revoke／grant 冪等。

create or replace function erp_party_activity(
  p_party_type     text,
  p_party_id       uuid,
  p_doc_types      text[]  default null,
  p_include_voided boolean default false,
  p_limit          integer default 20,
  p_offset         integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer boolean;
  v_allowed  text[];
  v_types    text[];
  v_voided   boolean := coalesce(p_include_voided, false);
  v_limit    integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset   integer := greatest(coalesce(p_offset, 0), 0);
  v_total    bigint;
  v_rows     jsonb;
begin
  if p_party_type = 'customer' then
    v_customer := true;
    v_allowed := array['Q','S','SR','RC','RF'];
  elsif p_party_type = 'vendor' then
    v_customer := false;
    v_allowed := array['P','I','PR','PM','VR'];
  else
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('對象類型錯誤：%s（應為 customer 或 vendor）', coalesce(p_party_type, '（空白）'));
  end if;
  if p_party_id is null then
    raise exception using errcode = 'P0001', message = 'validation', detail = '缺少客戶／廠商';
  end if;

  v_types := case when p_doc_types is null or cardinality(p_doc_types) = 0 then v_allowed else p_doc_types end;
  if not (v_types <@ v_allowed) or array_position(v_types, null) is not null then
    raise exception using errcode = 'P0001', message = 'validation',
      detail = format('單別篩選不屬於此對象：%s', array_to_string(p_doc_types, ',', '（空白）'));
  end if;

  with base as (
    -- 客戶單據 Q／S／SR
    select 'document'::text as kind, d.id, d.doc_type, d.doc_no, d.doc_date as date, d.status,
           d.total_twd as amount_twd, d.created_at
      from erp_documents d
     where v_customer and d.customer_id = p_party_id
       and d.doc_type = any (v_types)
       and (v_voided or d.status <> 'voided')
    union all
    -- 廠商單據 P／I／PR
    select 'document', d.id, d.doc_type, d.doc_no, d.doc_date, d.status, d.total_twd, d.created_at
      from erp_documents d
     where not v_customer and d.vendor_id = p_party_id
       and d.doc_type = any (v_types)
       and (v_voided or d.status <> 'voided')
    union all
    -- 收款 RC（含沖抵單）／客戶退款 RF
    select 'payment', p.id, case when p.kind = 'refund' then 'RF' else 'RC' end, p.doc_no, p.pay_date, p.status,
           p.amount, p.created_at
      from erp_payments p
     where v_customer and p.customer_id = p_party_id and p.direction = 'in'
       and (case when p.kind = 'refund' then 'RF' else 'RC' end) = any (v_types)
       and (v_voided or p.status <> 'voided')
    union all
    -- 付款 PM（含沖抵單）／廠商退款 VR
    select 'payment', p.id, case when p.kind = 'refund' then 'VR' else 'PM' end, p.doc_no, p.pay_date, p.status,
           p.amount, p.created_at
      from erp_payments p
     where not v_customer and p.vendor_id = p_party_id and p.direction = 'out'
       and (case when p.kind = 'refund' then 'VR' else 'PM' end) = any (v_types)
       and (v_voided or p.status <> 'voided')
  ),
  page as (
    select b.*
      from base b
     order by b.date desc, b.created_at desc, b.id desc
     limit v_limit offset v_offset
  )
  select (select count(*) from base),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind',        pg.kind,
                    'id',          pg.id,
                    'doc_type',    pg.doc_type,
                    'doc_no',      pg.doc_no,
                    'date',        pg.date,
                    'status',      pg.status,
                    'amount_twd',  pg.amount_twd,
                    'outstanding', bal.outstanding,
                    'unallocated', bal.unallocated,
                    'created_at',  pg.created_at
                  ) order by pg.date desc, pg.created_at desc, pg.id desc)
             from page pg
             cross join lateral (
               select
                 -- 單據未沖餘額：同 erp_document_balances（只算已過帳收付款的沖銷；SR／PR 為負）
                 case when pg.kind = 'document' and pg.status = 'posted' and pg.doc_type in ('S','SR','I','PR') then
                   (case when pg.doc_type in ('SR','PR') then -pg.amount_twd else pg.amount_twd end)
                   - coalesce((select sum(pa.amount)
                                 from erp_payment_allocations pa
                                 join erp_payments ap on ap.id = pa.payment_id and ap.status = 'posted'
                                where pa.document_id = pg.id), 0)
                 end as outstanding,
                 -- 收付款未沖銷（預收／預付）：同 erp_party_balances（0029）；退款單與作廢不適用
                 case when pg.kind = 'payment' and pg.status = 'posted' and pg.doc_type in ('RC','PM') then
                   pg.amount_twd
                   - coalesce((select sum(pa.amount) from erp_payment_allocations pa where pa.payment_id = pg.id), 0)
                   - coalesce((select sum(rs.amount)
                                 from erp_refund_sources rs
                                 join erp_payments rp on rp.id = rs.refund_id and rp.status = 'posted'
                                where rs.source_payment_id = pg.id), 0)
                 end as unallocated
             ) bal
         ), '[]'::jsonb)
    into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

comment on function erp_party_activity(text, uuid, text[], boolean, integer, integer) is
  '客戶／廠商相關單據（單據＋收付款合併，新到舊分頁）；security invoker 沿用 erp RLS（#267，0036）';

revoke execute on function erp_party_activity(text, uuid, text[], boolean, integer, integer) from public, anon;
grant execute on function erp_party_activity(text, uuid, text[], boolean, integer, integer) to authenticated;
