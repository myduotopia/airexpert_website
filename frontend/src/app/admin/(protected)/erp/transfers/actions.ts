"use server";

// 調撥單 T 的 server actions。流程在 inventory/_lib/stock-doc-actions.ts（開頭 ensureErp、回 { ok, error }）。
import { revalidatePath } from "next/cache";
import type { DraftDocument } from "@/lib/erp/types";
import {
  deleteStockDraft,
  postStockDoc,
  saveStockDoc,
  voidStockDoc,
} from "../inventory/_lib/stock-doc-actions";

function revalidateDocs() {
  revalidatePath("/admin/erp/transfers", "layout");
}

function revalidateStock() {
  revalidateDocs();
  revalidatePath("/admin/erp/inventory", "layout");
  revalidatePath("/admin/erp");
}

export async function saveTransferAction(input: DraftDocument) {
  const res = await saveStockDoc("T", input);
  if (res.ok) revalidateDocs();
  return res;
}

export async function postTransferAction(id: string) {
  const res = await postStockDoc("T", id);
  if (res.ok) revalidateStock();
  return res;
}

export async function voidTransferAction(id: string, reason: string) {
  const res = await voidStockDoc("T", id, reason);
  if (res.ok) revalidateStock();
  return res;
}

export async function deleteTransferDraftAction(id: string) {
  const res = await deleteStockDraft("T", id);
  if (res.ok) revalidateDocs();
  return res;
}
