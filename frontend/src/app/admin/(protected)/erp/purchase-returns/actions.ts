"use server";

// 進退單（PR）server actions。過帳 → 庫存 −、機號 returned_to_vendor。
// 建立進退單一律由進貨單帶入（receipts/actions 的 convertReceiptToReturnAction）。
import type { DraftDocument } from "@/lib/erp/types";
import {
  deleteDraftFor,
  postFor,
  saveDraftFor,
  voidFor,
  type DocActionResult,
  type SaveResult,
} from "../purchases/_lib/doc-actions";

export async function savePurchaseReturnDraftAction(
  input: DraftDocument,
): Promise<SaveResult> {
  return saveDraftFor("PR", input);
}

export async function postPurchaseReturnAction(
  id: string,
): Promise<DocActionResult> {
  return postFor("PR", id);
}

export async function voidPurchaseReturnAction(
  id: string,
  reason: string,
): Promise<DocActionResult> {
  return voidFor("PR", id, reason);
}

export async function deletePurchaseReturnDraftAction(
  id: string,
): Promise<DocActionResult> {
  return deleteDraftFor("PR", id);
}
