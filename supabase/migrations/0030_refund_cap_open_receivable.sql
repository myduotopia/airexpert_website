-- 0030：退款上限改為「預收 − 未結應收」（#253，來源 #252 review D1）。
--
-- ── 背景 ───────────────────────────────────────────────────────────
-- 0029 的 erp_post_refund 只檢查「退款 ≤ 預收（預付）」（R5）。客戶若還有沒付清的銷貨單，
-- 仍可把預收全額退掉，等於把錢退給還欠款的客戶。例：沖抵後預收 9,500，之後作廢原收款使應收回到 20,000，
-- 0029 仍允許退款 9,500。產品決定：退款最多只能退「預收扣掉未結應收」。
--
-- ── 定義（客戶端；廠商端比照：預付、未結應付、I／PR）──────────────────
--   未結應收淨額 v_open = 該客戶已過帳、未作廢的 S、SR 在 erp_document_balances 的 outstanding 合計
--     （SR 為負數，會降低應收）＝ erp_party_balances.balance。
--   預收 v_avail = 該客戶有效收款（kind = payment）的 unallocated（金額 − 沖銷 − 被退款）合計
--     ＝ erp_party_balances.unallocated（R2 保證每張 ≥ 0，0029 只加總 > 0 者，兩者相等）。
--   淨額 = balance − unallocated = Σ 未沖單據 − 預收（> 0 客戶欠我們；< 0 我們欠客戶）。
--   可退上限 = max(0, −淨額) = max(0, 預收 − 未結應收淨額)。
--   另 R5（0029）：退款只能從預收扣減，不可超過預收。未結應收淨額 < 0（銷退貸項尚未以 0 元沖抵單轉為預收）時
--   −淨額 > 預收，此時上限仍是預收；故實際上限 v_cap = max(0, 預收 − max(未結應收淨額, 0))
--   ＝ least(預收, max(0, −淨額))。前端 refund.ts 的 refundCap 同公式。
--
-- ── 檢查順序（在既有「依日期扣減預收」之前）────────────────────────
--   1. 未結應收淨額 > 0 且 退款金額 > v_cap → validation，訊息列出預收、未結應收、可退上限、本次退款金額，
--      並提示先以「補沖銷」把預收沖到未結單據。（金額同時超過預收時也走這條，一次給齊資訊。）
--   2. 否則沿用 0029 R5：退款金額 > 預收 → over_allocation（未結應收淨額 ≤ 0 時上限就是預收）。
--
-- ── 鎖（沿用 0029：依 id 以 for update 鎖該對象全部有效收付款；本檔不新增鎖、不鎖單據）──────
--   會改變「預收」或「未結應收」的操作，與退款的關係：
--   a. 補沖銷 erp_allocate_payment：先 for update 鎖該收付款（必為已鎖集合中的一張）→ 與退款互斥、序列化；
--      且補沖銷使預收與未結應收同額減少，上限不變。
--   b. 作廢收付款 erp_void_payment：for update 鎖該收付款 → 與退款互斥。作廢原收款會讓應收回升（D1 的情境）：
--      作廢先提交時，退款等鎖後以新快照重算（plpgsql 每個語句取新快照；鎖語句會重新評估 status），看到應收回升而被擋；
--      退款先提交時，作廢在其後執行，屬「先退款、後作廢」的合法順序（作廢本就可使客戶轉為欠款）。
--   c. 新銷貨（進貨）過帳 erp_post_document、作廢無沖銷的 SR（PR）：會提高未結應收，但不讀預收、也不檢查上限；
--      退款只讀已提交的單據（讀時不鎖）。兩者同時時，結果等同「先退款、後過帳（作廢）」的序列順序，
--      退款當下確實沒有欠款，不算超退。要讓退款等待進行中的銷貨過帳，須在兩邊加共同的鎖（例如客戶列），
--      得改 erp_post_document，風險與收益不成比例，故不做。
--   d. 新收款（含 0 元沖抵單）erp_post_payment、新銷退過帳、作廢無沖銷的 S（I）：只會讓上限持平或變大；
--      退款看不到尚未提交者，最多保守地少退，不會超退。
--   e. 兩張退款同時：0029 的收付款鎖已序列化，後者看到前者已扣減的預收。
--   已鎖收付款的預收在取得鎖後即固定（能改它的補沖銷、作廢、退款都要先鎖同一批收付款）；
--   未結應收只會因 c、d 改變（a 的補沖銷被鎖擋住），且 c、d 都不讀預收、不檢查上限，
--   故讀預收與讀未結應收即使不在同一快照，結果也等同某個序列順序，不會超過該順序下的上限。
--   死結：退款只鎖收付款（依 id），不鎖單據；erp_allocate_payment 先鎖收付款、再鎖單據，
--   erp_post_document／erp_void_document 只鎖單據與品項／機號，不鎖收付款 → 沒有反向的等待鏈，與 0029 相同。
--   （0029 既有限制，未改：鎖之後才提交的新收款不在鎖集合內，但後續語句看得到、可能被計入預收並被 FIFO 扣減；
--    若同時有人對該新收款補沖銷，兩邊各自看不到對方未提交的寫入。視窗極短且需同一對象同時新增收款，本檔不處理。）
--
-- ── 變更 ───────────────────────────────────────────────────────────
--   只有 erp_post_refund：以 0029 為底 create or replace，新增 v_open／v_cap 與上述檢查（標「0030」），其餘逐字相同。
--   未新增欄位／約束／資料。函式權限 create or replace 沿用；仍再宣告一次以便單獨重跑。
--
-- 上線順序：與前端先後皆可，建議先套本檔（DB 為最後防線）。
--   舊前端搭配本檔：超過上限的退款在過帳時被 validation 擋下，訊息（detail）直接顯示給使用者。
--   新前端搭配舊 DB：前端檢核會擋，只是缺少 DB 的最後防線。
-- 既有資料：不改任何列；已過帳的退款單（例如正式 DB 的 RF11510001）不重新檢查，作廢退款單的行為不變。
--   只影響本檔套用後新過帳的退款單。
-- 本檔可重複執行（create or replace；grant／revoke 冪等）。
-- 注意：重跑 0029 會把 erp_post_refund 蓋回 0029 版，故本檔須排在 0029 之後重跑（local-db.sh 放最後）。

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
  v_open     numeric;
  v_cap      numeric;
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
    v_amount   := round(nullif(p_refund->>'amount', '')::numeric, 2);
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

  -- 0030：可退上限 = 預收 − 未結應收淨額（= erp_party_balances 的 unallocated − balance；SR／PR 為負數）。
  -- 未結應收淨額 ≤ 0 時上限即預收，交給下方 R5。單據讀時不鎖（理由見檔頭「鎖」）。
  select coalesce(sum(b.outstanding), 0) into v_open
    from erp_document_balances b
   where b.doc_type in (case v_dir when 'in' then 'S' else 'I' end, case v_dir when 'in' then 'SR' else 'PR' end)
     and case v_dir when 'in' then b.customer_id else b.vendor_id end = v_party;
  v_cap := greatest(0, v_avail - greatest(v_open, 0));

  if v_open > 0 and v_amount > v_cap then
    perform erp_raise('validation',
      format('退款金額 %s 超過可退上限 %s（%s %s、未結%s %s；可退上限 = %s − 未結%s，最低為 0）。%s還有未結%s，請先以「補沖銷」把%s沖到未結單據',
             to_char(v_amount, 'FM999,999,999,990.00'),
             to_char(v_cap, 'FM999,999,999,990.00'),
             v_label, to_char(v_avail, 'FM999,999,999,990.00'),
             case v_dir when 'in' then '應收' else '應付' end,
             to_char(v_open, 'FM999,999,999,990.00'),
             v_label,
             case v_dir when 'in' then '應收' else '應付' end,
             case v_dir when 'in' then '客戶' else '廠商' end,
             case v_dir when 'in' then '應收' else '應付' end,
             v_label));
  end if;

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

-- 函式權限（同 0029 §8）：create or replace 沿用既有權限；再宣告一次以便單獨重跑本檔時也正確
revoke execute on function erp_post_refund(jsonb) from public, anon;
grant execute on function erp_post_refund(jsonb) to authenticated;
