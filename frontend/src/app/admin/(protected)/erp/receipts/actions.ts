"use server";

// 進貨單（I）server actions。過帳 → 庫存 +、移動平均成本、建立機號；超收由 RPC 擋（over_receipt）。
import { revalidatePath } from "next/cache";
import { saveDraftDocument } from "@/lib/erp/documents";
import { newDraftDocument } from "@/lib/erp/draft";
import { ensureErp } from "@/lib/erp/guard";
import {
  buildLinesFromSource,
  getReceiptReturnableQty,
  todayIso,
} from "@/lib/erp/queries/purchasing";
import type { DraftDocument } from "@/lib/erp/types";
import {
  deleteDraftFor,
  loadPostedSource,
  postFor,
  saveDraftFor,
  voidFor,
  type DocActionResult,
  type SaveResult,
} from "../purchases/_lib/doc-actions";

export async function saveReceiptDraftAction(
  input: DraftDocument,
): Promise<SaveResult> {
  return saveDraftFor("I", input);
}

export async function postReceiptAction(id: string): Promise<DocActionResult> {
  return postFor("I", id);
}

export async function voidReceiptAction(
  id: string,
  reason: string,
): Promise<DocActionResult> {
  return voidFor("I", id, reason);
}

export async function deleteReceiptDraftAction(
  id: string,
): Promise<DocActionResult> {
  return deleteDraftFor("I", id);
}

/**
 * 「轉進退單」：以已過帳進貨單各行的可退量建立進退單草稿
 * （出庫倉 = 原入庫倉、source_doc_id / source_line_id 指回進貨單）。機號於進退單上勾選。
 */
export async function convertReceiptToReturnAction(
  receiptId: string,
): Promise<SaveResult> {
  const denied = await ensureErp();
  if (denied) return denied;

  const src = await loadPostedSource(receiptId, "I");
  if (!src.ok) return src;
  const receipt = src.data;

  const returnable = await getReceiptReturnableQty(receipt);
  if (!returnable.ok) return returnable;

  const lines = buildLinesFromSource(receipt.lines, returnable.data);
  if (lines.length === 0) {
    return { ok: false, error: "此進貨單已全數退回，無可退數量。" };
  }

  const draft = newDraftDocument("PR", todayIso(), {
    vendor_id: receipt.vendor_id,
    warehouse_id: receipt.warehouse_id,
    source_doc_id: receipt.id,
    tax_type: receipt.tax_type,
    tax_rate: Number(receipt.tax_rate),
    currency: receipt.currency,
    exchange_rate: Number(receipt.exchange_rate),
    lines,
  });
  const res = await saveDraftDocument(draft);
  if (!res.ok) return res;
  revalidatePath("/admin/erp/purchase-returns");
  return { ok: true, id: res.data.id };
}
