"use server";

// 盤點調整單 A 的 server actions。流程在 inventory/_lib/stock-doc-actions.ts（開頭 ensureErp、回 { ok, error }）。
import { revalidatePath } from "next/cache";
import type { DraftDocument } from "@/lib/erp/types";
import {
  deleteStockDraft,
  postStockDoc,
  saveStockDoc,
  voidStockDoc,
} from "../inventory/_lib/stock-doc-actions";

function revalidateDocs() {
  revalidatePath("/admin/erp/adjustments", "layout");
}

function revalidateStock() {
  revalidateDocs();
  revalidatePath("/admin/erp/inventory", "layout");
  revalidatePath("/admin/erp");
}

export async function saveAdjustmentAction(input: DraftDocument) {
  const res = await saveStockDoc("A", input);
  if (res.ok) revalidateDocs();
  return res;
}

export async function postAdjustmentAction(id: string) {
  const res = await postStockDoc("A", id);
  if (res.ok) revalidateStock();
  return res;
}

export async function voidAdjustmentAction(id: string, reason: string) {
  const res = await voidStockDoc("A", id, reason);
  if (res.ok) revalidateStock();
  return res;
}

export async function deleteAdjustmentDraftAction(id: string) {
  const res = await deleteStockDraft("A", id);
  if (res.ok) revalidateDocs();
  return res;
}
