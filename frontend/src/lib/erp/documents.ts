// ERP 草稿單據的共用存取 helper — SERVER ONLY。
// 供 W1 各區（銷售 / 採購 / 庫存）的 server action 使用；讀寫走登入者 session，RLS 把關。
// 異動類（save / delete）開頭檢查 erp 授權並回 { ok:false }，不 throw、不 redirect。
//
// 注意：存草稿為多次 PostgREST 呼叫（表頭 → 刪舊明細 → 新增明細 → 機號），非單一交易；
// 草稿不影響庫存與金額，中途失敗時使用者重存即可覆蓋。過帳 / 作廢才走 RPC（原子性）。
// DB 觸發器限定表頭 / 明細 / 機號只能寫入 status='draft' 的單據（否則 not_draft），且 doc_no、status、
// posted_*、voided_*、明細 unit_cost 只能由 RPC 寫入——此處只寫草稿欄位，勿加入上述欄位。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { calcDocumentTotals, calcLineAmount } from "./calc";
import { ERP_ERROR_MESSAGES, erpErrorMessage } from "./errors";
import { ensureErp } from "./guard";
import { validateDraftDocument } from "./validate";
import type {
  DocStatus,
  DocType,
  DraftDocument,
  ErpDocumentListRow,
  ErpDocumentWithLines,
  ErpResult,
} from "./types";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

/** 列表每頁筆數（spec §6）。 */
export const DOCUMENT_PAGE_SIZE = 50;

function cleanText(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

interface PartySnapshot {
  party_name: string | null;
  party_tax_id: string | null;
  party_contact: string | null;
  party_phone: string | null;
  party_address: string | null;
  /** 客戶預設業務（僅客戶單據）。 */
  sales_rep: string | null;
}

/** 依客戶 / 廠商帶入表頭快照（列印用，之後主檔改動不影響舊單）。 */
async function loadPartySnapshot(
  supabase: Supabase,
  input: DraftDocument,
): Promise<ErpResult<PartySnapshot | null>> {
  if (input.customer_id) {
    const { data, error } = await supabase
      .from("mx_customers")
      .select(
        "name, tax_id, invoice_title, contact_person, phone, address, delivery_address, sales_rep",
      )
      .eq("id", input.customer_id)
      .maybeSingle();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data) return { ok: false, error: "找不到所選客戶。" };
    const c = data as Record<string, string | null>;
    return {
      ok: true,
      data: {
        party_name: c.invoice_title || c.name,
        party_tax_id: c.tax_id,
        party_contact: c.contact_person,
        party_phone: c.phone,
        party_address: c.delivery_address || c.address,
        sales_rep: c.sales_rep,
      },
    };
  }
  if (input.vendor_id) {
    const { data, error } = await supabase
      .from("erp_vendors")
      .select("name, tax_id, contact_person, phone, address")
      .eq("id", input.vendor_id)
      .maybeSingle();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data) return { ok: false, error: "找不到所選廠商。" };
    const v = data as Record<string, string | null>;
    return {
      ok: true,
      data: {
        party_name: v.name,
        party_tax_id: v.tax_id,
        party_contact: v.contact_person,
        party_phone: v.phone,
        party_address: v.address,
        sales_rep: null,
      },
    };
  }
  return { ok: true, data: null };
}

/**
 * 新增或更新草稿（spec §5 草稿階段）：
 * 1. 權限 + 輸入驗證；
 * 2. 帶入客戶 / 廠商快照、以 calc.ts 重算表頭合計與各行 amount；
 * 3. 有 id → 只更新 status='draft' 的單（否則 not_draft）；無 id → 新增；
 * 4. 整批重建明細（刪舊行，line_serials 隨 cascade 刪除）與既有機號關聯。
 * 回傳單據 id。
 */
export async function saveDraftDocument(
  input: DraftDocument,
): Promise<ErpResult<{ id: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;

  const invalid = validateDraftDocument(input);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await getServerSupabase();

  const snap = await loadPartySnapshot(supabase, input);
  if (!snap.ok) return snap;

  const totals = calcDocumentTotals({
    lines: input.lines,
    taxType: input.tax_type,
    taxRate: input.tax_rate,
    currency: input.currency,
    exchangeRate: input.exchange_rate,
  });

  const isCustomerDoc = ["Q", "S", "SR"].includes(input.doc_type);
  const isVendorDoc = ["P", "I", "PR"].includes(input.doc_type);
  const header = {
    doc_type: input.doc_type,
    doc_date: input.doc_date,
    customer_id: isCustomerDoc ? input.customer_id || null : null,
    vendor_id: isVendorDoc ? input.vendor_id || null : null,
    warehouse_id: input.warehouse_id || null,
    to_warehouse_id:
      input.doc_type === "T" ? input.to_warehouse_id || null : null,
    source_doc_id: input.source_doc_id || null,
    party_name: snap.data?.party_name ?? null,
    party_tax_id: snap.data?.party_tax_id ?? null,
    party_contact: snap.data?.party_contact ?? null,
    party_phone: snap.data?.party_phone ?? null,
    party_address: snap.data?.party_address ?? null,
    sales_rep: cleanText(input.sales_rep) ?? snap.data?.sales_rep ?? null,
    tax_type: input.tax_type,
    tax_rate: input.tax_rate,
    currency: input.currency.trim().toUpperCase(),
    exchange_rate: input.exchange_rate,
    amount_untaxed: totals.amount_untaxed,
    tax_amount: totals.tax_amount,
    total_amount: totals.total_amount,
    total_twd: totals.total_twd,
    invoice_no: cleanText(input.invoice_no),
    expected_date: input.expected_date || null,
    note: cleanText(input.note),
  };

  let docId: string;
  if (input.id) {
    const { data, error } = await supabase
      .from("erp_documents")
      .update(header)
      .eq("id", input.id)
      .eq("status", "draft")
      .select("id");
    if (error) return { ok: false, error: erpErrorMessage(error) };
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false, error: ERP_ERROR_MESSAGES.not_draft };
    }
    docId = input.id;
    const { error: delErr } = await supabase
      .from("erp_document_lines")
      .delete()
      .eq("document_id", docId);
    if (delErr) return { ok: false, error: erpErrorMessage(delErr) };
  } else {
    const { data, error } = await supabase
      .from("erp_documents")
      .insert({ ...header, status: "draft" })
      .select("id")
      .single();
    if (error) return { ok: false, error: erpErrorMessage(error) };
    docId = (data as { id: string }).id;
  }

  if (input.lines.length === 0) return { ok: true, data: { id: docId } };

  const lineRows = input.lines.map((l, i) => {
    const isItem = l.line_type === "item";
    const serialNos = isItem
      ? (l.serial_nos ?? []).map((s) => s.trim()).filter(Boolean)
      : [];
    return {
      document_id: docId,
      line_no: i + 1,
      line_type: l.line_type,
      item_id: isItem ? l.item_id : null,
      description: cleanText(l.description),
      qty: isItem ? l.qty : 0,
      unit_price: isItem ? l.unit_price : 0,
      amount: calcLineAmount(l),
      source_line_id: l.source_line_id || null,
      serial_nos: serialNos.length ? serialNos : null,
    };
  });
  const { data: inserted, error: lineErr } = await supabase
    .from("erp_document_lines")
    .insert(lineRows)
    .select("id, line_no");
  if (lineErr) {
    return {
      ok: false,
      error: `草稿表頭已儲存，但明細儲存失敗：${erpErrorMessage(lineErr)}`,
    };
  }

  // 以 line_no 對回輸入行，寫入既有機號關聯。
  const idByLineNo = new Map(
    ((inserted ?? []) as { id: string; line_no: number }[]).map((r) => [
      r.line_no,
      r.id,
    ]),
  );
  const serialRows = input.lines.flatMap((l, i) => {
    const lineId = idByLineNo.get(i + 1);
    if (!lineId || l.line_type !== "item") return [];
    return (l.serial_ids ?? []).map((serialId) => ({
      line_id: lineId,
      serial_id: serialId,
    }));
  });
  if (serialRows.length > 0) {
    const { error: serialErr } = await supabase
      .from("erp_document_line_serials")
      .insert(serialRows);
    if (serialErr) {
      return {
        ok: false,
        error: `草稿已儲存，但機號儲存失敗：${erpErrorMessage(serialErr)}`,
      };
    }
  }

  return { ok: true, data: { id: docId } };
}

/** 刪除草稿（只能刪 status='draft'；已過帳請作廢）。 */
export async function deleteDraftDocument(
  id: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: ERP_ERROR_MESSAGES.not_draft };
  }
  return { ok: true, data: null };
}

type LineRowWithSerials = Omit<
  ErpDocumentWithLines["lines"][number],
  "serials"
> & {
  serials:
    | {
        serial: ErpDocumentWithLines["lines"][number]["serials"][number] | null;
      }[]
    | null;
};

/** 讀單據 + 明細（依 line_no 排序）+ 各行已選機號。找不到回 { ok:false }。 */
export async function getDocumentWithLines(
  id: string,
): Promise<ErpResult<ErpDocumentWithLines>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select(
      "*, lines:erp_document_lines(*, serials:erp_document_line_serials(serial:erp_serials(id, serial_no, status)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data) return { ok: false, error: "找不到此單據。" };

  const raw = data as Omit<ErpDocumentWithLines, "lines"> & {
    lines: LineRowWithSerials[] | null;
  };
  const lines = (raw.lines ?? [])
    .map((l) => ({
      ...l,
      serials: (l.serials ?? [])
        .map((s) => s.serial)
        .filter((s): s is NonNullable<typeof s> => s !== null),
    }))
    .sort((a, b) => a.line_no - b.line_no);
  return { ok: true, data: { ...raw, lines } };
}

export interface ListDocumentsParams {
  docType: DocType;
  status?: DocStatus | null;
  /** 搜尋單號 / 客戶廠商名稱（表頭快照）。 */
  q?: string | null;
  /** 單據日期起訖（西元 YYYY-MM-DD，含端點）。 */
  from?: string | null;
  to?: string | null;
  /** 1 起算。 */
  page?: number;
}

/** PostgREST or-filter 的值不可含結構字元；移除以避免注入 / 語法錯誤。 */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()"\\%*]/g, " ").trim();
}

/** 單據列表（依單別，可篩狀態 / 關鍵字 / 日期區間，每頁 50 筆，新→舊）。 */
export async function listDocuments(params: ListDocumentsParams): Promise<
  ErpResult<{
    rows: ErpDocumentListRow[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_documents")
    .select(
      "id, doc_type, doc_no, doc_date, status, customer_id, vendor_id, party_name, currency, total_amount, total_twd, created_at",
      { count: "exact" },
    )
    .eq("doc_type", params.docType);
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("doc_date", params.from);
  if (params.to) query = query.lte("doc_date", params.to);
  const q = sanitizeSearch(params.q ?? "");
  if (q) query = query.or(`doc_no.ilike.%${q}%,party_name.ilike.%${q}%`);

  const start = (page - 1) * DOCUMENT_PAGE_SIZE;
  const { data, error, count } = await query
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, start + DOCUMENT_PAGE_SIZE - 1);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: {
      rows: (data ?? []) as ErpDocumentListRow[],
      total: count ?? 0,
      page,
      pageSize: DOCUMENT_PAGE_SIZE,
    },
  };
}
