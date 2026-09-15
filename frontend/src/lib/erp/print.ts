// ERP 列印（spec §7）純函式：分頁、明細列轉換、單據標題、公司抬頭常數。client / server 皆可用。
// 資料讀取見 lib/erp/queries/print.ts；版面見 components/erp/print/*。
import { currencyDecimals } from "./calc";
import { formatMoney } from "./format";
import type { DocStatus, DocType, ErpDocumentWithLines } from "./types";

// ── 公司抬頭 ─────────────────────────────────────────────────

/**
 * 公司抬頭（site_settings 目前只存 LOGO / favicon，聯絡資訊沒有對應設定，故用常數；
 * LOGO 由列印頁以 getBranding() 取得）。
 */
export const COMPANY_INFO = {
  name: "勁賀空壓科技有限公司",
  phone: "02-2675-9977",
  fax: "02-2675-9955",
  line: "LINE@air9977",
} as const;

// ── 單據 ─────────────────────────────────────────────────────

/** 列印版單據名稱（對照紙本：客戶銷貨單 / 廠商採購單）。 */
export const PRINT_DOC_TITLE: Record<DocType, string> = {
  Q: "報價單",
  S: "客戶銷貨單",
  SR: "銷退單",
  P: "廠商採購單",
  I: "進貨單",
  PR: "進退單",
  T: "調撥單",
  A: "盤點調整單",
};

export type PrintDocKind = "customer" | "vendor" | "stock";

/** Q/S/SR → customer；P/I/PR → vendor；T/A → stock（無金額）。 */
export function printDocKind(docType: DocType): PrintDocKind {
  if (docType === "Q" || docType === "S" || docType === "SR") return "customer";
  if (docType === "P" || docType === "I" || docType === "PR") return "vendor";
  return "stock";
}

/** 各單別的後台列表路徑（列印頁「返回」的退路）。 */
export const DOC_LIST_PATH: Record<DocType, string> = {
  Q: "/admin/erp/quotes",
  S: "/admin/erp/sales",
  SR: "/admin/erp/sales-returns",
  P: "/admin/erp/purchases",
  I: "/admin/erp/receipts",
  PR: "/admin/erp/purchase-returns",
  T: "/admin/erp/transfers",
  A: "/admin/erp/adjustments",
};

/** 草稿 / 作廢浮水印文字；已過帳回 null。 */
export function watermarkText(status: DocStatus): string | null {
  if (status === "draft") return "草稿";
  if (status === "voided") return "作廢";
  return null;
}

/** 西元 "YYYY-MM-DD" → 民國精簡「115/09/15」（表格欄位用）。空 / 無效回 ""。 */
export function rocShort(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return "";
  return `${Number(m[1]) - 1911}/${m[2]}/${m[3]}`;
}

/** 單價顯示：外幣 2 位；台幣整數顯示整數、有小數才顯示 2 位。 */
export function formatUnitPrice(value: number, currency: string): string {
  const dp =
    currencyDecimals(currency) > 0 || !Number.isInteger(Number(value)) ? 2 : 0;
  return formatMoney(Number(value), { decimals: dp });
}

// ── 明細列 ───────────────────────────────────────────────────

export interface PrintItemInfo {
  code: string;
  name: string;
  unit: string;
}

export interface PrintLine {
  key: string;
  kind: "item" | "discount" | "note";
  /** 產品編號（品項行）。 */
  code: string;
  /** 品名規格（品項行：明細 description，空則品項名稱；A 單為品項名稱）。 */
  name: string;
  /** 盤點調整原因（僅 A 單品項行，取自明細 description）。 */
  reason: string;
  qty: number | null;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  /** 機號（已選既有機號優先，否則草稿新機號）。 */
  serials: string[];
}

/** 單據明細 → 列印列（依 line_no 已排序的 doc.lines）。 */
export function buildPrintLines(
  doc: Pick<ErpDocumentWithLines, "doc_type" | "lines">,
  items: ReadonlyMap<string, PrintItemInfo>,
): PrintLine[] {
  return doc.lines.map((l) => {
    const description = (l.description ?? "").trim();
    const base: PrintLine = {
      key: l.id,
      kind: l.line_type,
      code: "",
      name: description,
      reason: "",
      qty: null,
      unit: "",
      unitPrice: null,
      amount: null,
      serials: [],
    };
    if (l.line_type === "note") return base;
    if (l.line_type === "discount") {
      return { ...base, name: description || "折扣", amount: Number(l.amount) };
    }
    const item = l.item_id ? items.get(l.item_id) : undefined;
    const serials = (
      l.serials.length
        ? l.serials.map((s) => s.serial_no)
        : (l.serial_nos ?? [])
    )
      .map((s) => s.trim())
      .filter(Boolean);
    const isAdjust = doc.doc_type === "A";
    return {
      ...base,
      code: item?.code ?? "",
      name: isAdjust ? (item?.name ?? "") : description || (item?.name ?? ""),
      reason: isAdjust ? description : "",
      qty: Number(l.qty),
      unit: item?.unit ?? "",
      unitPrice: Number(l.unit_price),
      amount: Number(l.amount),
      serials,
    };
  });
}

// ── 列高估算 ─────────────────────────────────────────────────

/** 全形字元的 Unicode 區段（CJK、注音、韓文、全形標點與英數）。 */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
];

/** 文字寬度單位：全形（CJK 等）算 2、其餘算 1。 */
export function textUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    units += WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1;
  }
  return units;
}

/** 文字在寬度 unitsPerRow 的欄位內大約佔幾列（至少 1；含換行字元）。 */
export function estimateTextRows(text: string, unitsPerRow: number): number {
  const width = Math.max(1, Math.floor(unitsPerRow));
  return text
    .split("\n")
    .reduce(
      (sum, seg) => sum + Math.max(1, Math.ceil(textUnits(seg) / width)),
      0,
    );
}

/** 品名規格欄每列可容納的寬度單位（約 25 個中文字）。 */
export const NAME_UNITS_PER_ROW = 48;

/** 一行明細佔用的列數：品名（可能換行）+ 每個機號一列。 */
export function printLineRows(
  line: PrintLine,
  unitsPerRow = NAME_UNITS_PER_ROW,
): number {
  return estimateTextRows(line.name || " ", unitsPerRow) + line.serials.length;
}

// ── 分頁 ─────────────────────────────────────────────────────

export interface PaginateOptions<T> {
  /** 第一頁明細可用列數。 */
  firstPageRows: number;
  /** 第二頁起明細可用列數。 */
  otherPageRows: number;
  /** 每行佔用列數（預設 1）；機號子列、換行品名應計入。 */
  rowsOf?: (line: T) => number;
  /** 最後一頁需保留給合計 / 總計區塊的列數（預設 0）。 */
  lastPageReserve?: number;
}

export interface PrintPage<T> {
  /** 1 起算。 */
  pageNo: number;
  pageCount: number;
  isFirst: boolean;
  isLast: boolean;
  lines: T[];
}

/**
 * 明細分頁（spec §7：每頁重複表頭、頁次「1 / 2」、總計只在最後一頁）。
 * - 以列數預算依序填頁；一行（含其機號子列）不拆到兩頁。
 * - 單行超過整頁預算時獨佔一頁（允許溢出，不遺失資料）。
 * - 最後一頁放不下 lastPageReserve 時，把該頁最後一行移到新頁，讓總計與明細同頁；
 *   該頁只剩一行仍放不下時，另起一頁只放總計。
 * - 無明細時回傳一頁空頁。
 */
export function paginateLines<T>(
  lines: readonly T[],
  opts: PaginateOptions<T>,
): PrintPage<T>[] {
  const first = Math.max(1, Math.floor(opts.firstPageRows));
  const other = Math.max(1, Math.floor(opts.otherPageRows));
  const reserve = Math.max(0, Math.floor(opts.lastPageReserve ?? 0));
  const rowsOf = (l: T) => Math.max(1, Math.ceil(opts.rowsOf?.(l) ?? 1));
  const budget = (pageIndex: number) => (pageIndex === 0 ? first : other);

  const pages: { lines: T[]; used: number }[] = [{ lines: [], used: 0 }];
  for (const line of lines) {
    const rows = rowsOf(line);
    let cur = pages[pages.length - 1];
    if (cur.lines.length > 0 && cur.used + rows > budget(pages.length - 1)) {
      cur = { lines: [], used: 0 };
      pages.push(cur);
    }
    cur.lines.push(line);
    cur.used += rows;
  }

  const lastIndex = pages.length - 1;
  const last = pages[lastIndex];
  if (reserve > 0 && last.used + reserve > budget(lastIndex)) {
    if (last.lines.length > 1) {
      const moved = last.lines.pop() as T;
      const rows = rowsOf(moved);
      last.used -= rows;
      pages.push({ lines: [moved], used: rows });
    } else if (last.lines.length === 1) {
      pages.push({ lines: [], used: 0 });
    }
  }

  const pageCount = pages.length;
  return pages.map((p, i) => ({
    pageNo: i + 1,
    pageCount,
    isFirst: i === 0,
    isLast: i === pageCount - 1,
    lines: p.lines,
  }));
}

/** 每頁明細列預算（A4 直式、12mm 邊界；表頭於每頁重複，數值依版面實測保守估計）。 */
export const DOC_PRINT_ROWS = {
  firstPageRows: 22,
  otherPageRows: 22,
  lastPageReserve: 4,
} as const;

export const STATEMENT_PRINT_ROWS = {
  firstPageRows: 26,
  otherPageRows: 26,
  lastPageReserve: 3,
} as const;

/** 對帳單摘要欄每列寬度單位（約 17 個中文字）。 */
export const STATEMENT_DESC_UNITS_PER_ROW = 34;
