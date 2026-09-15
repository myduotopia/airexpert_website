// 採購區三種單據（P / I / PR）server action 的共用實作 — SERVER ONLY（非 "use server" 檔）。
// 各 actions.ts 以此組出對應單別的 action；每個函式開頭先 ensureErp（layout 不保護 action）。
// 錯誤一律回 { ok:false, error }（中文），不 throw 到 error boundary。
import "server-only";

import { revalidatePath } from "next/cache";
import {
  deleteDraftDocument,
  getDocumentWithLines,
  saveDraftDocument,
} from "@/lib/erp/documents";
import { ensureErp } from "@/lib/erp/guard";
import { postDocument, voidDocument } from "@/lib/erp/rpc";
import type { DraftDocument } from "@/lib/erp/types";

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };
export type DocActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** 單別 → 列表路徑。 */
export const DOC_BASE_PATH: Record<"P" | "I" | "PR", string> = {
  P: "/admin/erp/purchases",
  I: "/admin/erp/receipts",
  PR: "/admin/erp/purchase-returns",
};

export type PurchasingDocType = keyof typeof DOC_BASE_PATH;

function revalidateDoc(docType: PurchasingDocType, id?: string | null) {
  // 採購單的到貨進度會因進貨單過帳 / 作廢改變，三區列表一併更新。
  for (const base of Object.values(DOC_BASE_PATH)) revalidatePath(base);
  if (id) revalidatePath(`${DOC_BASE_PATH[docType]}/${id}`);
}

/** 存草稿：強制單別；進貨 / 進退單需選倉庫。 */
export async function saveDraftFor(
  docType: PurchasingDocType,
  input: DraftDocument,
): Promise<SaveResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!input || typeof input !== "object") {
    return { ok: false, error: "資料格式不正確。" };
  }
  if ((docType === "I" || docType === "PR") && !input.warehouse_id) {
    return {
      ok: false,
      error: docType === "I" ? "請選擇入庫倉。" : "請選擇出庫倉。",
    };
  }
  const doc: DraftDocument = {
    ...input,
    doc_type: docType,
    customer_id: null,
    to_warehouse_id: null,
    lines: (input.lines ?? []).map((l) =>
      docType === "I"
        ? { ...l, serial_ids: [] }
        : docType === "PR"
          ? { ...l, serial_nos: [] }
          : { ...l, serial_ids: [], serial_nos: [] },
    ),
  };
  const res = await saveDraftDocument(doc);
  if (!res.ok) return res;
  revalidateDoc(docType, res.data.id);
  return { ok: true, id: res.data.id };
}

/** 過帳（取號、動庫存）。 */
export async function postFor(
  docType: PurchasingDocType,
  id: string,
): Promise<DocActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const res = await postDocument(id);
  if (!res.ok) return res;
  revalidateDoc(docType, id);
  const warn = res.data.warnings.length
    ? `（${res.data.warnings.join("；")}）`
    : "";
  return { ok: true, message: `已過帳，單號 ${res.data.doc_no}${warn}` };
}

/** 作廢（原因必填）。 */
export async function voidFor(
  docType: PurchasingDocType,
  id: string,
  reason: string,
): Promise<DocActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const res = await voidDocument(id, reason);
  if (!res.ok) return res;
  revalidateDoc(docType, id);
  const warn = res.data.warnings.length
    ? `（${res.data.warnings.join("；")}）`
    : "";
  return { ok: true, message: `已作廢${warn}` };
}

/** 刪除草稿。 */
export async function deleteDraftFor(
  docType: PurchasingDocType,
  id: string,
): Promise<DocActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const res = await deleteDraftDocument(id);
  if (!res.ok) return res;
  revalidateDoc(docType, null);
  return { ok: true };
}

/** 讀已過帳的來源單並確認單別（轉單用）。 */
export async function loadPostedSource(id: string, expected: "P" | "I") {
  const res = await getDocumentWithLines(id);
  if (!res.ok) return res;
  if (res.data.doc_type !== expected) {
    return { ok: false as const, error: "來源單據類型不符。" };
  }
  if (res.data.status !== "posted") {
    return { ok: false as const, error: "只能由已過帳的單據轉單。" };
  }
  return res;
}
