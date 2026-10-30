-- 0041_service_report_card_sync.sql
-- 維護報告單結案時同步一列到保養卡（issue #280，決策 #279 §5-1「報告單為主、結案時同步一列到保養卡」）。
--   * 欄位：mx_records.source_service_report_id（nullable、FK sr_reports、唯一）＝這列由哪張報告單同步而來。
--           同一張報告單最多一列，重新開啟後再結案是「更新同一列」而不是新增第二列。
--   * 函式：
--       sr_card_sync_apply(p_report_id, p_allow_insert)：security definer，依報告單「目前狀態」對帳（不檢查權限，只給受信任身分）：
--         已結案且有機台 → upsert 一列（以 source_service_report_id 為衝突鍵）；p_allow_insert = false 時只更新既有同步列、不新增；
--         已作廢、或已結案但機台已清空 → 刪除該報告單同步過的列；
--         草稿／已列印（含重新開啟）→ 不動（保留上次同步的列，再結案時更新同一列）。
--       sr_sync_card_record(p_report_id, p_allow_insert default true)：security definer，第一行檢查 has_module('service_report')，再呼叫上者。
--         授權 authenticated（可手動重新對帳；觸發器替 API 角色呼叫的也是這支）。
--       sr_card_part_column(name)／sr_card_cell(parts)／sr_card_trim(text)：料件 → 保養卡欄位的對應規則（純函式）。
--   * 觸發器 sr_reports_card_sync（AFTER UPDATE ON sr_reports）：
--       狀態改變 → 對帳（結案＝新增或更新同一列；作廢＝刪除；重新開啟＝不動）；
--       已結案、狀態沒變，但「同步會用到的欄位」有變（機台、日期、單號、服務項目、記要、回填結果、料件、維護人員）
--         → 只更新既有同步列（沒有同步列就不新增，見決策 7）；
--       其他更新（列印次數／列印時間、保養階段、內部備註、表頭快照、updated_at…）不觸發，不會覆蓋保養卡上的手動修改。
--     結案／作廢／已結案再編輯與同步在「同一個交易」完成，不會出現報告單已結案但保養卡沒寫到的半套狀態。
-- 依賴 0011（mx_records／mx_machines）、0014（mx_records.service_type）、0015（card_type、mx_machine_columns、
--   mx_records.values）、0021（sr_reports、錯誤契約、受信任身分判斷）、0032（has_module 職位權限版）。
-- 不修改任何既有物件（不動 sr_guard_report、mx_records 的 policy 與既有欄位）。
--
-- ⚠️ 套用正式 DB 前需使用者確認並先備份（以 pooler 連線或 SQL Editor 貼上執行，身分須為 postgres）。
-- ⚠️ 套用後，之後每次結案都會寫保養卡；本檔不回填既有已結案的報告單（避免和已手動／拍照匯入的保養卡列重複）。
--    已結案的舊單「重新開啟後再結案」或以 service_report 帳號呼叫 sr_sync_card_record(<報告單 id>) 才會補寫；
--    只編輯舊單內容不會新增列（決策 7）。
-- 本檔可重複執行：add column / create index if not exists、create or replace function、drop trigger if exists 後再建立。
--
-- 錯誤契約（沿用 0020 §9）：raise exception using errcode = 'P0001', message = '<code>', detail = '<中文訊息>'
--   code ∈ forbidden
--
-- 欄位對應（前端 frontend/src/lib/service-report/card-sync.ts 為同規則的 TS 版，供詳情頁預覽；兩邊改動需同步）：
--   service_date ← report_date
--   hours        ← 空壓機卡：results.compressor.run_hours（運轉時數）；過濾卡：results.dryer.total_hours（乾燥機總時數）
--   technician   ← technician（主技師姓名快照）
--   service_type ← service_items，優先順序：periodic → maintenance（保養）＞ repair → repair（維修）
--                  ＞ new_trial／routine → inspection（例檢）；只有 other 或未勾 → null（待人工判定）
--   料件（只看數量非空白的列；品名含「工資」者為工資不是料件，略過）：
--     空壓機卡：品名關鍵字（去空白後，依序第一個命中者）
--       油氣分離 → oil_separator；機油濾／油濾 → oil_filter；空氣濾／空濾 → air_filter；變頻 → inverter；
--       過濾／濾蕊／濾芯 → filter_system；專用油／潤滑油／機油／螺旋油 → oil；其他 → 記入備註「其他料件」
--     過濾卡：品名與該卡耗材欄名（去空白、小寫）完全相同 → values[欄 id]；其他 → 記入備註「其他料件」
--     同一格只有一個料件時填數量（如「1」）；多個料件落在同一格時填「品名×數量」以「、」串接。
--   note         ← 修護記要及建議（summary）＋「其他料件：品名×數量、…」＋「維護報告單 <派工單號>」（各一行）
--   source       ← 'manual'（0011 的 check 只允許 manual／photo；來源以 source_service_report_id 辨識）
--
-- 實作決策：
--   1. 同步放在 AFTER UPDATE 觸發器、而非 server action 結案後另外呼叫 RPC：兩個請求不是同一個交易，
--      第二步失敗會留下「已結案但沒寫保養卡」或「已作廢但保養卡還在」的狀態。觸發器與結案同交易，
--      也涵蓋作廢、重新開啟、已結案再編輯與 SQL 直接改狀態。
--   2. 寫 mx_records 需繞過 RLS（只有 service_report、沒有 maintenance 的帳號也要能結案），故由 security definer 執行。
--      觸發器函式本身為 security invoker，以 current_user 判斷呼叫者（沿用 0021 的受信任身分判斷）：
--      API 角色（authenticated／anon）→ 走 sr_sync_card_record（檢查 has_module('service_report')）；
--      postgres／service_role／definer RPC（例：ERP 作廢銷貨刪機台的 FK set null）→ 直接 sr_card_sync_apply。
--   3. source_service_report_id on delete set null：報告單只有「未列印的草稿」能刪（不會有同步列）；
--      若維運刪除已結案單，保養卡上的紀錄保留為一般紀錄，不跟著消失。
--   4. 重新開啟不刪同步列：之後再結案以同一列更新；改為作廢才刪除。
--   5. 報告單為主：保養卡上被手動修改過的同步列，下次對帳（再結案／已結案再編輯）會被報告單內容覆蓋。
--   6. 機台改掛到另一張卡（已結案再編輯換機台）→ 同一列改掛到新機台並依新卡別重算欄位。
--   7. 已結案再編輯（狀態沒變）只更新既有同步列、不新增：本檔不回填上線前已結案的報告單，那些單多半已手動／
--      拍照登錄在保養卡上；若編輯舊單就新增一列會與手動登錄重複。新增只發生在「結案」那一刻（或手動呼叫 RPC）。
--      代價：結案時沒掛機台、事後才補掛機台的單不會自動寫入，需重新開啟後再結案（詳情頁會提示）。
--   8. 觸發條件收斂到同步會用到的欄位：列印已結案的單（print_count／last_printed_at）、改保養階段等更新不對帳，
--      避免每次列印都把保養卡上手動修正過的同步列蓋回去。

-- ============================================================
-- 1) 欄位與唯一索引
-- ============================================================
alter table mx_records
  add column if not exists source_service_report_id uuid
    references sr_reports(id) on delete set null;

-- 唯一（null 不受限）：一張報告單最多同步一列；也是 upsert 的衝突鍵。
create unique index if not exists mx_records_source_service_report_key
  on mx_records (source_service_report_id);

comment on column mx_records.source_service_report_id is
  '由哪張維護報告單結案同步而來（0041）；null＝手動或拍照匯入。報告單為主，對帳時會覆蓋此列。';

-- ============================================================
-- 2) 料件 → 保養卡欄位（純函式）
-- ============================================================
-- 品名比對用：去所有空白（含全形空白）、小寫。
create or replace function sr_card_key(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(regexp_replace(coalesce(p_text, ''), '[[:space:]　]+', '', 'g'));
$$;

-- 去頭尾空白（含全形空白、換行、tab；btrim 預設只去半形空白）。與前端 String.prototype.trim 對齊。
create or replace function sr_card_trim(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(coalesce(p_text, ''), '^[[:space:]　]+|[[:space:]　]+$', '', 'g');
$$;

-- 空壓機卡：品名 → 欄位名；'skip'＝工資（不是料件）；null＝沒有明確對應（記入備註）。
create or replace function sr_card_part_column(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when k like '%工資%' then 'skip'
    when k like '%油氣分離%' then 'oil_separator'
    when k like '%機油濾%' or k like '%油濾%' then 'oil_filter'
    when k like '%空氣濾%' or k like '%空濾%' then 'air_filter'
    when k like '%變頻%' then 'inverter'
    when k like '%過濾%' or k like '%濾蕊%' or k like '%濾芯%' then 'filter_system'
    when k like '%專用油%' or k like '%潤滑油%' or k like '%機油%' or k like '%螺旋油%' then 'oil'
    else null
  end
  from (select sr_card_key(p_name) as k) s;
$$;

-- 一格的值：p_parts 為 [{name, qty}, …]（依報告單料件順序）。一個 → 數量；多個 → 「品名×數量」以「、」串接。
create or replace function sr_card_cell(p_parts jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then null
    when jsonb_array_length(p_parts) = 1 then p_parts -> 0 ->> 'qty'
    else (
      select string_agg((e ->> 'name') || '×' || (e ->> 'qty'), '、' order by i)
        from jsonb_array_elements(p_parts) with ordinality as t(e, i)
    )
  end;
$$;

-- ============================================================
-- 3) 對帳（不檢查權限；只給受信任身分與 sr_sync_card_record 呼叫）
--    回傳：'synced'（已寫入／更新）、'deleted'（已移除同步列）、'skipped'（不需動作）、'missing'（查無報告單）
-- ============================================================
-- 舊版（單參數）簽章：開發過程中的草稿版本，若存在先移除，避免與新簽章並存成多載。
drop function if exists sr_sync_card_record(uuid);
drop function if exists sr_card_sync_apply(uuid);

create or replace function sr_card_sync_apply(p_report_id uuid, p_allow_insert boolean default true)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r          sr_reports%rowtype;
  v_card     text;
  v_name     text;
  v_qty      text;
  v_col      text;
  v_col_id   uuid;
  v_cols     jsonb := '{}'::jsonb;   -- 空壓機卡：欄位名 → [{name, qty}]
  v_values   jsonb := '{}'::jsonb;   -- 過濾卡：欄 id → [{name, qty}]
  v_other    jsonb := '[]'::jsonb;   -- 沒有對應欄位的料件
  v_hours    text;
  v_type     text;
  v_note     text;
  v_vals_out jsonb;
begin
  select * into r from sr_reports where id = p_report_id;
  if not found then
    return 'missing';
  end if;

  if r.status = 'voided' or (r.status = 'completed' and r.machine_id is null) then
    delete from mx_records where source_service_report_id = r.id;
    return case when found then 'deleted' else 'skipped' end;
  end if;
  if r.status <> 'completed' then
    -- 草稿／已列印（含重新開啟）：保留上次同步的列，再結案時更新同一列。
    return 'skipped';
  end if;

  -- 只更新模式（已結案再編輯）：沒有同步列就不新增（決策 7）。
  if not coalesce(p_allow_insert, true)
     and not exists (select 1 from mx_records where source_service_report_id = r.id) then
    return 'skipped';
  end if;

  select card_type into v_card from mx_machines where id = r.machine_id;
  if not found then
    -- 機台已不存在（FK 尚未 set null 的極短窗口）：沒有可寫的卡。
    return 'skipped';
  end if;

  -- 料件分欄（依報告單列順序；只看數量非空白、品名非空白的列）
  for v_name, v_qty in
    select sr_card_trim(e ->> 'name'), sr_card_trim(e ->> 'qty')
      from jsonb_array_elements(
             case when jsonb_typeof(r.parts) = 'array' then r.parts else '[]'::jsonb end
           ) with ordinality as t(e, i)
     where jsonb_typeof(e) = 'object'
     order by i
  loop
    continue when v_qty = '' or v_name = '';
    v_col := sr_card_part_column(v_name);
    continue when v_col = 'skip';

    if v_card = 'filter' then
      select c.id into v_col_id
        from mx_machine_columns c
       where c.machine_id = r.machine_id
         and sr_card_key(c.label) = sr_card_key(v_name)
       order by c.sort_order, c.id
       limit 1;
      if found then
        v_values := jsonb_set(v_values, array[v_col_id::text],
          coalesce(v_values -> v_col_id::text, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object('name', v_name, 'qty', v_qty)));
      else
        v_other := v_other || jsonb_build_array(jsonb_build_object('name', v_name, 'qty', v_qty));
      end if;
    elsif v_col is not null then
      v_cols := jsonb_set(v_cols, array[v_col],
        coalesce(v_cols -> v_col, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('name', v_name, 'qty', v_qty)));
    else
      v_other := v_other || jsonb_build_array(jsonb_build_object('name', v_name, 'qty', v_qty));
    end if;
  end loop;

  v_hours := nullif(sr_card_trim(
    case when v_card = 'filter'
         then r.results #>> '{dryer,total_hours}'
         else r.results #>> '{compressor,run_hours}' end), '');

  v_type := case
    when 'periodic' = any (r.service_items) then 'maintenance'
    when 'repair'   = any (r.service_items) then 'repair'
    when 'new_trial' = any (r.service_items) or 'routine' = any (r.service_items) then 'inspection'
    else null
  end;

  v_note := nullif(concat_ws(E'\n',
    nullif(sr_card_trim(r.summary), ''),
    case when jsonb_array_length(v_other) > 0 then
      '其他料件：' || (
        select string_agg((e ->> 'name') || '×' || (e ->> 'qty'), '、' order by i)
          from jsonb_array_elements(v_other) with ordinality as t(e, i))
    end,
    '維護報告單 ' || r.report_no
  ), '');

  if v_card = 'filter' then
    select coalesce(jsonb_object_agg(key, sr_card_cell(value)), '{}'::jsonb)
      into v_vals_out
      from jsonb_each(v_values);
  else
    v_vals_out := null;
  end if;

  insert into mx_records as m (
    machine_id, service_date, hours,
    oil, oil_filter, air_filter, oil_separator, inverter, filter_system,
    technician, note, "values", service_type, source, source_service_report_id
  ) values (
    r.machine_id, r.report_date, v_hours,
    sr_card_cell(v_cols -> 'oil'), sr_card_cell(v_cols -> 'oil_filter'),
    sr_card_cell(v_cols -> 'air_filter'), sr_card_cell(v_cols -> 'oil_separator'),
    sr_card_cell(v_cols -> 'inverter'), sr_card_cell(v_cols -> 'filter_system'),
    nullif(sr_card_trim(r.technician), ''), v_note, v_vals_out, v_type, 'manual', r.id
  )
  on conflict (source_service_report_id) do update set
    machine_id    = excluded.machine_id,
    service_date  = excluded.service_date,
    hours         = excluded.hours,
    oil           = excluded.oil,
    oil_filter    = excluded.oil_filter,
    air_filter    = excluded.air_filter,
    oil_separator = excluded.oil_separator,
    inverter      = excluded.inverter,
    filter_system = excluded.filter_system,
    technician    = excluded.technician,
    note          = excluded.note,
    "values"      = excluded."values",
    service_type  = excluded.service_type;

  return 'synced';
end;
$$;

-- ============================================================
-- 4) 對外 RPC：檢查 service_report 模組後對帳
-- ============================================================
create or replace function sr_sync_card_record(p_report_id uuid, p_allow_insert boolean default true)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not has_module('service_report') then
    raise exception using errcode = 'P0001', message = 'forbidden',
      detail = '沒有機台維護報告單模組權限';
  end if;
  return sr_card_sync_apply(p_report_id, p_allow_insert);
end;
$$;

-- ============================================================
-- 5) 觸發器：狀態改變 → 對帳；已結案且同步欄位有變 → 只更新既有同步列（與該次更新同一交易）
-- ============================================================
create or replace function sr_reports_card_sync()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- 狀態改變（結案／重新開啟／作廢）才可新增；已結案再編輯只更新既有同步列。
  v_allow_insert boolean := new.status is distinct from old.status;
begin
  if current_user::text in ('authenticated', 'anon') then
    perform sr_sync_card_record(new.id, v_allow_insert);
  else
    perform sr_card_sync_apply(new.id, v_allow_insert);
  end if;
  return null;
end;
$$;

drop trigger if exists sr_reports_card_sync on sr_reports;
create trigger sr_reports_card_sync
  after update on sr_reports
  for each row
  when (
    new.status is distinct from old.status
    or (new.status = 'completed'
        and (new.machine_id, new.report_date, new.report_no, new.service_items,
             new.summary, new.results, new.parts, new.technician)
            is distinct from
            (old.machine_id, old.report_date, old.report_no, old.service_items,
             old.summary, old.results, old.parts, old.technician))
  )
  execute function sr_reports_card_sync();

-- ============================================================
-- 6) 權限
-- ============================================================
revoke execute on function sr_card_trim(text)          from public, anon, authenticated;
revoke execute on function sr_card_key(text)           from public, anon, authenticated;
revoke execute on function sr_card_part_column(text)   from public, anon, authenticated;
revoke execute on function sr_card_cell(jsonb)         from public, anon, authenticated;
revoke execute on function sr_card_sync_apply(uuid, boolean)  from public, anon, authenticated;
grant  execute on function sr_card_sync_apply(uuid, boolean)  to service_role;
revoke execute on function sr_reports_card_sync()      from public, anon, authenticated;
revoke execute on function sr_sync_card_record(uuid, boolean) from public, anon;
grant  execute on function sr_sync_card_record(uuid, boolean) to authenticated;
