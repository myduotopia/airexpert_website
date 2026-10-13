// ERP 列印（spec §7）純函式：分頁、明細列轉換、單據標題、公司抬頭常數。client / server 皆可用。
// 資料讀取見 lib/erp/queries/print.ts；版面見 components/erp/print/*。
import { computeSubtotals, currencyDecimals, subtotalLabel } from "./calc";
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

/**
 * 列印表頭的聯絡資訊行：服務專線、傳真、LINE@ 三段以全形空白分隔（#241 A-3：
 * 原本 JSX 換行處沒有空白，印成「傳真 02-2675-9955LINE@air9977」）。所有列印頁共用 PrintSheet。
 */
export function companyContactLine(): string {
  return [
    `服務專線 ${COMPANY_INFO.phone}`,
    `傳真 ${COMPANY_INFO.fax}`,
    COMPANY_INFO.line,
  ].join("　");
}

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

// ── 銷貨單收款狀態 ─────────────────────────────────────────────

/** erp_document_balances 的沖銷累計（台幣）。 */
export interface PrintDocBalance {
  allocated: number;
  outstanding: number;
}

export interface PrintPaymentRow {
  label: string;
  /** 台幣金額。 */
  amount: number;
}

/** 是否需要讀沖銷餘額：只有已過帳的銷貨單 S（列印與銷貨詳情頁共用，#222、#241 A-7）。 */
export function needsSaleBalance(
  doc: Pick<ErpDocumentWithLines, "doc_type" | "status">,
): boolean {
  return doc.doc_type === "S" && doc.status === "posted";
}

/**
 * 銷貨單列印與詳情頁的「已收款」「未收餘額」列（#222、#241 A-7）：只有已過帳的銷貨單 S 才印（草稿、作廢、
 * 其他單別回 null）。金額取自 erp_document_balances（以 total_twd 計，皆為台幣），
 * 外幣單在標題註明（台幣）。版面放在合計表右側，不佔明細列數（DOC_PRINT_ROWS 不變）。
 */
export function salePaymentRows(
  doc: Pick<ErpDocumentWithLines, "doc_type" | "status" | "currency">,
  balance: PrintDocBalance | null | undefined,
): PrintPaymentRow[] | null {
  if (!needsSaleBalance(doc) || !balance) return null;
  const suffix = doc.currency === "TWD" ? "" : "（台幣）";
  return [
    { label: `已收款${suffix}`, amount: Number(balance.allocated) },
    { label: `未收餘額${suffix}`, amount: Number(balance.outstanding) },
  ];
}

// ── 明細列 ───────────────────────────────────────────────────

export interface PrintItemInfo {
  code: string;
  name: string;
  unit: string;
}

export interface PrintLine {
  key: string;
  kind: "item" | "discount" | "note" | "subtotal";
  /** 產品編號（品項行；自由輸入行為品項文字）。 */
  code: string;
  /**
   * 品名規格（品項行：明細 description，空則品項名稱；A 單為品項名稱；小計行為標題）。
   * 可含換行（多行規格，#221），版面以 white-space: pre-line 呈現。
   */
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

/** 單據明細 → 列印列（依 line_no 已排序的 doc.lines）。小計行金額依 computeSubtotals 即時計算。 */
export function buildPrintLines(
  doc: Pick<ErpDocumentWithLines, "doc_type" | "lines">,
  items: ReadonlyMap<string, PrintItemInfo>,
): PrintLine[] {
  const subtotals = computeSubtotals(doc.lines);
  return doc.lines.map((l, i) => {
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
    if (l.line_type === "subtotal") {
      return {
        ...base,
        name: subtotalLabel(description),
        amount: subtotals[i],
      };
    }
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
      // 自由輸入行（報價單，未指定品項）：品項文字印在產品編號欄、品名規格獨立（#222）。
      code: item?.code ?? (l.item_id ? "" : (l.item_text ?? "").trim()),
      name: isAdjust
        ? (item?.name ?? "")
        : item
          ? description || item.name
          : description,
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
    .split(/\r?\n/)
    .reduce(
      (sum, seg) => sum + Math.max(1, Math.ceil(textUnits(seg) / width)),
      0,
    );
}

/** 明細表可用寬度（mm）：A4 直式 210mm − 左右邊界 12mm×2。 */
export const PRINT_TABLE_WIDTH_MM = 186;

/**
 * 明細表固定欄寬（mm）；品名規格欄取剩餘寬度。DocumentPrint 的 colgroup 依此設定，
 * 下方列數估算常數須與欄寬一致（測試會檢查）。
 * 產品編號 36mm（#248 N-7，原 28mm）：Inter 10pt 實測 14 字代碼（例 AM3-A-42012-04、C65N22B24Y4399）同一行。
 */
export const DOC_PRINT_COL_MM = {
  code: 36,
  /** 有金額的單別（報價、銷貨、銷退、採購、進貨、進退）。 */
  qty: 20,
  /** 調撥、盤點調整（無金額欄，數量欄較寬）。 */
  stockQty: 24,
  unitPrice: 22,
  amount: 26,
  /** 盤點調整單的調整原因。 */
  reason: 52,
} as const;

export interface DocPrintColumns {
  code: number;
  name: number;
  qty: number;
  /** null = 此單別不印該欄。 */
  unitPrice: number | null;
  amount: number | null;
  reason: number | null;
}

/** 各單別的明細欄寬（mm）。 */
export function docPrintColumns(docType: DocType): DocPrintColumns {
  const C = DOC_PRINT_COL_MM;
  const hasPrice = printDocKind(docType) !== "stock";
  const qty = hasPrice ? C.qty : C.stockQty;
  const unitPrice = hasPrice ? C.unitPrice : null;
  const amount = hasPrice ? C.amount : null;
  const reason = docType === "A" ? C.reason : null;
  const name =
    PRINT_TABLE_WIDTH_MM -
    C.code -
    qty -
    (unitPrice ?? 0) -
    (amount ?? 0) -
    (reason ?? 0);
  return { code: C.code, name, qty, unitPrice, amount, reason };
}

/**
 * 品名規格欄每列可容納的寬度單位：有金額的單別品名欄 82mm，約 22 個中文字（#248 N-7 前為 90mm、24 字）。
 * 調撥單品名欄較寬（126mm），沿用此值偏保守。
 */
export const NAME_UNITS_PER_ROW = 44;

/** 盤點調整單品名欄（74mm，另有調整原因欄）每列可容納的寬度單位：約 19 個中文字。 */
export const ADJUST_NAME_UNITS_PER_ROW = 38;

/** 單別的品名欄估算寬度（傳給 printLineRows）。 */
export function printNameUnitsPerRow(docType: DocType): number {
  return docType === "A" ? ADJUST_NAME_UNITS_PER_ROW : NAME_UNITS_PER_ROW;
}

/**
 * 產品編號欄每列可容納的寬度單位（36mm）。以 Inter 10pt 實測：英數約 14 字即滿一列
 * （「AM3-A-42012-04」「C65N22B24Y4399」14 字不折行；M、W 等寬字母較多時可能提早折行），
 * 中文約 9 字；英數比品名欄的估算寬，故取 14（中文 8 字以上估 2 列，偏保守）。
 */
export const CODE_UNITS_PER_ROW = 14;

/** 盤點調整單「調整原因」欄每列可容納的寬度單位（52mm，約 13 個中文字）。 */
export const REASON_UNITS_PER_ROW = 26;

/**
 * 一行明細佔用的列數：品名（多行規格每行至少一列、過長再折行）、產品編號（過長折行）
 * 與調整原因（A 單）取較多者，再加每個機號一列。
 */
export function printLineRows(
  line: PrintLine,
  unitsPerRow = NAME_UNITS_PER_ROW,
): number {
  const nameRows = estimateTextRows(line.name || " ", unitsPerRow);
  const codeRows = line.code
    ? estimateTextRows(line.code, CODE_UNITS_PER_ROW)
    : 1;
  const reasonRows = line.reason
    ? estimateTextRows(line.reason, REASON_UNITS_PER_ROW)
    : 1;
  return Math.max(nameRows, codeRows, reasonRows) + line.serials.length;
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
