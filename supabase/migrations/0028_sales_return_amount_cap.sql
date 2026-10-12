-- 0028：銷退累計金額不得超過原銷貨單（#233）。
--
-- 背景：銷退草稿原以原單價帶入、不扣原單折扣，全退時退款比原單還多。前端已改為以折扣分攤後的淨價帶入
-- （frontend/src/lib/erp/returns.ts），並於存草稿時檢查；但兩張銷退草稿各自未超過、合計超過的情形，
-- 只有過帳時才擋得住，故在 erp_post_document 加上最後一道檢查。
--
-- 規則（僅 doc_type = 'SR' 且有 source_doc_id）：
--   1. 銷退單的幣別、稅別需與原銷貨單相同（金額上限以同幣別、同稅別的明細合計比較；前端存草稿時已強制沿用原單）；
--   2. Σ 已過帳銷退單（同一 source_doc_id）＋ 本單 的明細合計（品項 + 折扣行金額，過帳重算後）
--      ≤ 原銷貨單明細合計，否則 validation「累計銷退金額 … 超過原銷貨單 …」。
--      外加／免稅時明細合計即未稅合計；內含稅時為含稅合計（同稅別下與未稅比較等價，且無逐張四捨五入誤差）。
--      已作廢、草稿的銷退單不計。
--   3. 併發：銷退單過帳時先以 for update 鎖定來源銷貨單（原為 for share），同一銷貨單的銷退過帳因此序列化，
--      避免兩張銷退同時過帳各自看不到對方而合計超過。鎖在既有 for share 語句之前取得（同一列、同一交易，
--      之後的 for share 不會再等待），不影響其他單別；作廢銷貨單本就以 for update 鎖定，互斥行為不變。
--
-- 變更：只有 erp_post_document，以 0025 為底 create or replace，新增上述兩段（標「0028」）。
-- 未新增欄位／約束。舊前端搭配本檔：銷退以原價帶入時，若累計超過原單會在過帳時被擋（即本 issue 要擋的情形）；
-- 新前端搭配舊 DB：存草稿時仍會檢查，只是缺少過帳時的最後防線。兩者先後皆可，建議先套本檔。
-- 本檔可重複執行（create or replace；函式權限沿用 0020，不會重設）。

create or replace function erp_post_document(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc        erp_documents%rowtype;
  v_src        erp_documents%rowtype;
  v_item       erp_items%rowtype;
  v_ser        erp_serials%rowtype;
  v_line       record;
  v_srcl       record;
  v_cust       record;
  v_vend       record;
  v_expect     text;
  v_cnt        int;
  v_sn         text;
  v_used       numeric;
  v_src_sum    numeric;   -- 0028：原銷貨單明細合計
  v_ret_sum    numeric;   -- 0028：累計銷退明細合計（含本單）
  v_item_sum   numeric;
  v_disc_sum   numeric;
  v_tax        record;
  v_q0         numeric;
  v_c0         numeric;
  v_cost       numeric;
  v_amt        numeric;
  v_doc_no     text;
  v_serial_id  uuid;
  v_machine_id uuid;
  v_created    boolean;
  v_warnings   text[] := '{}';
  v_machines   uuid[] := '{}';
begin
  if not has_module('erp') then
    perform erp_raise('forbidden', '沒有 ERP 模組權限');
  end if;

  -- 1. 鎖定單據
  select * into v_doc from erp_documents where id = p_doc_id for update;
  if not found then
    perform erp_raise('validation', '找不到單據');
  end if;
  if v_doc.status <> 'draft' then
    perform erp_raise('not_draft', format('單據狀態為 %s，只能過帳草稿', v_doc.status));
  end if;

  -- 2. 表頭驗證
  if v_doc.doc_type in ('I','PR','S','SR','A','T') and v_doc.warehouse_id is null then
    perform erp_raise('validation', '請指定倉庫');
  end if;
  if v_doc.tax_rate < 0 or v_doc.exchange_rate <= 0 then
    perform erp_raise('validation', '稅率不可為負、匯率需大於 0');
  end if;

  -- 0028：銷退單先以 for update 鎖定來源銷貨單，序列化同一銷貨單的銷退過帳（累計金額檢查，見步驟 3 之後）。
  -- 須在下方 for share 之前取得（先 share 再升級為 update 可能與另一張銷退互相等待而死結）。
  if v_doc.doc_type = 'SR' and v_doc.source_doc_id is not null then
    perform 1 from erp_documents where id = v_doc.source_doc_id for update;
  end if;

  -- 併發（決策 19）：來源單據 for share（與作廢的 for update 互斥）、來源行 for update（序列化超收／超退檢查），
  -- 皆依 id 排序一次鎖定；鎖到後才讀狀態與累計量（read committed 下新語句看得到對方已提交的結果）。
  perform 1 from erp_documents sd
   where sd.id = v_doc.source_doc_id
      or sd.id in (select sl.document_id
                     from erp_document_lines l
                     join erp_document_lines sl on sl.id = l.source_line_id
                    where l.document_id = p_doc_id)
   order by sd.id
     for share;
  perform 1 from erp_document_lines sl
   where sl.id in (select l.source_line_id from erp_document_lines l
                    where l.document_id = p_doc_id and l.source_line_id is not null)
   order by sl.id
     for update;

  if v_doc.source_doc_id is not null then
    select * into v_src from erp_documents where id = v_doc.source_doc_id for share;
    v_expect := case v_doc.doc_type when 'S' then 'Q' when 'I' then 'P'
                                    when 'SR' then 'S' when 'PR' then 'I' end;
    if not found or v_expect is null or v_src.doc_type <> v_expect then
      perform erp_raise('validation', '來源單據類型不符');
    end if;
    if v_src.status <> 'posted' then
      perform erp_raise('validation', format('來源單據 %s 尚未過帳或已作廢', coalesce(v_src.doc_no, '(草稿)')));
    end if;
    if v_src.customer_id is distinct from v_doc.customer_id
       or v_src.vendor_id is distinct from v_doc.vendor_id then
      perform erp_raise('validation', '來源單據的客戶／廠商與本單不同');
    end if;
  end if;

  if not exists (select 1 from erp_document_lines
                 where document_id = p_doc_id and line_type = 'item') then
    perform erp_raise('validation', '單據至少需要一個品項行');
  end if;

  -- 2. 行驗證
  for v_line in
    select l.*, i.code as item_code, i.track_serial, i.track_stock
    from erp_document_lines l
    left join erp_items i on i.id = l.item_id
    where l.document_id = p_doc_id
    order by l.line_no
  loop
    -- 0025：小計行只開放報價單（形狀由 erp_document_lines_subtotal_check 約束保證）
    if v_line.line_type = 'subtotal' and v_doc.doc_type <> 'Q' then
      perform erp_raise('validation', format('第 %s 行「小計」只能用於報價單', v_line.line_no));
    end if;

    if v_line.line_type = 'item' then
      if v_line.item_id is null then
        if v_doc.doc_type <> 'Q' then
          perform erp_raise('validation', format('第 %s 行未指定品項', v_line.line_no));
        end if;
        if coalesce(btrim(v_line.item_text), '') = '' and coalesce(btrim(v_line.description), '') = '' then
          perform erp_raise('validation', format('第 %s 行請選擇品項或填寫品名規格', v_line.line_no));
        end if;
        v_line.item_code := coalesce(nullif(btrim(v_line.item_text), ''), btrim(v_line.description));
      end if;
      if v_line.qty = 0 then
        perform erp_raise('validation', format('第 %s 行（%s）數量不可為 0', v_line.line_no, v_line.item_code));
      end if;
      if v_line.qty < 0 and v_doc.doc_type <> 'A' then
        perform erp_raise('validation', format('第 %s 行（%s）數量需為正數', v_line.line_no, v_line.item_code));
      end if;
      if v_doc.doc_type = 'A' and coalesce(btrim(v_line.description), '') = '' then
        perform erp_raise('validation', format('第 %s 行需填寫調整原因', v_line.line_no));
      end if;

      -- 序號數量
      if v_line.track_serial and v_doc.doc_type not in ('Q','P') then
        if abs(v_line.qty) <> trunc(abs(v_line.qty)) then
          perform erp_raise('validation', format('第 %s 行（%s）追蹤機號的品項數量需為整數', v_line.line_no, v_line.item_code));
        end if;
        if v_doc.doc_type = 'I' or (v_doc.doc_type = 'A' and v_line.qty > 0) then
          select count(*), count(distinct lower(btrim(x)))
            into v_cnt, v_used
            from unnest(coalesce(v_line.serial_nos, '{}'::text[])) as x
           where btrim(x) <> '';
          if v_cnt <> v_used or v_cnt <> coalesce(cardinality(v_line.serial_nos), 0) then
            perform erp_raise('validation', format('第 %s 行（%s）機號有空白或重複', v_line.line_no, v_line.item_code));
          end if;
          if v_cnt <> abs(v_line.qty) then
            perform erp_raise('validation', format('第 %s 行（%s）機號數 %s 與數量 %s 不符', v_line.line_no, v_line.item_code, v_cnt, v_line.qty));
          end if;
        else
          select count(*) into v_cnt from erp_document_line_serials where line_id = v_line.id;
          if v_cnt <> abs(v_line.qty) then
            perform erp_raise('validation', format('第 %s 行（%s）選取機號數 %s 與數量 %s 不符', v_line.line_no, v_line.item_code, v_cnt, v_line.qty));
          end if;
        end if;
      end if;

      -- 來源行
      if v_line.source_line_id is not null then
        select l.*, d.doc_type as src_doc_type, d.status as src_status,
               d.customer_id as src_customer_id, d.vendor_id as src_vendor_id
          into v_srcl
          from erp_document_lines l join erp_documents d on d.id = l.document_id
         where l.id = v_line.source_line_id
           for update of l
           for share of d;
        v_expect := case v_doc.doc_type when 'S' then 'Q' when 'I' then 'P'
                                        when 'SR' then 'S' when 'PR' then 'I' end;
        if v_srcl.id is null or v_expect is null or v_srcl.src_doc_type <> v_expect
           or v_srcl.src_status <> 'posted'
           or v_srcl.item_id is distinct from v_line.item_id
           or v_srcl.src_customer_id is distinct from v_doc.customer_id
           or v_srcl.src_vendor_id is distinct from v_doc.vendor_id
           or (v_doc.source_doc_id is not null and v_srcl.document_id <> v_doc.source_doc_id) then
          perform erp_raise('validation', format('第 %s 行的來源行不正確', v_line.line_no));
        end if;

        if v_doc.doc_type in ('I','SR','PR') then
          select coalesce(sum(l.qty), 0) into v_used
            from erp_document_lines l join erp_documents d on d.id = l.document_id
           where l.source_line_id = v_line.source_line_id
             and l.line_type = 'item'
             and (d.id = p_doc_id or (d.status = 'posted' and d.doc_type = v_doc.doc_type));
          if v_used > v_srcl.qty then
            if v_doc.doc_type = 'I' then
              perform erp_raise('over_receipt',
                format('品項 %s 累計進貨 %s 超過採購數量 %s', v_line.item_code, v_used, v_srcl.qty));
            else
              perform erp_raise('validation',
                format('品項 %s 累計退貨 %s 超過原單數量 %s', v_line.item_code, v_used, v_srcl.qty));
            end if;
          end if;
        end if;
      end if;
    end if;
  end loop;

  -- 3. 重算金額（§5.1）
  update erp_document_lines
     set amount = case line_type
                    when 'item' then round(qty * unit_price, 2)
                    when 'note' then 0
                    when 'subtotal' then 0        -- 0025：小計為顯示用，金額由前端計算，不計入合計
                    else round(-abs(amount), 2)   -- 折扣一律存負數（與 calc.ts 一致）
                  end
   where document_id = p_doc_id;

  select coalesce(sum(amount) filter (where line_type = 'item'), 0),
         coalesce(sum(amount) filter (where line_type = 'discount'), 0)
    into v_item_sum, v_disc_sum
    from erp_document_lines where document_id = p_doc_id;

  select * into v_tax
    from erp_calc_tax(v_item_sum + v_disc_sum, v_doc.tax_type, v_doc.tax_rate, v_doc.currency, v_doc.exchange_rate);

  -- 0028：銷退累計金額（明細合計）不得超過原銷貨單（#233）。v_src 已於表頭驗證時讀取並確認為已過帳銷貨單。
  if v_doc.doc_type = 'SR' and v_doc.source_doc_id is not null then
    if v_doc.currency is distinct from v_src.currency or v_doc.tax_type is distinct from v_src.tax_type then
      perform erp_raise('validation',
        format('銷退單的幣別、稅別需與原銷貨單 %s 相同（%s／%s）',
               coalesce(v_src.doc_no, ''), v_src.currency,
               case v_src.tax_type when 'excluded' then '外加稅' when 'included' then '內含稅' else '免稅' end));
    end if;
    select coalesce(sum(l.amount), 0) into v_src_sum
      from erp_document_lines l
     where l.document_id = v_doc.source_doc_id and l.line_type in ('item', 'discount');
    select coalesce(sum(l.amount), 0) into v_ret_sum
      from erp_document_lines l join erp_documents d on d.id = l.document_id
     where d.source_doc_id = v_doc.source_doc_id
       and d.doc_type = 'SR'
       and (d.id = p_doc_id or d.status = 'posted')
       and l.line_type in ('item', 'discount');
    if v_ret_sum > v_src_sum then
      perform erp_raise('validation',
        format('累計銷退金額 %s 超過原銷貨單 %s 的金額 %s（本單 %s、其他已過帳銷退 %s），請調低退貨單價或數量',
               v_ret_sum, coalesce(v_src.doc_no, ''), v_src_sum,
               v_item_sum + v_disc_sum, v_ret_sum - (v_item_sum + v_disc_sum)));
    end if;
  end if;

  -- 4. 取號
  v_doc_no := coalesce(v_doc.doc_no, erp_next_doc_no(v_doc.doc_type, v_doc.doc_date));

  -- 5. 快照客戶／廠商（空白才補）
  if v_doc.customer_id is not null then
    select * into v_cust from mx_customers where id = v_doc.customer_id;
    v_doc.party_name    := coalesce(v_doc.party_name, v_cust.invoice_title, v_cust.name);
    v_doc.party_tax_id  := coalesce(v_doc.party_tax_id, v_cust.tax_id);
    v_doc.party_contact := coalesce(v_doc.party_contact, v_cust.contact_person);
    v_doc.party_phone   := coalesce(v_doc.party_phone, v_cust.phone);
    v_doc.party_address := coalesce(v_doc.party_address, v_cust.delivery_address, v_cust.address);
    v_doc.sales_rep     := coalesce(v_doc.sales_rep, v_cust.sales_rep);
  elsif v_doc.vendor_id is not null then
    select * into v_vend from erp_vendors where id = v_doc.vendor_id;
    v_doc.party_name    := coalesce(v_doc.party_name, v_vend.name);
    v_doc.party_tax_id  := coalesce(v_doc.party_tax_id, v_vend.tax_id);
    v_doc.party_contact := coalesce(v_doc.party_contact, v_vend.contact_person);
    v_doc.party_phone   := coalesce(v_doc.party_phone, v_vend.phone);
    v_doc.party_address := coalesce(v_doc.party_address, v_vend.address);
  end if;

  update erp_documents
     set doc_no = v_doc_no,
         status = 'posted',
         posted_at = now(),
         posted_by = auth.uid(),
         amount_untaxed = v_tax.amount_untaxed,
         tax_amount = v_tax.tax_amount,
         total_amount = v_tax.total_amount,
         total_twd = v_tax.total_twd,
         party_name = v_doc.party_name,
         party_tax_id = v_doc.party_tax_id,
         party_contact = v_doc.party_contact,
         party_phone = v_doc.party_phone,
         party_address = v_doc.party_address,
         sales_rep = v_doc.sales_rep
   where id = p_doc_id;

  -- 6. 庫存／成本／序號（§5.2）
  if v_doc.doc_type in ('I','PR','S','SR','T','A') then
    -- 決策 19：先依 item_id 一次鎖定本單全部品項（之後的存量列、機號都在品項鎖之下異動），避免死結
    perform 1 from erp_items
     where id in (select l.item_id from erp_document_lines l
                   where l.document_id = p_doc_id and l.line_type = 'item' and l.item_id is not null)
     order by id
       for update;

    for v_line in
      select l.*
      from erp_document_lines l
      join erp_items i on i.id = l.item_id
      where l.document_id = p_doc_id and l.line_type = 'item' and i.track_stock
      order by l.line_no
    loop
      select * into v_item from erp_items where id = v_line.item_id for update;
      select coalesce(sum(qty), 0) into v_q0 from erp_stock_levels where item_id = v_item.id;
      v_c0 := v_item.avg_cost;

      if v_doc.doc_type = 'I' then
        -- in_cost：折扣依行金額比例分攤（決策 2）
        v_amt := v_line.amount;
        if v_item_sum <> 0 then
          v_amt := v_amt + v_disc_sum * v_line.amount / v_item_sum;
        end if;
        v_cost := round(v_amt / v_line.qty * v_doc.exchange_rate, 4);

        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_in(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'SR' then
        v_cost := v_c0;
        if v_line.source_line_id is not null then
          select coalesce(unit_cost, v_c0) into v_cost from erp_document_lines where id = v_line.source_line_id;
        end if;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_in(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'PR' then
        v_cost := v_c0;
        if v_line.source_line_id is not null then
          select coalesce(unit_cost, v_c0) into v_cost from erp_document_lines where id = v_line.source_line_id;
        end if;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_items set avg_cost = erp_avg_out(v_q0, v_c0, v_line.qty, v_cost) where id = v_item.id;
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'S' then
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'T' then
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, -v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        perform erp_stock_apply(v_item.id, v_doc.to_warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;

      elsif v_doc.doc_type = 'A' then
        -- 盤盈／盤虧皆以 C0 入出帳，avg 不變
        v_cost := v_c0;
        perform erp_stock_apply(v_item.id, v_doc.warehouse_id, v_line.qty, v_cost, p_doc_id, v_line.id, v_doc.doc_date);
        update erp_document_lines set unit_cost = v_cost where id = v_line.id;
      end if;

      if not v_item.track_serial then
        continue;
      end if;

      -- 序號效果
      if v_doc.doc_type = 'I' or (v_doc.doc_type = 'A' and v_line.qty > 0) then
        foreach v_sn in array v_line.serial_nos loop
          v_sn := btrim(v_sn);
          if exists (select 1 from erp_serials
                     where item_id = v_item.id and lower(btrim(serial_no)) = lower(v_sn)) then
            perform erp_raise('serial_unavailable', format('品項 %s 機號 %s 已存在', v_item.code, v_sn));
          end if;
          begin
            insert into erp_serials (item_id, serial_no, status, warehouse_id, unit_cost, in_doc_id)
            values (v_item.id, v_sn, 'in_stock', v_doc.warehouse_id, v_cost, p_doc_id)
            returning id into v_serial_id;
          exception when unique_violation then
            -- 決策 20：併發交易同時建立相同機號
            perform erp_raise('serial_unavailable', format('品項 %s 機號 %s 已存在', v_item.code, v_sn));
          end;
          insert into erp_document_line_serials (line_id, serial_id) values (v_line.id, v_serial_id);
        end loop;
      else
        for v_ser in
          select s.* from erp_document_line_serials ls
          join erp_serials s on s.id = ls.serial_id
          where ls.line_id = v_line.id
          order by s.serial_no
          for update of s
        loop
          if v_ser.item_id <> v_item.id then
            perform erp_raise('serial_unavailable', format('機號 %s 不屬於品項 %s', v_ser.serial_no, v_item.code));
          end if;

          if v_doc.doc_type = 'SR' then
            if v_ser.status <> 'sold' or v_ser.customer_id is distinct from v_doc.customer_id then
              perform erp_raise('serial_unavailable', format('機號 %s 不是售予此客戶的機台', v_ser.serial_no));
            end if;
            update erp_serials
               set status = 'in_stock', warehouse_id = v_doc.warehouse_id, customer_id = null
             where id = v_ser.id;
          else
            -- S / PR / T / A 盤虧：須 in_stock 且在出庫倉
            if v_ser.status <> 'in_stock' or v_ser.warehouse_id is distinct from v_doc.warehouse_id then
              perform erp_raise('serial_unavailable', format('機號 %s 不在此倉庫存中', v_ser.serial_no));
            end if;

            if v_doc.doc_type = 'PR' then
              update erp_serials
                 set status = 'returned_to_vendor', warehouse_id = null, out_doc_id = p_doc_id
               where id = v_ser.id;
            elsif v_doc.doc_type = 'T' then
              update erp_serials set warehouse_id = v_doc.to_warehouse_id where id = v_ser.id;
            elsif v_doc.doc_type = 'A' then
              update erp_serials
                 set status = 'written_off', warehouse_id = null, out_doc_id = p_doc_id
               where id = v_ser.id;
            elsif v_doc.doc_type = 'S' then
              update erp_serials
                 set status = 'sold', warehouse_id = null, customer_id = v_doc.customer_id, out_doc_id = p_doc_id
               where id = v_ser.id;

              -- 保養卡機台：同客戶 + 卡別 + 機號的未封存機台直接連結，否則建立
              if v_item.mx_card_type is not null then
                v_machine_id := null;
                select m.id into v_machine_id
                  from mx_machines m
                 where m.customer_id = v_doc.customer_id
                   and m.card_type = v_item.mx_card_type
                   and m.archived_at is null
                   and m.serial_no is not null
                   and lower(btrim(m.serial_no)) = lower(btrim(v_ser.serial_no))
                 order by (m.machine_no is null or btrim(m.machine_no) = '') desc, m.created_at
                 limit 1;

                if v_machine_id is not null then
                  v_created := false;
                  v_warnings := v_warnings || format('機號 %s 已有保養卡機台，已直接連結', v_ser.serial_no);
                else
                  insert into mx_machines (customer_id, card_type, serial_no, model, purchased_at)
                  values (v_doc.customer_id, v_item.mx_card_type, btrim(v_ser.serial_no),
                          coalesce(v_item.model, v_item.name), v_doc.doc_date)
                  returning id into v_machine_id;
                  v_created := true;
                end if;

                update erp_serials set mx_machine_id = v_machine_id where id = v_ser.id;
                update erp_document_line_serials
                   set mx_machine_id = v_machine_id, mx_machine_created = v_created
                 where line_id = v_line.id and serial_id = v_ser.id;
                v_machines := v_machines || v_machine_id;
              end if;
            end if;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'doc_no', v_doc_no,
    'warnings', to_jsonb(v_warnings),
    'mx_machine_ids', to_jsonb(v_machines)
  );
end;
$$;
