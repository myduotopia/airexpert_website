// ERP 銷售（報價單 Q → 銷貨單 S → 銷退單 SR）— SERVER ONLY。
// 1. 純函式：報價轉銷貨草稿、銷貨轉銷退草稿、可退數量檢查、成本毛利試算（server action / page 用，並有單元測試）；
// 2. 查詢：已退數量、衍生單據、保養卡機台連結、單據摘要。讀取走登入者 session（RLS：has_module('erp')）。
// 過帳 / 作廢一律走 lib/erp/rpc.ts；草稿存取走 lib/erp/documents.ts。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import {
  computeSubtotals,
  roundHalfAwayFromZero,
  subtotalLabel,
} from "../calc";
import { newDraftDocument, newDraftLine } from "../draft";
import { erpErrorMessage } from "../errors";
import { formatMoney } from "../format";
import { ITEM_OPTION_COLUMNS } from "./pickers";
import type {
  DocStatus,
  DocType,
  DraftDocument,
  DraftLine,
  ErpDocumentWithLines,
  ErpResult,
  ItemOption,
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

/** 品項比對用的正規化：去頭尾空白、不分大小寫（同 erp_items_code_key 的 lower(btrim(code))）。 */
function matchKey(text: string | null | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

/**
 * 自由輸入的品項文字 → 品項主檔（#222，報價轉銷貨單用）。只在唯一命中時回傳：
 * 1. 代碼完全相符（不分大小寫、去空白）；代碼唯一，命中即採用；
 * 2. 代碼無命中時比型號（model），恰好一筆才採用（多筆同型號不猜）。
 * 不做部分比對；candidates 由呼叫端限定為啟用中品項。
 */
export function matchItemByText<T extends Pick<ItemOption, "code" | "model">>(
  text: string | null | undefined,
  candidates: readonly T[],
): T | null {
  const key = matchKey(text);
  if (!key) return null;
  const byCode = candidates.filter((c) => matchKey(c.code) === key);
  if (byCode.length > 0) return byCode.length === 1 ? byCode[0] : null;
  const byModel = candidates.filter((c) => matchKey(c.model) === key);
  return byModel.length === 1 ? byModel[0] : null;
}

/** 報價單上未指定品項的品項行文字（去空白、不分大小寫去重；保留第一次出現的寫法）。 */
export function freeTextItemQueries(quote: ErpDocumentWithLines): string[] {
  const seen = new Map<string, string>();
  for (const l of quote.lines) {
    if (l.line_type !== "item" || l.item_id) continue;
    const text = (l.item_text ?? "").trim();
    if (text && !seen.has(matchKey(text))) seen.set(matchKey(text), text);
  }
  return [...seen.values()];
}

/**
 * 報價單 → 銷貨單草稿（spec §6「轉銷貨單」）：
 * 複製表頭（客戶、業務、稅別稅率、幣別、備註）與全部明細；source_doc_id = 報價單，
 * item 行 source_line_id = 報價行（過帳時 RPC 驗證品項與客戶一致）。
 * 日期為轉單當天、出庫倉帶預設倉；機號留空（過帳前於銷貨單選取）。
 * 小計行（#221，僅報價單有）轉為備註行，文字保留標題與報價當時的金額（例「總價款 NT$328,000」），
 * 不計入銷貨合計；銷貨單之後若增刪品項，備註金額不會自動更新。
 * 自由輸入的報價行（#222）：以 matchItemByText 比對 opts.items，唯一命中即帶入該品項
 * （品名規格、單價保留報價內容——報價為議定價；品名規格空白才用品項名稱，同手動選品項）；
 * 無法唯一命中則不指定品項，品項文字併入品名規格，待使用者於銷貨草稿選品項。
 */
export function quoteToSaleDraft(
  quote: ErpDocumentWithLines,
  opts: {
    docDate: string;
    warehouseId: string | null;
    /** 自由輸入行比對用的品項主檔候選（啟用中）；未傳則不比對。 */
    items?: readonly ItemOption[];
  },
): DraftDocument {
  return newDraftDocument("S", opts.docDate, {
    customer_id: quote.customer_id,
    warehouse_id: opts.warehouseId,
    source_doc_id: quote.id,
    sales_rep: quote.sales_rep,
    sales_rep_id: quote.sales_rep_id ?? null,
    tax_type: quote.tax_type,
    tax_rate: Number(quote.tax_rate),
    currency: quote.currency,
    exchange_rate: Number(quote.exchange_rate),
    note: quote.note,
    lines: quoteLinesForSale(
      sortedLines(quote),
      quote.currency,
      opts.items ?? [],
    ),
  });
}

/** 小計行轉成備註時的文字：「標題 金額」（台幣 NT$328,000；外幣 USD 12.50）。 */
export function subtotalNoteText(
  title: string | null | undefined,
  amount: number,
  currency: string,
): string {
  const cur = currency.trim().toUpperCase();
  const money = formatMoney(amount, { currency: cur });
  return `${subtotalLabel(title)} ${cur === "TWD" ? "NT$" : `${cur} `}${money}`;
}

function quoteLinesForSale(
  lines: ErpDocumentWithLines["lines"],
  currency: string,
  items: readonly ItemOption[],
): DraftLine[] {
  const subtotals = computeSubtotals(lines);
  return lines.map((l, i) => {
    if (l.line_type === "subtotal") {
      return newDraftLine("note", {
        description: subtotalNoteText(
          l.description,
          subtotals[i] ?? 0,
          currency,
        ),
      });
    }
    const matched =
      l.line_type === "item" && !l.item_id
        ? matchItemByText(l.item_text, items)
        : null;
    if (matched) {
      return newDraftLine("item", {
        item_id: matched.id,
        description: l.description?.trim() ? l.description : matched.name,
        qty: Number(l.qty),
        unit_price: Number(l.unit_price),
        amount: Number(l.amount),
        // 報價行未指定品項，RPC 會擋「品項與來源行不同」，故不連來源行（同手動選品項）。
        source_line_id: null,
      });
    }
    return newDraftLine(l.line_type, {
      item_id: l.line_type === "item" ? l.item_id : null,
      // 銷貨單無品項文字欄：自由輸入行把品項文字併入品名規格，待選定品項後過帳。
      description:
        l.line_type === "item" && !l.item_id
          ? [l.item_text, l.description]
              .map((t) => t?.trim())
              .filter(Boolean)
              .join(" ")
          : (l.description ?? ""),
      qty: l.line_type === "item" ? Number(l.qty) : 0,
      unit_price: l.line_type === "item" ? Number(l.unit_price) : 0,
      amount: Number(l.amount),
      // 自由輸入的報價行（無品項）不連來源行：銷貨單選定品項後與來源行品項不同，過帳會被擋。
      source_line_id: l.line_type === "item" && l.item_id ? l.id : null,
    });
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
    sales_rep_id: sale.sales_rep_id ?? null,
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
  /** qty × unit_cost（過帳時寫入的台幣單位成本）；未過帳 / 不追蹤庫存為 null。 */
  cost: number | null;
  /** 行銷售額（未稅，換算台幣）− 成本。 */
  margin: number | null;
}

export interface SaleMargins {
  /** 金額一律為台幣（整數）。 */
  lines: Record<string, LineMargin>;
  totalCost: number;
  /** 未稅合計（含折扣，換算台幣）− 總成本。 */
  grossMargin: number;
  /** 毛利率（0–1）；未稅合計為 0 時 null。 */
  marginRate: number | null;
}

/**
 * 銷貨單成本毛利（台幣）：成本（unit_cost）為台幣，銷售額以單據幣別計，
 * 故先以 exchange_rate 換算台幣（取整數，四捨五入遠離零，同 total_twd）再相減。
 * 行銷售額以未稅計（內含稅 = 行金額 ÷ (1 + 稅率)），
 * 單據毛利 = round(amount_untaxed × 匯率) − Σ 行成本（折扣行會降低毛利）。
 */
export function calcSaleMargins(doc: ErpDocumentWithLines): SaleMargins {
  const rate = Number(doc.tax_rate) || 0;
  const fx = Number(doc.exchange_rate) || 1;
  const toTwd = (x: number) => roundHalfAwayFromZero(x * fx, 0);
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
      0,
    );
    const amount = Number(l.amount) || 0;
    const revenue = doc.tax_type === "included" ? amount / (1 + rate) : amount;
    lines[l.id] = { cost, margin: toTwd(revenue) - cost };
    totalCost += cost;
  }
  const untaxedTwd = toTwd(Number(doc.amount_untaxed) || 0);
  const grossMargin = untaxedTwd - totalCost;
  return {
    lines,
    totalCost,
    grossMargin,
    marginRate: untaxedTwd === 0 ? null : grossMargin / untaxedTwd,
  };
}

// ── 查詢 ──────────────────────────────────────────────────────

/** LIKE 樣式跳脫（\ % _），讓 ilike 只做不分大小寫的完全比對。 */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 報價自由輸入品項文字的比對候選（#222）：啟用中、代碼或型號與任一文字相同（不分大小寫）的品項。
 * 每段文字各查代碼與型號（ilike 無萬用字元 = 不分大小寫完全相符），結果依 id 去重；
 * 唯一性判斷交給 matchItemByText。PostgREST 的 * 萬用字元可能放寬結果，但不影響最後的完全比對。
 */
export async function listItemMatchCandidates(
  texts: readonly string[],
): Promise<ErpResult<ItemOption[]>> {
  const patterns = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  if (patterns.length === 0) return { ok: true, data: [] };
  const supabase = await getServerSupabase();
  const results = await Promise.all(
    patterns.flatMap((text) =>
      (["code", "model"] as const).map((col) =>
        supabase
          .from("erp_items")
          .select(ITEM_OPTION_COLUMNS)
          .eq("active", true)
          .ilike(col, escapeLike(text)),
      ),
    ),
  );
  const byId = new Map<string, ItemOption>();
  for (const { data, error } of results) {
    if (error) return { ok: false, error: erpErrorMessage(error) };
    for (const row of (data ?? []) as ItemOption[]) byId.set(row.id, row);
  }
  return { ok: true, data: [...byId.values()] };
}

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
