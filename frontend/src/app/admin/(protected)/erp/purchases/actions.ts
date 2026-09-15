"use server";

// 採購單（P）server actions。過帳 / 作廢走 lib/erp/rpc（RPC 單一交易）。
import { saveDraftDocument } from "@/lib/erp/documents";
import { ensureErp } from "@/lib/erp/guard";
import {
  buildLinesFromSource,
  getDefaultWarehouseId,
  getPurchaseLineProgress,
  todayIso,
} from "@/lib/erp/queries/purchasing";
import { newDraftDocument } from "@/lib/erp/draft";
import type { DraftDocument } from "@/lib/erp/types";
import {
  deleteDraftFor,
  loadPostedSource,
  postFor,
  saveDraftFor,
  voidFor,
  type DocActionResult,
  type SaveResult,
} from "./_lib/doc-actions";
import { revalidatePath } from "next/cache";

export async function savePurchaseDraftAction(
  input: DraftDocument,
): Promise<SaveResult> {
  return saveDraftFor("P", input);
}

export async function postPurchaseAction(id: string): Promise<DocActionResult> {
  return postFor("P", id);
}

export async function voidPurchaseAction(
  id: string,
  reason: string,
): Promise<DocActionResult> {
  return voidFor("P", id, reason);
}

export async function deletePurchaseDraftAction(
  id: string,
): Promise<DocActionResult> {
  return deleteDraftFor("P", id);
}

/**
 * 「轉進貨單」：以已過帳採購單各行的未到貨量建立進貨單草稿
 * （source_doc_id = 採購單、各行 source_line_id = 採購行），回傳新草稿 id。
 */
export async function convertPurchaseToReceiptAction(
  purchaseId: string,
): Promise<SaveResult> {
  const denied = await ensureErp();
  if (denied) return denied;

  const src = await loadPostedSource(purchaseId, "P");
  if (!src.ok) return src;
  const purchase = src.data;

  const progress = await getPurchaseLineProgress(purchaseId);
  if (!progress.ok) return progress;
  const remaining = new Map(
    [...progress.data.values()].map((p) => [p.line_id, p.remaining_qty]),
  );

  const lines = buildLinesFromSource(purchase.lines, remaining);
  if (lines.length === 0) {
    return { ok: false, error: "此採購單已全數到貨，無可轉進貨的數量。" };
  }

  const draft = newDraftDocument("I", todayIso(), {
    vendor_id: purchase.vendor_id,
    warehouse_id: await getDefaultWarehouseId(),
    source_doc_id: purchase.id,
    tax_type: purchase.tax_type,
    tax_rate: Number(purchase.tax_rate),
    currency: purchase.currency,
    exchange_rate: Number(purchase.exchange_rate),
    note: purchase.note,
    lines,
  });
  const res = await saveDraftDocument(draft);
  if (!res.ok) return res;
  revalidatePath("/admin/erp/receipts");
  return { ok: true, id: res.data.id };
}
