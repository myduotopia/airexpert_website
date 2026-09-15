"use server";

// 銷售區段（報價單 Q / 銷貨單 S / 銷退單 SR）server actions。
// - 每個 action 開頭 ensureErp（layout 不保護 action）；失敗一律回 { ok:false, error }，不 throw。
// - 草稿存取走 lib/erp/documents；過帳 / 作廢走 lib/erp/rpc（單一交易）。
// - 只允許操作 Q / S / SR 單據（避免經由此處過帳 / 作廢其他區段的單據）。
// - 銷貨單過帳 / 作廢會建立 / 刪除保養卡機台，一併 revalidate /admin/maintenance。
import { revalidatePath } from "next/cache";
import {
  deleteDraftDocument,
  getDocumentWithLines,
  saveDraftDocument,
} from "@/lib/erp/documents";
import { ensureErp } from "@/lib/erp/guard";
import { postDocument, voidDocument } from "@/lib/erp/rpc";
import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "@/lib/erp/errors";
import {
  getDocumentType,
  getReturnedQtyBySourceLine,
  isSalesDocType,
  listMachinesByIds,
  quoteToSaleDraft,
  returnableLines,
  saleToReturnDraft,
  todayTaipei,
  validateReturnQty,
  type SalesDocType,
} from "@/lib/erp/queries/sales";
import type { DraftDocument, ErpResult } from "@/lib/erp/types";

const SALES_PATHS = [
  "/admin/erp/quotes",
  "/admin/erp/sales",
  "/admin/erp/sales-returns",
];

function revalidateSales(opts: { maintenance?: boolean } = {}) {
  for (const p of SALES_PATHS) revalidatePath(p, "layout");
  if (opts.maintenance) revalidatePath("/admin/maintenance", "layout");
}

const WRONG_TYPE = "此單據不屬於銷售單據。";

/** 確認單據存在且為 Q / S / SR；回傳單別。 */
async function requireSalesDoc(id: string): Promise<ErpResult<SalesDocType>> {
  if (!id) return { ok: false, error: "找不到此單據。" };
  const res = await getDocumentType(id);
  if (!res.ok) return res;
  if (!res.data) return { ok: false, error: "找不到此單據。" };
  if (!isSalesDocType(res.data)) return { ok: false, error: WRONG_TYPE };
  return { ok: true, data: res.data };
}

async function defaultWarehouseId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("erp_warehouses")
    .select("id")
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** 新增 / 更新銷售草稿。銷退單會檢查可退數量並鎖定來源銷貨單的客戶。 */
export async function saveSalesDraftAction(
  input: DraftDocument,
): Promise<ErpResult<{ id: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!input || !isSalesDocType(input.doc_type)) {
    return { ok: false, error: "單別不正確。" };
  }

  if (input.id) {
    const existing = await requireSalesDoc(input.id);
    if (!existing.ok) return existing;
    if (existing.data !== input.doc_type) {
      return { ok: false, error: "單別與既有草稿不符。" };
    }
  }

  let draft: DraftDocument = { ...input };
  if (draft.doc_type === "SR") {
    if (!draft.source_doc_id) {
      return { ok: false, error: "銷退單需從已過帳的銷貨單建立。" };
    }
    const sale = await getDocumentWithLines(draft.source_doc_id);
    if (!sale.ok) return sale;
    if (sale.data.doc_type !== "S" || sale.data.status !== "posted") {
      return { ok: false, error: "來源銷貨單不存在、尚未過帳或已作廢。" };
    }
    const returned = await getReturnedQtyBySourceLine(
      sale.data.lines.map((l) => l.id),
      draft.id,
    );
    if (!returned.ok) return returned;
    const bad = validateReturnQty(
      draft.lines,
      returnableLines(sale.data, returned.data),
    );
    if (bad) return { ok: false, error: bad };
    draft = { ...draft, customer_id: sale.data.customer_id };
  } else if (draft.doc_type === "Q") {
    // 報價單不動庫存：不存倉庫、發票號碼。
    draft = { ...draft, warehouse_id: null, invoice_no: null };
  }

  const res = await saveDraftDocument(draft);
  if (res.ok) revalidateSales();
  return res;
}

/** 刪除銷售草稿（已過帳請作廢）。 */
export async function deleteSalesDraftAction(
  id: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const doc = await requireSalesDoc(id);
  if (!doc.ok) return doc;
  const res = await deleteDraftDocument(id);
  if (res.ok) revalidateSales();
  return res;
}

export interface SalesPostResult {
  doc_no: string;
  warnings: string[];
  /** 銷貨單過帳建立 / 連結的保養卡機台。 */
  machines: { id: string; serial_no: string | null; model: string | null }[];
}

/** 過帳（報價單 = 確認取號）。銷貨單回傳建立 / 連結的保養卡機台與警告。 */
export async function postSalesDocumentAction(
  id: string,
): Promise<ErpResult<SalesPostResult>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const doc = await requireSalesDoc(id);
  if (!doc.ok) return doc;

  const res = await postDocument(id);
  if (!res.ok) return res;
  const ids = res.data.mx_machine_ids;
  const found = await listMachinesByIds(ids);
  const byId = new Map(found.map((m) => [m.id, m]));
  const machines = ids.map(
    (mid) => byId.get(mid) ?? { id: mid, serial_no: null, model: null },
  );
  revalidateSales({ maintenance: doc.data === "S" });
  return {
    ok: true,
    data: { doc_no: res.data.doc_no, warnings: res.data.warnings, machines },
  };
}

/** 作廢已過帳單據（原因必填）；回傳 RPC 警告（例：保養卡機台已有紀錄而保留）。 */
export async function voidSalesDocumentAction(
  id: string,
  reason: string,
): Promise<ErpResult<{ warnings: string[] }>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!reason?.trim()) return { ok: false, error: "請填寫作廢原因。" };
  const doc = await requireSalesDoc(id);
  if (!doc.ok) return doc;
  const res = await voidDocument(id, reason);
  if (!res.ok) return res;
  revalidateSales({ maintenance: doc.data === "S" });
  return { ok: true, data: { warnings: res.data.warnings } };
}

/** 報價單「轉銷貨單」：複製表頭與明細為銷貨草稿（source_doc_id），回傳新草稿 id。 */
export async function convertQuoteToSaleAction(
  quoteId: string,
): Promise<ErpResult<{ id: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const quote = await getDocumentWithLines(quoteId);
  if (!quote.ok) return quote;
  if (quote.data.doc_type !== "Q") return { ok: false, error: WRONG_TYPE };
  if (quote.data.status !== "posted") {
    return { ok: false, error: "報價單需先確認（且未作廢）才能轉銷貨單。" };
  }
  let warehouseId: string | null = null;
  try {
    warehouseId = await defaultWarehouseId();
  } catch (e) {
    return { ok: false, error: erpErrorMessage(e as { message?: string }) };
  }
  const draft = quoteToSaleDraft(quote.data, {
    docDate: todayTaipei(),
    warehouseId,
  });
  const res = await saveDraftDocument(draft);
  if (res.ok) revalidateSales();
  return res;
}

/** 銷貨單「建立銷退單」：帶入尚可退的品項行為銷退草稿，回傳新草稿 id。 */
export async function createSalesReturnAction(
  saleId: string,
): Promise<ErpResult<{ id: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const sale = await getDocumentWithLines(saleId);
  if (!sale.ok) return sale;
  if (sale.data.doc_type !== "S") return { ok: false, error: WRONG_TYPE };
  if (sale.data.status !== "posted") {
    return { ok: false, error: "只能從已過帳的銷貨單建立銷退單。" };
  }
  const returned = await getReturnedQtyBySourceLine(
    sale.data.lines.map((l) => l.id),
  );
  if (!returned.ok) return returned;
  const draft = saleToReturnDraft(sale.data, {
    docDate: todayTaipei(),
    returnedQtyByLine: returned.data,
  });
  if (draft.lines.length === 0) {
    return { ok: false, error: "此銷貨單已無可退貨的品項數量。" };
  }
  const res = await saveDraftDocument(draft);
  if (res.ok) revalidateSales();
  return res;
}
