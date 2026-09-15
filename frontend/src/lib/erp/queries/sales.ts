// ERP 銷售（報價單 Q → 銷貨單 S → 銷退單 SR）— SERVER ONLY。
// 1. 純函式：報價轉銷貨草稿、銷貨轉銷退草稿、可退數量檢查、成本毛利試算（server action / page 用，並有單元測試）；
// 2. 查詢：已退數量、衍生單據、保養卡機台連結、單據摘要。讀取走登入者 session（RLS：has_module('erp')）。
// 過帳 / 作廢一律走 lib/erp/rpc.ts；草稿存取走 lib/erp/documents.ts。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { currencyDecimals, roundHalfAwayFromZero } from "../calc";
import { newDraftDocument, newDraftLine } from "../draft";
import { erpErrorMessage } from "../errors";
import type {
  DocStatus,
  DocType,
  DraftDocument,
  DraftLine,
  ErpDocumentWithLines,
  ErpResult,
  MxCardType,
} from "../types";

/** 銷售區段的單別。 */
export type SalesDocType = "Q" | "S" | "SR";
export const SALES_DOC_TYPES: readonly SalesDocType[] = ["Q", "S", "SR"];

export function isSalesDocType(t: unknown): t is SalesDocType {
  return (
    typeof t === "string" && (SALES_DOC_TYPES as readonly string[]).includes(t)
  );
}

/** 今天（台北時區）的西元 ISO 日期。 */
export function todayTaipei(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ── 純函式：單據轉換 ────────────────────────────────────────────

function sortedLines(doc: ErpDocumentWithLines) {
  return [...doc.lines].sort((a, b) => a.line_no - b.line_no);
}

/**
 * 報價單 → 銷貨單草稿（spec §6「轉銷貨單」）：
 * 複製表頭（客戶、業務、稅別稅率、幣別、備註）與全部明細；source_doc_id = 報價單，
 * item 行 source_line_id = 報價行（過帳時 RPC 驗證品項與客戶一致）。
 * 日期為轉單當天、出庫倉帶預設倉；機號留空（過帳前於銷貨單選取）。
 */
export function quoteToSaleDraft(
  quote: ErpDocumentWithLines,
  opts: { docDate: string; warehouseId: string | null },
): DraftDocument {
  return newDraftDocument("S", opts.docDate, {
    customer_id: quote.customer_id,
    warehouse_id: opts.warehouseId,
    source_doc_id: quote.id,
    sales_rep: quote.sales_rep,
    tax_type: quote.tax_type,
    tax_rate: Number(quote.tax_rate),
    currency: quote.currency,
    exchange_rate: Number(quote.exchange_rate),
    note: quote.note,
    lines: sortedLines(quote).map((l) =>
      newDraftLine(l.line_type, {
        item_id: l.line_type === "item" ? l.item_id : null,
        description: l.description ?? "",
        qty: l.line_type === "item" ? Number(l.qty) : 0,
        unit_price: l.line_type === "item" ? Number(l.unit_price) : 0,
        amount: Number(l.amount),
        source_line_id: l.line_type === "item" ? l.id : null,
      }),
    ),
  });
}

export interface ReturnableLine {
  line_id: string;
  line_no: number;
  item_id: string | null;
  description: string | null;
  sold: number;
  returned: number;
  remaining: number;
}

/**
 * 銷貨單各 item 行的可退數量：remaining = 銷貨數量 − 已過帳銷退數量（不小於 0）。
 * returnedQtyByLine 以銷貨行 id 為 key（getReturnedQtyBySourceLine 的結果）。
 */
export function returnableLines(
  sale: ErpDocumentWithLines,
  returnedQtyByLine: Record<string, number>,
): ReturnableLine[] {
  return sortedLines(sale)
    .filter((l) => l.line_type === "item")
    .map((l) => {
      const sold = Number(l.qty) || 0;
      const returned = Number(returnedQtyByLine[l.id] ?? 0);
      return {
        line_id: l.id,
        line_no: l.line_no,
        item_id: l.item_id,
        description: l.description,
        sold,
        returned,
        remaining: Math.max(0, roundHalfAwayFromZero(sold - returned, 3)),
      };
    });
}

/**
 * 銷貨單 → 銷退單草稿（spec §6「從銷貨單帶入可退行」）：
 * 只帶尚有可退數量的 item 行，qty 預設 = 可退數量（上限），單價沿用原銷貨行；
 * source_line_id = 銷貨行；入庫倉預設原出庫倉；機號由使用者勾選實際退回的台數。
 * 折扣 / 備註行不帶入（部分退貨無法自動分攤，需要時請手動新增折扣行）。
 */
export function saleToReturnDraft(
  sale: ErpDocumentWithLines,
  opts: { docDate: string; returnedQtyByLine: Record<string, number> },
): DraftDocument {
  const remaining = new Map(
    returnableLines(sale, opts.returnedQtyByLine).map((r) => [
      r.line_id,
      r.remaining,
    ]),
  );
  return newDraftDocument("SR", opts.docDate, {
    customer_id: sale.customer_id,
    warehouse_id: sale.warehouse_id,
    source_doc_id: sale.id,
    sales_rep: sale.sales_rep,
    tax_type: sale.tax_type,
    tax_rate: Number(sale.tax_rate),
    currency: sale.currency,
    exchange_rate: Number(sale.exchange_rate),
    lines: sortedLines(sale)
      .filter((l) => l.line_type === "item" && (remaining.get(l.id) ?? 0) > 0)
      .map((l) =>
        newDraftLine("item", {
          item_id: l.item_id,
          description: l.description ?? "",
          qty: remaining.get(l.id) ?? 0,
          unit_price: Number(l.unit_price),
          source_line_id: l.id,
        }),
      ),
  });
}

/**
 * 銷退草稿的數量檢查（存草稿前；過帳時 RPC 會再檢查一次）：
 * 同一來源行的退貨數量合計不得超過可退數量；來源行需屬於該銷貨單。回傳第一個錯誤或 null。
 */
export function validateReturnQty(
  lines: DraftLine[],
  returnable: ReturnableLine[],
): string | null {
  const byId = new Map(returnable.map((r) => [r.line_id, r]));
  const sum = new Map<string, number>();
  for (const [i, line] of lines.entries()) {
    if (line.line_type !== "item" || !line.source_line_id) continue;
    const src = byId.get(line.source_line_id);
    if (!src) return `第 ${i + 1} 行的來源銷貨行不屬於此銷貨單。`;
    if (src.item_id !== line.item_id) {
      return `第 ${i + 1} 行品項與來源銷貨行不同。`;
    }
    const total = roundHalfAwayFromZero(
      (sum.get(src.line_id) ?? 0) + (Number(line.qty) || 0),
      3,
    );
    sum.set(src.line_id, total);
    if (total > src.remaining) {
      return `第 ${i + 1} 行退貨數量 ${total} 超過可退數量 ${src.remaining}（原銷貨 ${src.sold}、已退 ${src.returned}）。`;
    }
  }
  return null;
}

// ── 純函式：成本與毛利（僅畫面，不列印） ─────────────────────────

export interface LineMargin {
  /** qty × unit_cost（過帳時寫入的單位成本）；未過帳 / 不追蹤庫存為 null。 */
  cost: number | null;
  /** 行銷售額（未稅）− 成本。 */
  margin: number | null;
}

export interface SaleMargins {
  lines: Record<string, LineMargin>;
  totalCost: number;
  /** 未稅合計（含折扣）− 總成本。 */
  grossMargin: number;
  /** 毛利率（0–1）；未稅合計為 0 時 null。 */
  marginRate: number | null;
}

/**
 * 銷貨單成本毛利：行銷售額以未稅計（內含稅 = 行金額 ÷ (1 + 稅率)），
 * 單據毛利 = amount_untaxed − Σ 行成本（折扣行會降低毛利）。
 */
export function calcSaleMargins(doc: ErpDocumentWithLines): SaleMargins {
  const dp = currencyDecimals(doc.currency);
  const rate = Number(doc.tax_rate) || 0;
  const lines: Record<string, LineMargin> = {};
  let totalCost = 0;
  for (const l of doc.lines) {
    if (l.line_type !== "item") continue;
    if (l.unit_cost === null || l.unit_cost === undefined) {
      lines[l.id] = { cost: null, margin: null };
      continue;
    }
    const cost = roundHalfAwayFromZero(
      (Number(l.qty) || 0) * Number(l.unit_cost),
      dp,
    );
    const amount = Number(l.amount) || 0;
    const revenue =
      doc.tax_type === "included" ? amount / (1 + rate) : Number(amount);
    lines[l.id] = {
      cost,
      margin: roundHalfAwayFromZero(revenue - cost, dp),
    };
    totalCost += cost;
  }
  totalCost = roundHalfAwayFromZero(totalCost, dp);
  const untaxed = Number(doc.amount_untaxed) || 0;
  const grossMargin = roundHalfAwayFromZero(untaxed - totalCost, dp);
  return {
    lines,
    totalCost,
    grossMargin,
    marginRate: untaxed === 0 ? null : grossMargin / untaxed,
  };
}

// ── 查詢 ──────────────────────────────────────────────────────

/**
 * 已過帳銷退單對各銷貨行的累計退貨數量（key = 銷貨行 id）。
 * excludeDocId：排除某張單（編輯中的銷退草稿本身）。
 */
export async function getReturnedQtyBySourceLine(
  saleLineIds: string[],
  excludeDocId?: string | null,
): Promise<ErpResult<Record<string, number>>> {
  if (saleLineIds.length === 0) return { ok: true, data: {} };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_document_lines")
    .select(
      "qty, source_line_id, document_id, document:erp_documents!inner(status, doc_type)",
    )
    .in("source_line_id", saleLineIds)
    .eq("line_type", "item")
    .eq("document.status", "posted")
    .eq("document.doc_type", "SR");
  if (error) return { ok: false, error: erpErrorMessage(error) };
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as {
    qty: number;
    source_line_id: string | null;
    document_id: string;
  }[]) {
    if (!row.source_line_id || row.document_id === excludeDocId) continue;
    out[row.source_line_id] = roundHalfAwayFromZero(
      (out[row.source_line_id] ?? 0) + (Number(row.qty) || 0),
      3,
    );
  }
  return { ok: true, data: out };
}

export interface DocumentBrief {
  id: string;
  doc_type: DocType;
  doc_no: string | null;
  doc_date: string;
  status: DocStatus;
  total_amount: number;
  currency: string;
}

const BRIEF_COLUMNS =
  "id, doc_type, doc_no, doc_date, status, total_amount, currency";

/** 單據摘要（來源單據連結用）。找不到回 null。 */
export async function getDocumentBrief(
  id: string,
): Promise<DocumentBrief | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select(BRIEF_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取單據失敗：${error.message}`);
  return (data as DocumentBrief | null) ?? null;
}

/** 由某單據衍生的單據（報價 → 銷貨、銷貨 → 銷退），新→舊。 */
export async function listDerivedDocuments(
  sourceDocId: string,
  docType: SalesDocType,
): Promise<DocumentBrief[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select(BRIEF_COLUMNS)
    .eq("source_doc_id", sourceDocId)
    .eq("doc_type", docType)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取衍生單據失敗：${error.message}`);
  return (data ?? []) as DocumentBrief[];
}

export interface MachineLink {
  line_id: string;
  serial_id: string;
  serial_no: string | null;
  /** 過帳時建立（true）或連結既有（false）。 */
  created: boolean;
  machine: {
    id: string;
    serial_no: string | null;
    model: string | null;
    card_type: MxCardType;
  } | null;
  /** line_serials 仍記錄 mx_machine_id，但機台已被刪除 / 讀不到。 */
  machine_id: string | null;
}

/** 銷貨單各行機號對應的保養卡機台（過帳時由 RPC 建立或連結）。 */
export async function listMachineLinks(
  lineIds: string[],
): Promise<MachineLink[]> {
  if (lineIds.length === 0) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_document_line_serials")
    .select(
      "line_id, serial_id, mx_machine_id, mx_machine_created, serial:erp_serials(serial_no), machine:mx_machines(id, serial_no, model, card_type)",
    )
    .in("line_id", lineIds)
    .not("mx_machine_id", "is", null);
  if (error) throw new Error(`讀取保養卡機台連結失敗：${error.message}`);
  return (
    (data ?? []) as unknown as {
      line_id: string;
      serial_id: string;
      mx_machine_id: string | null;
      mx_machine_created: boolean;
      serial: { serial_no: string } | null;
      machine: MachineLink["machine"];
    }[]
  ).map((r) => ({
    line_id: r.line_id,
    serial_id: r.serial_id,
    serial_no: r.serial?.serial_no ?? null,
    created: !!r.mx_machine_created,
    machine: r.machine ?? null,
    machine_id: r.mx_machine_id,
  }));
}

/** 依 id 讀保養卡機台摘要（過帳結果顯示用）。讀取失敗回空陣列（不影響過帳結果）。 */
export async function listMachinesByIds(
  ids: string[],
): Promise<{ id: string; serial_no: string | null; model: string | null }[]> {
  if (ids.length === 0) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("id, serial_no, model")
    .in("id", ids);
  if (error) return [];
  return (data ?? []) as {
    id: string;
    serial_no: string | null;
    model: string | null;
  }[];
}

/** 單據的單別（action 限定只能操作銷售區段的單據）。找不到回 null。 */
export async function getDocumentType(
  id: string,
): Promise<ErpResult<DocType | null>> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_documents")
    .select("doc_type")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return {
    ok: true,
    data: ((data as { doc_type: DocType } | null)?.doc_type ??
      null) as DocType | null,
  };
}
