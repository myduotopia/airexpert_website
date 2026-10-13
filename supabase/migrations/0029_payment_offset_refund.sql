-- 0029：收付款 0 元沖抵、溢收轉預收（付）與退款單（#249，來源 #238 §4 N-2）。
--
-- ── 負數餘額從哪裡來 ───────────────────────────────────────────────
-- 帳務模型（0020）：
--   單據 outstanding = 單據金額（SR／PR 為負）− Σ 已沖銷；收付款 unallocated（預收／預付）= 金額 − Σ 沖銷。
--   客戶淨額 = Σ outstanding − Σ unallocated = Σ 單據 − Σ 收款。
-- #238 例：S 321,300 收 RC 20,000（已沖 S）→ S outstanding 301,300；全額銷退 SR 7,650 + 313,650 →
--   兩張 SR outstanding 合計 −321,300；另 S3 10,500 未收。Σ outstanding = 301,300 + 10,500 − 321,300 = −9,500，
--   unallocated = 0。也就是：客戶付的 20,000 已沖到 S，S 又被全額退回，S 被退掉的那 20,000「已收」沒有地方放，
--   只能以 SR 的負數未結餘額掛在應收裡，所以帳齡顯示應收 −9,500、預收 0。淨額本身沒錯，錯的是分類。
--
-- ── 新流程 ─────────────────────────────────────────────────────────
-- 1. 0 元沖抵單：收款（付款）金額允許 0，只用來沖抵——以 SR（PR）的負數未結餘額沖 S（I）。
--    沖抵單的 unallocated = 0 − Σ 沖銷；沖銷合計為負數時，多出來的貸項就成為這張沖抵單上的預收（預付）。
--    #238：沖抵單沖 SR −7,650、SR −313,650、S 301,300、S3 10,500，合計 −9,500 → 應收 0、預收 9,500。
--    原收款 RC 與其沖銷完全不動（不改歷史）；作廢沖抵單即刪除其沖銷，回到沖抵前的狀態。
-- 2. 退款單（kind = 'refund'）：客戶退款 RF（direction = 'in'）／廠商退款 VR（direction = 'out'，廠商退還預付）。
--    方式限匯款、現金、支票。過帳時依日期先後（FIFO）從該對象有預收（預付）餘額的收付款扣減，
--    逐筆記在 erp_refund_sources（退款單 → 來源收付款、金額），可追溯每一元退自哪一張收款／沖抵單；
--    作廢退款單刪除來源列，預收即還原。退款單本身沒有沖銷、unallocated 恆為 0。
--    來源收付款的 unallocated = 金額 − Σ 沖銷 − Σ 被退款。
--
-- ── 沖銷規則（erp_allocate_payment，DB 為最後防線；前端 allocation.ts 同規則即時提示）─────
--   R1 每筆沖銷：金額非 0；沖後單據 outstanding 需落在 [0, total]（S/I）或 [total, 0]（SR/PR）（同 0020）。
--   R2 上限：該收付款 Σ 沖銷 + Σ 被退款 ≤ 金額（unallocated 不可為負；沖銷可用的「錢」= 金額 + 退貨貸項）。
--   R3 不可憑空產生預收：一次沖銷（本次呼叫）的合計為負數時，代表退貨貸項大於本次沖的正數單據，
--      多出的部分要轉為預收；此時沖完後該對象不可再有未沖清的銷貨（進貨）單，否則 validation。
--      也就是貸項必須先抵完所有欠款，剩下的才是客戶真正多付的錢。合計 ≥ 0 時預收 ≤ 金額，來自實際收到的錢。
--      （取代 0020「合計 < 0 一律 over_allocation」；補沖銷消耗預收時本次合計為正，不受 R3 限制。）
--   R4 金額 0（沖抵單）：過帳時至少要有一筆負數（SR／PR）沖銷，否則 validation；方式一律存 other、
--      不存票號／銀行（erp_post_payment 正規化，約束 erp_payments_offset_check 再把關）。
--   R5 退款單不可沖銷單據；退款金額不可超過該對象的預收（預付）餘額（over_allocation）。
--   註：SR／PR 的負數未結餘額不能直接退款，須先以沖抵單轉為預收（R3 保證轉出的都是真正的溢收）。
--
-- ── 作廢 ───────────────────────────────────────────────────────────
--   退款單：刪除 erp_refund_sources → 來源預收還原。
--   收付款／沖抵單：若其預收已被未作廢的退款單動用 → has_dependents（請先作廢退款單）；否則同 0020。
--   S／SR／I／PR 作廢：有沖銷（含沖抵單）→ has_dependents（同 0020，未改）。
--
-- ── 併發 ───────────────────────────────────────────────────────────
--   退款過帳先依 id 以 for update 鎖該對象全部有效收付款，再計算可退餘額：兩張退款同時過帳會序列化，
--   後者看到前者已扣減的餘額（不會超領）；與補沖銷（for update 鎖該收付款）、作廢收付款（for update）互斥。
--   R3 讀取對象其他未結單據時不鎖；若同時有新銷貨過帳，最差情況是預收與新應收並存（淨額仍正確，可再補沖銷）。
--
-- ── 變更 ───────────────────────────────────────────────────────────
--   1. erp_payments：新增 kind（payment／refund，既有資料為 payment）；金額約束改為 ≥ 0，退款 > 0，
--      金額 0 時方式 other、無票號（erp_payments_offset_check）。
--   2. 新表 erp_refund_sources（RLS has_module('erp')；用戶端唯讀，只能經 RPC 寫入）。
--   3. erp_next_doc_no：字首加 RF（客戶退款）、VR（廠商退款）。以 0020 為底（之後未再改）。
--   4. erp_allocate_payment／erp_post_payment／erp_void_payment：以 0020 為底（之後未再改）create or replace。
--   5. 新 RPC erp_post_refund(jsonb)：security definer、search_path = public, pg_temp、開頭檢查 has_module。
--   6. erp_party_balances：unallocated 扣除被退款金額、不計退款單本身（欄位與順序不變）。
--
-- 上線順序：須先於新前端套用（新前端會查 kind、erp_refund_sources、呼叫 erp_post_refund）。
-- 舊前端搭配本檔不受影響（舊前端金額仍要求 > 0；view 欄位不變）。
-- 既有資料：只新增欄位（預設 payment）與約束，不改任何既有列；既有收付款均 amount > 0，新約束必然成立。
-- 本檔可重複執行：add column if not exists、約束 drop if exists 後重建、create table if not exists、
--   policy drop if exists 後重建、create or replace function／view、grant／revoke 冪等。
-- 注意：重跑 0020 會把上述函式與 view 蓋回 0020 版，故本檔須排在 0020 之後重跑（local-db.sh 放最後）。

-- ============================================================
-- 1) erp_payments：kind、金額約束
-- ============================================================
alter table erp_payments add column if not exists kind text not null default 'payment';

alter table erp_payments drop constraint if exists erp_payments_kind_check;
alter table erp_payments add constraint erp_payments_kind_check check (kind in ('payment','refund'));

-- 0020 的 amount > 0 是欄位內聯約束（自動命名，預期為 erp_payments_amount_check）；
-- 為防命名不同，依定義找出所有只涉及 amount 的 check 一併移除後再以固定名稱重建。
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.erp_payments'::regclass
       and c.contype = 'c'
       and c.conname not in ('erp_payments_party_check', 'erp_payments_check_fields_check',
                             'erp_payments_kind_check', 'erp_payments_offset_check')
       and pg_get_constraintdef(c.oid) ilike '%amount%'
  loop
    execute format('alter table public.erp_payments drop constraint %I', r.conname);
  end loop;
end $$;

-- 金額 ≥ 0；退款單 > 0
alter table erp_payments add constraint erp_payments_amount_check
  check (amount >= 0 and (kind = 'payment' or amount > 0));

-- 0 元沖抵單：方式 other、不帶票號／票期／銀行／支票狀態
alter table erp_payments drop constraint if exists erp_payments_offset_check;
alter table erp_payments add constraint erp_payments_offset_check
  check (amount > 0 or (method = 'other' and check_no is null and check_due_date is null
                        and bank is null and check_status is null));

comment on column erp_payments.kind is
  'payment 收款／付款（金額 0 = 沖抵單）；refund 退款（in = 退款給客戶 RF、out = 廠商退款 VR），0029';

-- ============================================================
-- 2) erp_refund_sources：退款單扣自哪些收付款的預收（預付）
-- ============================================================
create table if not exists erp_refund_sources (
  id                uuid primary key default gen_random_uuid(),
  refund_id         uuid not null references erp_payments(id) on delete cascade,
  source_payment_id uuid not null references erp_payments(id),
  amount            numeric(14,2) not null check (amount > 0),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create index if not exists erp_refund_sources_refund_idx on erp_refund_sources (refund_id);
create index if not exists erp_refund_sources_source_idx on erp_refund_sources (source_payment_id);

alter table erp_refund_sources enable row level security;
drop policy if exists "erp all erp_refund_sources" on erp_refund_sources;
create policy "erp all erp_refund_sources" on erp_refund_sources for all to authenticated
  using ((select has_module('erp'))) with check ((select has_module('erp')));
-- 帳務表：用戶端唯讀（同 0020 §7b），寫入只經 erp_post_refund／erp_void_payment
revoke all on table erp_refund_sources from anon;
revoke truncate, references, trigger on table erp_refund_sources from public, authenticated;
revoke insert, update, delete on table erp_refund_sources from public, authenticated;
grant select on table erp_refund_sources to authenticated;

-- ============================================================
-- 3) 取號：加 RF（客戶退款）、VR（廠商退款）
-- ============================================================
create or replace function erp_next_doc_no(p_prefix text, p_date date)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_period text;
  v_no int;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if p_prefix is null or p_prefix not in ('Q','P','I','PR','S','SR','T','A','RC','PM','RF','VR') then
    perform erp_raise('validation', format('不支援的單號字首：%s', coalesce(p_prefix, '(空)')));
  end if;
  if p_date is null then
    perform erp_raise('validation', '取號需要單據日期');
  end if;

  v_period := lpad((extract(year from p_date)::int - 1911)::text, 3, '0')
              || to_char(p_date, 'MM');

  insert into erp_doc_sequences as s (prefix, period, last_no)
  values (p_prefix, v_period, 1)
  on conflict (prefix, period) do update set last_no = s.last_no + 1
  returning s.last_no into v_no;

  return p_prefix || v_period
         || case when v_no < 1000 then lpad(v_no::text, 3, '0') else v_no::text end;
end;
$$;

-- ============================================================
-- 4) 沖銷（R1–R3、R5）
-- ============================================================
create or replace function erp_allocate_payment(p_payment_id uuid, p_allocations jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay      erp_payments%rowtype;
  v_doc      erp_documents%rowtype;
  v_a        record;
  v_total    numeric;
  v_alloc    numeric;
  v_new      numeric;
  v_sum      numeric;
  v_refunded numeric;
  v_batch    numeric := 0;
  v_open     text;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;

  select * into v_pay from erp_payments where id = p_payment_id for update;
  if not found then
    perform erp_raise('validation', '找不到收付款');
  end if;
  if v_pay.status <> 'posted' then
    perform erp_raise('not_posted', '收付款已作廢');
  end if;
  -- 0029 R5：退款單不沖銷單據
  if v_pay.kind = 'refund' then
    perform erp_raise('validation', '退款單不可沖銷單據');
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    perform erp_raise('validation', '沖銷明細格式錯誤');
  end if;

  for v_a in
    select * from jsonb_to_recordset(p_allocations) as x(document_id uuid, amount numeric)
  loop
    if v_a.document_id is null or v_a.amount is null or v_a.amount = 0 then
      perform erp_raise('validation', '沖銷明細需指定單據與非 0 金額');
    end if;

    select * into v_doc from erp_documents where id = v_a.document_id for update;
    if not found then
      perform erp_raise('validation', '找不到沖銷單據');
    end if;
    if v_doc.status <> 'posted' then
      perform erp_raise('not_posted', format('單據 %s 未過帳或已作廢', coalesce(v_doc.doc_no, '(草稿)')));
    end if;
    if v_pay.direction = 'in'
       and (v_doc.doc_type not in ('S','SR') or v_doc.customer_id is distinct from v_pay.customer_id) then
      perform erp_raise('validation', format('單據 %s 不是此客戶的銷貨／銷退單', v_doc.doc_no));
    end if;
    if v_pay.direction = 'out'
       and (v_doc.doc_type not in ('I','PR') or v_doc.vendor_id is distinct from v_pay.vendor_id) then
      perform erp_raise('validation', format('單據 %s 不是此廠商的進貨／進退單', v_doc.doc_no));
    end if;

    -- R1
    v_total := case when v_doc.doc_type in ('SR','PR') then -v_doc.total_twd else v_doc.total_twd end;
    select coalesce(sum(a.amount), 0) into v_alloc
      from erp_payment_allocations a join erp_payments p on p.id = a.payment_id
     where a.document_id = v_doc.id and p.status = 'posted';
    v_new := v_total - v_alloc - v_a.amount;

    if (v_total >= 0 and (v_new < 0 or v_new > v_total))
       or (v_total < 0 and (v_new > 0 or v_new < v_total)) then
      perform erp_raise('over_allocation',
        format('單據 %s 未沖餘額 %s，沖銷 %s 會超沖', v_doc.doc_no, v_total - v_alloc, v_a.amount));
    end if;

    insert into erp_payment_allocations (payment_id, document_id, amount)
    values (p_payment_id, v_doc.id, v_a.amount);
    v_batch := v_batch + v_a.amount;
  end loop;

  -- R2：Σ 沖銷 + Σ 被退款 ≤ 金額
  select coalesce(sum(amount), 0) into v_sum from erp_payment_allocations where payment_id = p_payment_id;
  select coalesce(sum(rs.amount), 0) into v_refunded
    from erp_refund_sources rs join erp_payments r on r.id = rs.refund_id and r.status = 'posted'
   where rs.source_payment_id = p_payment_id;
  if v_sum + v_refunded > v_pay.amount then
    perform erp_raise('over_allocation',
      case when v_refunded > 0
           then format('沖銷合計 %s 加已退款 %s 超過收付款金額 %s', v_sum, v_refunded, v_pay.amount)
           else format('沖銷合計 %s 超過收付款金額 %s', v_sum, v_pay.amount) end);
  end if;

  -- R3：本次沖銷合計為負（退貨貸項轉預收／預付）→ 沖完後不可再有未沖清的銷貨（進貨）單
  if v_batch < 0 then
    select string_agg(b.doc_no, '、' order by b.doc_date, b.doc_no) into v_open
      from erp_document_balances b
     where b.doc_type = case v_pay.direction when 'in' then 'S' else 'I' end
       and case v_pay.direction when 'in' then b.customer_id else b.vendor_id end
           = coalesce(v_pay.customer_id, v_pay.vendor_id)
       and b.outstanding > 0;
    if v_open is not null then
      perform erp_raise('validation',
        format('沖銷合計為 %s：%s貸項要轉為%s，須先沖清所有未結%s單（尚未沖清：%s）',
               v_batch,
               case v_pay.direction when 'in' then '銷退' else '進退' end,
               case v_pay.direction when 'in' then '預收' else '預付' end,
               case v_pay.direction when 'in' then '銷貨' else '進貨' end,
               v_open));
    end if;
  end if;
end;
$$;

-- ============================================================
-- 5) 收付款過帳（金額可為 0 = 沖抵單，R4）
-- ============================================================
create or replace function erp_post_payment(p_payment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dir      text;
  v_date     date;
  v_method   text;
  v_amount   numeric;
  v_customer uuid;
  v_vendor   uuid;
  v_check_no text;
  v_due      date;
  v_status   text;
  v_bank     text;
  v_id       uuid;
  v_doc_no   text;
  v_has_neg  boolean;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    perform erp_raise('validation', '收付款資料格式錯誤');
  end if;

  begin
    v_dir      := p_payment->>'direction';
    v_date     := nullif(p_payment->>'pay_date', '')::date;
    v_method   := p_payment->>'method';
    v_amount   := nullif(p_payment->>'amount', '')::numeric;
    v_customer := nullif(p_payment->>'customer_id', '')::uuid;
    v_vendor   := nullif(p_payment->>'vendor_id', '')::uuid;
    v_check_no := nullif(btrim(p_payment->>'check_no'), '');
    v_due      := nullif(p_payment->>'check_due_date', '')::date;
    v_status   := nullif(p_payment->>'check_status', '');
    v_bank     := nullif(btrim(p_payment->>'bank'), '');
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform erp_raise('validation', '收付款欄位格式錯誤');
  end;

  if v_dir is null or v_dir not in ('in','out') then
    perform erp_raise('validation', '收付款方向需為 in 或 out');
  end if;
  if v_date is null then
    perform erp_raise('validation', '請填寫收付款日期');
  end if;
  if v_amount is null or v_amount < 0 then
    perform erp_raise('validation', '金額不可為負數');
  end if;
  if v_dir = 'in' and (v_customer is null or v_vendor is not null) then
    perform erp_raise('validation', '收款需指定客戶');
  end if;
  if v_dir = 'out' and (v_vendor is null or v_customer is not null) then
    perform erp_raise('validation', '付款需指定廠商');
  end if;

  if v_amount = 0 then
    -- R4：沖抵單。不收付現金：方式 other、不存票號／銀行；至少一筆負數（SR／PR）沖銷。
    select coalesce(bool_or(x.amount < 0), false) into v_has_neg
      from jsonb_to_recordset(case when jsonb_typeof(p_payment->'allocations') = 'array'
                                   then p_payment->'allocations' else '[]'::jsonb end)
           as x(document_id uuid, amount numeric);
    if not v_has_neg then
      perform erp_raise('validation',
        format('金額 0 為沖抵單，需至少沖銷一張%s單', case v_dir when 'in' then '銷退' else '進退' end));
    end if;
    v_method := 'other';
    v_check_no := null;
    v_due := null;
    v_status := null;
    v_bank := null;
  else
    if v_method is null or v_method not in ('cash','transfer','check','other') then
      perform erp_raise('validation', '付款方式不正確');
    end if;
    if v_method = 'check' and (v_check_no is null or v_due is null) then
      perform erp_raise('validation', '支票需填寫票號與票期');
    end if;
    if v_status is not null and v_status not in ('pending','cleared','bounced') then
      perform erp_raise('validation', '支票狀態不正確');
    end if;
    if v_method = 'check' and v_status is null then
      v_status := 'pending';
    end if;
  end if;

  v_doc_no := erp_next_doc_no(case v_dir when 'in' then 'RC' else 'PM' end, v_date);

  insert into erp_payments (direction, kind, doc_no, pay_date, customer_id, vendor_id, method, amount,
                            check_no, check_due_date, bank, check_status, note)
  values (v_dir, 'payment', v_doc_no, v_date, v_customer, v_vendor, v_method, v_amount,
          v_check_no, v_due, v_bank, v_status,
          nullif(btrim(p_payment->>'note'), ''))
  returning id into v_id;

  if p_payment ? 'allocations' and jsonb_typeof(p_payment->'allocations') = 'array'
     and jsonb_array_length(p_payment->'allocations') > 0 then
    perform erp_allocate_payment(v_id, p_payment->'allocations');
  end if;

  return jsonb_build_object('id', v_id, 'doc_no', v_doc_no);
end;
$$;

-- ============================================================
-- 6) 退款過帳（R5）：依日期先後從預收（預付）扣減
-- ============================================================
create or replace function erp_post_refund(p_refund jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dir      text;
  v_date     date;
  v_method   text;
  v_amount   numeric;
  v_customer uuid;
  v_vendor   uuid;
  v_party    uuid;
  v_check_no text;
  v_due      date;
  v_status   text;
  v_id       uuid;
  v_doc_no   text;
  v_avail    numeric;
  v_left     numeric;
  v_take     numeric;
  v_src      record;
  v_label    text;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if p_refund is null or jsonb_typeof(p_refund) <> 'object' then
    perform erp_raise('validation', '退款資料格式錯誤');
  end if;

  begin
    v_dir      := p_refund->>'direction';
    v_date     := nullif(p_refund->>'pay_date', '')::date;
    v_method   := p_refund->>'method';
    v_amount   := nullif(p_refund->>'amount', '')::numeric;
    v_customer := nullif(p_refund->>'customer_id', '')::uuid;
    v_vendor   := nullif(p_refund->>'vendor_id', '')::uuid;
    v_check_no := nullif(btrim(p_refund->>'check_no'), '');
    v_due      := nullif(p_refund->>'check_due_date', '')::date;
    v_status   := nullif(p_refund->>'check_status', '');
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform erp_raise('validation', '退款欄位格式錯誤');
  end;

  if v_dir is null or v_dir not in ('in','out') then
    perform erp_raise('validation', '退款方向需為 in（退款給客戶）或 out（廠商退款）');
  end if;
  v_label := case v_dir when 'in' then '預收' else '預付' end;
  if v_date is null then
    perform erp_raise('validation', '請填寫退款日期');
  end if;
  if v_method is null or v_method not in ('cash','transfer','check') then
    perform erp_raise('validation', '退款方式需為匯款、現金或支票');
  end if;
  if v_amount is null or v_amount <= 0 then
    perform erp_raise('validation', '退款金額需大於 0');
  end if;
  if v_dir = 'in' and (v_customer is null or v_vendor is not null) then
    perform erp_raise('validation', '退款給客戶需指定客戶');
  end if;
  if v_dir = 'out' and (v_vendor is null or v_customer is not null) then
    perform erp_raise('validation', '廠商退款需指定廠商');
  end if;
  if v_method = 'check' and (v_check_no is null or v_due is null) then
    perform erp_raise('validation', '支票需填寫票號與票期');
  end if;
  if v_status is not null and v_status not in ('pending','cleared','bounced') then
    perform erp_raise('validation', '支票狀態不正確');
  end if;
  if v_method = 'check' and v_status is null then
    v_status := 'pending';
  end if;
  v_party := coalesce(v_customer, v_vendor);

  -- 併發：依 id 鎖定該對象全部有效收付款（與其他退款、補沖銷、作廢互斥），之後才計算餘額
  perform 1 from erp_payments
   where status = 'posted' and kind = 'payment' and direction = v_dir
     and coalesce(customer_id, vendor_id) = v_party
   order by id
     for update;

  select coalesce(sum(b.avail), 0) into v_avail
    from (
      select p.amount
             - coalesce((select sum(a.amount) from erp_payment_allocations a where a.payment_id = p.id), 0)
             - coalesce((select sum(rs.amount) from erp_refund_sources rs
                           join erp_payments r on r.id = rs.refund_id and r.status = 'posted'
                          where rs.source_payment_id = p.id), 0) as avail
        from erp_payments p
       where p.status = 'posted' and p.kind = 'payment' and p.direction = v_dir
         and coalesce(p.customer_id, p.vendor_id) = v_party
    ) b
   where b.avail > 0;

  if v_amount > v_avail then
    perform erp_raise('over_allocation',
      format('退款金額 %s 超過%s餘額 %s', v_amount, v_label, v_avail));
  end if;

  v_doc_no := erp_next_doc_no(case v_dir when 'in' then 'RF' else 'VR' end, v_date);

  insert into erp_payments (direction, kind, doc_no, pay_date, customer_id, vendor_id, method, amount,
                            check_no, check_due_date, bank, check_status, note)
  values (v_dir, 'refund', v_doc_no, v_date, v_customer, v_vendor, v_method, v_amount,
          v_check_no, v_due, nullif(btrim(p_refund->>'bank'), ''), v_status,
          nullif(btrim(p_refund->>'note'), ''))
  returning id into v_id;

  -- FIFO：日期、單號、id
  v_left := v_amount;
  for v_src in
    select p.id,
           p.amount
             - coalesce((select sum(a.amount) from erp_payment_allocations a where a.payment_id = p.id), 0)
             - coalesce((select sum(rs.amount) from erp_refund_sources rs
                           join erp_payments r on r.id = rs.refund_id and r.status = 'posted'
                          where rs.source_payment_id = p.id), 0) as avail
      from erp_payments p
     where p.status = 'posted' and p.kind = 'payment' and p.direction = v_dir
       and coalesce(p.customer_id, p.vendor_id) = v_party
     order by p.pay_date, p.doc_no, p.id
  loop
    exit when v_left <= 0;
    continue when v_src.avail <= 0;
    v_take := least(v_src.avail, v_left);
    insert into erp_refund_sources (refund_id, source_payment_id, amount)
    values (v_id, v_src.id, v_take);
    v_left := v_left - v_take;
  end loop;

  if v_left <> 0 then
    -- 理論上不會發生（上面已檢查總額）；保險起見整筆回滾
    perform erp_raise('over_allocation', format('退款金額 %s 超過%s餘額', v_amount, v_label));
  end if;

  return jsonb_build_object('id', v_id, 'doc_no', v_doc_no);
end;
$$;

-- ============================================================
-- 7) 作廢收付款／退款單
-- ============================================================
create or replace function erp_void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay  erp_payments%rowtype;
  v_refs text;
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    perform erp_raise('validation', '作廢需填寫原因');
  end if;

  select * into v_pay from erp_payments where id = p_payment_id for update;
  if not found then
    perform erp_raise('validation', '找不到收付款');
  end if;
  if v_pay.status <> 'posted' then
    perform erp_raise('not_posted', '收付款已作廢');
  end if;

  if v_pay.kind = 'refund' then
    -- 退款單：刪除來源列，來源收付款的預收（預付）還原
    delete from erp_refund_sources where refund_id = p_payment_id;
  else
    -- 預收（預付）已被退款動用 → 先作廢退款單
    select string_agg(distinct r.doc_no, '、') into v_refs
      from erp_refund_sources rs join erp_payments r on r.id = rs.refund_id and r.status = 'posted'
     where rs.source_payment_id = p_payment_id;
    if v_refs is not null then
      perform erp_raise('has_dependents',
        format('此%s的%s已退款（%s），請先作廢退款單',
               case v_pay.direction when 'in' then '收款' else '付款' end,
               case v_pay.direction when 'in' then '預收' else '預付' end,
               v_refs));
    end if;
    delete from erp_payment_allocations where payment_id = p_payment_id;
  end if;

  update erp_payments
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_payment_id;
end;
$$;

-- ============================================================
-- 8) 函式權限（同 0020 決策 15）
-- ============================================================
revoke execute on function erp_post_refund(jsonb) from public, anon;
grant execute on function erp_post_refund(jsonb) to authenticated;
-- 其餘函式 create or replace 沿用既有權限；再宣告一次以便單獨重跑本檔時也正確
revoke execute on function erp_next_doc_no(text, date) from public, anon, authenticated;
revoke execute on function erp_allocate_payment(uuid, jsonb) from public, anon;
revoke execute on function erp_post_payment(jsonb) from public, anon;
revoke execute on function erp_void_payment(uuid, text) from public, anon;
grant execute on function erp_allocate_payment(uuid, jsonb) to authenticated;
grant execute on function erp_post_payment(jsonb) to authenticated;
grant execute on function erp_void_payment(uuid, text) to authenticated;

-- ============================================================
-- 9) 客戶／廠商餘額：預收（預付）扣除被退款；退款單本身不計（欄位與順序同 0020）
-- ============================================================
create or replace view erp_party_balances
with (security_invoker = true) as
with docs as (
  select case when b.doc_type in ('S','SR') then 'customer' else 'vendor' end as party_type,
         coalesce(b.customer_id, b.vendor_id) as party_id,
         sum(b.outstanding) as balance
  from erp_document_balances b
  group by 1, 2
),
pays as (
  select case when p.direction = 'in' then 'customer' else 'vendor' end as party_type,
         coalesce(p.customer_id, p.vendor_id) as party_id,
         sum(p.amount - coalesce(a.allocated, 0) - coalesce(r.refunded, 0)) as unallocated
  from erp_payments p
  left join (
    select payment_id, sum(amount) as allocated
    from erp_payment_allocations group by payment_id
  ) a on a.payment_id = p.id
  left join (
    select rs.source_payment_id, sum(rs.amount) as refunded
    from erp_refund_sources rs
    join erp_payments rp on rp.id = rs.refund_id and rp.status = 'posted'
    group by rs.source_payment_id
  ) r on r.source_payment_id = p.id
  where p.status = 'posted' and p.kind = 'payment'
  group by 1, 2
)
select coalesce(d.party_type, p.party_type) as party_type,
       coalesce(d.party_id, p.party_id) as party_id,
       coalesce(d.balance, 0) as balance,
       coalesce(p.unallocated, 0) as unallocated
from docs d
full outer join pays p on p.party_type = d.party_type and p.party_id = d.party_id;

revoke all on erp_party_balances from anon;
grant select on erp_party_balances to authenticated;
