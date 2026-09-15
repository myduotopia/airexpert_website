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
import { erpErrorMessage } from "@/lib/erp/errors";
import { ensureErp } from "@/lib/erp/guard";
import { postDocument, voidDocument } from "@/lib/erp/rpc";
import type { DraftDocument, SerialOption } from "@/lib/erp/types";
import { getServerSupabase } from "@/lib/supabase-server";

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

type CheckedDoc = {
  id: string;
  doc_type: string;
  source_doc_id: string | null;
};

/** 確認單據存在且為本區單別（避免以某區 action 操作其他單別的單據）。 */
async function checkDocType(
  docType: PurchasingDocType,
  id: string,
): Promise<{ ok: true; doc: CheckedDoc } | { ok: false; error: string }> {
  if (!id || typeof id !== "string") {
    return { ok: false, error: "找不到單據。" };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select("id, doc_type, source_doc_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data) return { ok: false, error: "找不到單據。" };
  const doc = data as CheckedDoc;
  if (doc.doc_type !== docType) {
    return { ok: false, error: "單據類型不符。" };
  }
  return { ok: true, doc };
}

/** 進退單所選機號必須由來源進貨單入庫（erp_serials.in_doc_id = 來源進貨單）。 */
async function checkReturnSerials(
  sourceDocId: string | null,
  lines: DraftDocument["lines"],
): Promise<{ ok: false; error: string } | null> {
  const ids = [...new Set(lines.flatMap((l) => l.serial_ids ?? []))];
  if (ids.length === 0) return null;
  if (!sourceDocId) return { ok: false, error: "機號不屬於來源進貨單。" };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_serials")
    .select("id, in_doc_id")
    .in("id", ids);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  const rows = (data ?? []) as { id: string; in_doc_id: string | null }[];
  const valid = new Set(
    rows.filter((r) => r.in_doc_id === sourceDocId).map((r) => r.id),
  );
  if (ids.some((id) => !valid.has(id))) {
    return { ok: false, error: "機號不屬於來源進貨單。" };
  }
  return null;
}

/** 存草稿：強制單別；進貨 / 進退單需選倉庫；更新既有草稿需確認單別。 */
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
  let sourceDocId = input.source_doc_id ?? null;
  if (input.id) {
    const checked = await checkDocType(docType, input.id);
    if (!checked.ok) return checked;
    // 既有草稿的來源單以 DB 為準，不採用 client 傳入值。
    sourceDocId = checked.doc.source_doc_id;
  }
  if (docType === "PR") {
    const bad = await checkReturnSerials(sourceDocId, input.lines ?? []);
    if (bad) return bad;
  }
  const doc: DraftDocument = {
    ...input,
    // 單別一律為本區單別（忽略 client 傳入的 doc_type）。
    doc_type: docType,
    source_doc_id: sourceDocId,
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
  const checked = await checkDocType(docType, id);
  if (!checked.ok) return checked;
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
  if (!reason?.trim()) return { ok: false, error: "請填寫作廢原因。" };
  const checked = await checkDocType(docType, id);
  if (!checked.ok) return checked;
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
  const checked = await checkDocType(docType, id);
  if (!checked.ok) return checked;
  const res = await deleteDraftDocument(id);
  if (!res.ok) return res;
  revalidateDoc(docType, null);
  return { ok: true };
}

/** 進退單可選機號：限來源進貨單入庫（in_doc_id）且仍在庫的機號。 */
export async function listReceiptInStockSerials(
  receiptId: string | null,
  itemIds: string[],
): Promise<SerialOption[]> {
  if (!receiptId || itemIds.length === 0) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_serials")
    .select("id, item_id, serial_no, status, warehouse_id, customer_id")
    .eq("in_doc_id", receiptId)
    .in("item_id", itemIds)
    .eq("status", "in_stock")
    .order("serial_no");
  if (error) throw new Error(`讀取機號失敗：${error.message}`);
  return (data ?? []) as SerialOption[];
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
