// 調撥單 T / 盤點調整單 A 的 server 端流程 — SERVER ONLY。
// transfers/actions.ts 與 adjustments/actions.ts（"use server"）包裝這些函式並負責 revalidatePath。
// 每個函式第一步 ensureErp（layout 不保護 server action）；驗證在呼叫 DB / RPC 之前；回 { ok, error } 不 throw。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import {
  deleteDraftDocument,
  getDocumentWithLines,
  saveDraftDocument,
} from "@/lib/erp/documents";
import { ERP_ERROR_MESSAGES, erpErrorMessage } from "@/lib/erp/errors";
import { ensureErp } from "@/lib/erp/guard";
import { postDocument, voidDocument } from "@/lib/erp/rpc";
import { getStockDocItemInfo } from "@/lib/erp/queries/inventory";
import type {
  DraftDocument,
  ErpResult,
  PostDocumentResult,
  VoidDocumentResult,
} from "@/lib/erp/types";
import {
  normalizeStockDocLines,
  validateStockDocDraft,
  validateStockDocForPost,
  type StockDocType,
} from "./inventory-logic";

const DOC_LABEL: Record<StockDocType, string> = {
  T: "調撥單",
  A: "盤點調整單",
};

/** 確認單據存在且為指定單別（避免用調撥單的 action 操作其他單據）。 */
async function checkDocType(
  docType: StockDocType,
  id: string,
): Promise<{ ok: false; error: string } | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select("id, doc_type")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data) return { ok: false, error: "找不到此單據。" };
  if ((data as { doc_type: string }).doc_type !== docType) {
    return { ok: false, error: `此單據不是${DOC_LABEL[docType]}。` };
  }
  return null;
}

/** 存草稿：T / A 不涉及金額與客戶廠商，表頭固定免稅 TWD；明細依單別整理機號。 */
export async function saveStockDoc(
  docType: StockDocType,
  input: DraftDocument,
): Promise<ErpResult<{ id: string }>> {
  const denied = await ensureErp();
  if (denied) return denied;

  const invalid = validateStockDocDraft(docType, input);
  if (invalid) return { ok: false, error: invalid };

  if (input.id) {
    const wrong = await checkDocType(docType, input.id);
    if (wrong) return wrong;
  }

  return saveDraftDocument({
    ...input,
    doc_type: docType,
    customer_id: null,
    vendor_id: null,
    to_warehouse_id: docType === "T" ? input.to_warehouse_id : null,
    source_doc_id: null,
    sales_rep: null,
    tax_type: "exempt",
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    invoice_no: null,
    expected_date: null,
    lines: normalizeStockDocLines(docType, input.lines),
  });
}

/** 過帳：先讀單據與品項設定做 validateStockDocForPost，通過才呼叫 erp_post_document。 */
export async function postStockDoc(
  docType: StockDocType,
  id: string,
): Promise<ErpResult<PostDocumentResult>> {
  const denied = await ensureErp();
  if (denied) return denied;

  const doc = await getDocumentWithLines(id);
  if (!doc.ok) return doc;

  let items;
  try {
    items = await getStockDocItemInfo([
      ...new Set(
        doc.data.lines
          .map((l) => l.item_id)
          .filter((v): v is string => Boolean(v)),
      ),
    ]);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const invalid = validateStockDocForPost(
    docType,
    {
      ...doc.data,
      lines: doc.data.lines.map((l) => ({ ...l, qty: Number(l.qty) })),
    },
    items,
  );
  if (invalid) return { ok: false, error: invalid };

  return postDocument(id);
}

/** 作廢已過帳單據（原因必填，由 voidDocument 檢查）。 */
export async function voidStockDoc(
  docType: StockDocType,
  id: string,
  reason: string,
): Promise<ErpResult<VoidDocumentResult>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!reason?.trim()) return { ok: false, error: "請填寫作廢原因。" };
  const wrong = await checkDocType(docType, id);
  if (wrong) return wrong;
  return voidDocument(id, reason);
}

/** 刪除草稿（已過帳請作廢）。 */
export async function deleteStockDraft(
  docType: StockDocType,
  id: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const wrong = await checkDocType(docType, id);
  if (wrong) return wrong;
  const res = await deleteDraftDocument(id);
  if (!res.ok && res.error === ERP_ERROR_MESSAGES.not_draft) {
    return {
      ok: false,
      error: "此單據已過帳或作廢，無法刪除（已過帳請使用作廢）。",
    };
  }
  return res;
}
