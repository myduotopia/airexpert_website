// 採購區（採購單 P → 進貨單 I → 進退單 PR）的查詢與轉單純函式 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；查詢失敗回 { ok:false }（不 throw）。
// 轉單邏輯（buildLinesFromSource）為純函式，另有單元測試。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { roundHalfAwayFromZero } from "../calc";
import { newDraftLine } from "../draft";
import { erpErrorMessage } from "../errors";
import type {
  DraftLine,
  ErpDocumentWithLines,
  ErpPurchaseLineProgress,
  ErpPurchaseProgress,
  ErpResult,
} from "../types";

export type PurchaseProgressStatus = ErpPurchaseProgress["status"];

export const PURCHASE_PROGRESS_LABEL: Record<PurchaseProgressStatus, string> = {
  open: "未到貨",
  partial: "部分到貨",
  closed: "已結案",
};

/** 台北時區今天（西元 YYYY-MM-DD），新單據預設日期。 */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type SourceLine = Pick<
  ErpDocumentWithLines["lines"][number],
  | "id"
  | "line_type"
  | "item_id"
  | "description"
  | "qty"
  | "unit_price"
  | "amount"
>;

/**
 * 由來源單據的明細建出下游草稿明細（P→I 帶未到貨量、I→PR 帶可退量）：
 * - item 行：remaining（依來源行 id）> 0 才帶入，qty = remaining，保留單價、品名，source_line_id = 來源行；
 * - discount 行：依「帶入品項金額 / 來源品項金額」比例分攤（全數帶入時比例 1 → 原折扣）；
 *   比例為 0（無可帶入品項）時不帶；
 * - note 行：原樣帶入。
 * remaining 未列出的 item 行視為 0（例如採購單已過帳但 view 查無）。
 * 若沒有任何可帶入的 item 行回傳空陣列（呼叫端顯示「已全數到貨 / 已全數退回」）。
 */
export function buildLinesFromSource(
  lines: SourceLine[],
  remainingByLineId: ReadonlyMap<string, number>,
): DraftLine[] {
  const itemLines = lines.filter((l) => l.line_type === "item");
  const sourceItemAmount = itemLines.reduce(
    (s, l) => s + Number(l.qty) * Number(l.unit_price),
    0,
  );
  let carriedItemAmount = 0;
  const out: DraftLine[] = [];
  const discounts: { index: number; amount: number }[] = [];

  for (const l of lines) {
    if (l.line_type === "item") {
      const remaining = Math.max(0, Number(remainingByLineId.get(l.id) ?? 0));
      if (remaining <= 0) continue;
      const unitPrice = Number(l.unit_price);
      carriedItemAmount += remaining * unitPrice;
      out.push(
        newDraftLine("item", {
          item_id: l.item_id,
          description: l.description ?? "",
          qty: remaining,
          unit_price: unitPrice,
          source_line_id: l.id,
        }),
      );
    } else if (l.line_type === "discount") {
      discounts.push({ index: out.length, amount: Number(l.amount) });
      out.push(newDraftLine("discount", { description: l.description ?? "" }));
    } else {
      out.push(newDraftLine("note", { description: l.description ?? "" }));
    }
  }

  if (!out.some((l) => l.line_type === "item")) return [];

  const ratio =
    sourceItemAmount === 0
      ? 1
      : Math.min(1, carriedItemAmount / sourceItemAmount);
  for (const d of discounts) {
    const amount = roundHalfAwayFromZero(-Math.abs(d.amount) * ratio, 2);
    out[d.index] = { ...out[d.index], amount };
  }
  return out.filter((l) => l.line_type !== "discount" || l.amount !== 0);
}

/** 多張採購單的到貨狀態（erp_purchase_progress；草稿 / 作廢單不在 view 中）。 */
export async function getPurchaseProgressMap(
  docIds: string[],
): Promise<ErpResult<Map<string, PurchaseProgressStatus>>> {
  if (docIds.length === 0) return { ok: true, data: new Map() };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_purchase_progress")
    .select("document_id, status")
    .in("document_id", docIds);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: new Map(
      ((data ?? []) as ErpPurchaseProgress[]).map((r) => [
        r.document_id,
        r.status,
      ]),
    ),
  };
}

/** 單張已過帳採購單各行的已到貨 / 未到貨量（依 line_id）。 */
export async function getPurchaseLineProgress(
  docId: string,
): Promise<ErpResult<Map<string, ErpPurchaseLineProgress>>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_purchase_line_progress")
    .select("line_id, document_id, item_id, qty, received_qty, remaining_qty")
    .eq("document_id", docId);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: new Map(
      ((data ?? []) as ErpPurchaseLineProgress[]).map((r) => [
        r.line_id,
        {
          ...r,
          qty: Number(r.qty),
          received_qty: Number(r.received_qty),
          remaining_qty: Number(r.remaining_qty),
        },
      ]),
    ),
  };
}

/**
 * 進貨單各行的可退量 = 行數量 − Σ 已過帳進退單（source_line_id 指向該行）數量。
 * （草稿進退單不計；過帳時 RPC 會再檢查累計退貨量。）
 */
export async function getReceiptReturnableQty(
  receipt: Pick<ErpDocumentWithLines, "lines">,
): Promise<ErpResult<Map<string, number>>> {
  const itemLines = receipt.lines.filter((l) => l.line_type === "item");
  const remaining = new Map(itemLines.map((l) => [l.id, Number(l.qty)]));
  if (itemLines.length === 0) return { ok: true, data: remaining };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_document_lines")
    .select(
      "source_line_id, qty, document:erp_documents!inner(doc_type, status)",
    )
    .in(
      "source_line_id",
      itemLines.map((l) => l.id),
    )
    .eq("line_type", "item")
    .eq("document.doc_type", "PR")
    .eq("document.status", "posted");
  if (error) return { ok: false, error: erpErrorMessage(error) };

  for (const r of (data ?? []) as {
    source_line_id: string | null;
    qty: number;
  }[]) {
    if (!r.source_line_id || !remaining.has(r.source_line_id)) continue;
    remaining.set(
      r.source_line_id,
      Math.max(0, remaining.get(r.source_line_id)! - Number(r.qty)),
    );
  }
  return { ok: true, data: remaining };
}

export interface RelatedDocument {
  id: string;
  doc_type: string;
  doc_no: string | null;
  doc_date: string;
  status: string;
}

/** 以 source_doc_id 引用本單的下游單據（採購單 → 進貨單、進貨單 → 進退單）。 */
export async function listDownstreamDocuments(
  docId: string,
): Promise<ErpResult<RelatedDocument[]>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select("id, doc_type, doc_no, doc_date, status")
    .eq("source_doc_id", docId)
    .order("doc_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return { ok: true, data: (data ?? []) as RelatedDocument[] };
}

/** 讀單一單據的單號 / 單別 / 狀態（顯示來源單據用）。 */
export async function getDocumentBrief(
  docId: string,
): Promise<ErpResult<RelatedDocument | null>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select("id, doc_type, doc_no, doc_date, status")
    .eq("id", docId)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return { ok: true, data: (data as RelatedDocument | null) ?? null };
}

/** 預設倉庫 id（無預設倉時取第一個啟用倉；皆無回 null）。 */
export async function getDefaultWarehouseId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("erp_warehouses")
    .select("id, is_default")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("code")
    .limit(1);
  const rows = (data ?? []) as { id: string }[];
  return rows[0]?.id ?? null;
}
