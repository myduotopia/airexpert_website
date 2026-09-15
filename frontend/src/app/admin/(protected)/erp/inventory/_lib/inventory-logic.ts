// 庫存區（#176）的純函式：存量表、低庫存判定、異動結存、調撥單 T / 盤點調整單 A 的正規化與驗證。
// 不讀 DB、不含 server-only，client 表單與 server action 共用，並以 vitest 測試。
import { roundHalfAwayFromZero } from "@/lib/erp/calc";
import type {
  DocStatus,
  DocType,
  DraftDocument,
  DraftLine,
  ItemKind,
  LineType,
  SerialStatus,
} from "@/lib/erp/types";

/** 庫存區自有的單別。 */
export type StockDocType = "T" | "A";

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  machine: "整機",
  part: "零件耗材",
  service: "服務",
  expense: "費用",
};

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "在庫",
  sold: "已售出",
  returned_to_vendor: "已退廠",
  written_off: "已盤虧",
};

/** 單別 → 後台路由區段（/admin/erp/<segment>/<id>）。 */
export const DOC_ROUTE_SEGMENT: Record<DocType, string> = {
  Q: "quotes",
  P: "purchases",
  I: "receipts",
  PR: "purchase-returns",
  S: "sales",
  SR: "sales-returns",
  T: "transfers",
  A: "adjustments",
};

export function docHref(docType: DocType, id: string): string {
  return `/admin/erp/${DOC_ROUTE_SEGMENT[docType]}/${id}`;
}

/** 數量取 3 位（numeric(12,3)），避免浮點累加誤差。 */
export function roundQty(n: number): number {
  return roundHalfAwayFromZero(Number(n) || 0, 3);
}

/** 今天（台北時區）的西元 ISO 日期。 */
export function todayTaipeiIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ── 存量表 ───────────────────────────────────────────────────

/** 低庫存：全倉總量低於安全存量（安全存量為全公司層級）。 */
export function isLowStock(total: number, safetyStock: number): boolean {
  return roundQty(total) < roundQty(safetyStock);
}

export interface StockMatrixItem {
  id: string;
  code: string;
  name: string;
  kind: ItemKind;
  unit: string;
  avg_cost: number;
  safety_stock: number;
  active: boolean;
}

export interface StockLevelRow {
  item_id: string;
  warehouse_id: string;
  qty: number;
}

export interface StockMatrixRow extends StockMatrixItem {
  /** warehouse_id → 數量（無存量列的倉視為 0）。 */
  qtyByWarehouse: Record<string, number>;
  total: number;
  /** 庫存金額 = 總量 × 平均成本（TWD 取整）。 */
  value: number;
  low: boolean;
}

export interface StockMatrixFilters {
  kind?: ItemKind | null;
  onlyLow?: boolean;
  /** 搜尋品項代碼 / 名稱（不分大小寫）。 */
  q?: string | null;
}

/** 品項 × 倉庫存量表。停用品項只在仍有存量時列出。依品項代碼排序。 */
export function buildStockMatrix(
  items: StockMatrixItem[],
  levels: StockLevelRow[],
  filters: StockMatrixFilters = {},
): StockMatrixRow[] {
  const byItem = new Map<string, Record<string, number>>();
  for (const l of levels) {
    const m = byItem.get(l.item_id) ?? {};
    m[l.warehouse_id] = roundQty((m[l.warehouse_id] ?? 0) + Number(l.qty));
    byItem.set(l.item_id, m);
  }
  const q = (filters.q ?? "").trim().toLowerCase();

  return items
    .map((item): StockMatrixRow => {
      const qtyByWarehouse = byItem.get(item.id) ?? {};
      const total = roundQty(
        Object.values(qtyByWarehouse).reduce((s, n) => s + n, 0),
      );
      const avg = Number(item.avg_cost) || 0;
      const safety = Number(item.safety_stock) || 0;
      return {
        ...item,
        avg_cost: avg,
        safety_stock: safety,
        qtyByWarehouse,
        total,
        value: roundHalfAwayFromZero(total * avg, 0),
        low: isLowStock(total, safety),
      };
    })
    .filter((r) => r.active || r.total !== 0)
    .filter((r) => !filters.kind || r.kind === filters.kind)
    .filter((r) => !filters.onlyLow || r.low)
    .filter(
      (r) =>
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    )
    .sort((a, b) => a.code.localeCompare(b.code));
}

// ── 異動明細結存 ─────────────────────────────────────────────

export interface MoveLike {
  move_date: string;
  moved_at: string;
  qty: number;
}

export function sumQty(moves: { qty: number }[]): number {
  return roundQty(moves.reduce((s, m) => s + Number(m.qty), 0));
}

/**
 * 逐列結存：opening = 區間起日前的累計量（同品項 / 倉庫篩選），依 (move_date, moved_at) 排序
 * （同時間保留輸入順序）後逐列累加。回傳新陣列，不改動輸入。
 */
export function computeRunningBalance<T extends MoveLike>(
  opening: number,
  moves: T[],
): (T & { balance: number })[] {
  const sorted = moves
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        a.m.move_date.localeCompare(b.m.move_date) ||
        Date.parse(a.m.moved_at) - Date.parse(b.m.moved_at) ||
        a.i - b.i,
    );
  let balance = roundQty(opening);
  return sorted.map(({ m }) => {
    balance = roundQty(balance + Number(m.qty));
    return { ...m, balance };
  });
}

// ── 調撥單 T / 盤點調整單 A ──────────────────────────────────

/**
 * 存草稿前整理明細（T / A 不涉及金額）：
 * - 單價一律 0；備註行不帶機號；
 * - T：只用既有機號（serial_ids）；
 * - A：盤盈（qty > 0）只用新機號 serial_nos、盤虧（qty < 0）只用既有機號 serial_ids。
 * 避免數量正負切換後殘留另一種機號，過帳 / 作廢時誤判。
 */
export function normalizeStockDocLines(
  docType: StockDocType,
  lines: DraftLine[],
): DraftLine[] {
  return lines.map((l) => {
    const base = { ...l, unit_price: 0, amount: 0 };
    if (l.line_type !== "item") {
      return { ...base, serial_ids: [], serial_nos: [] };
    }
    if (docType === "T") return { ...base, serial_nos: [] };
    if (l.qty > 0) return { ...base, serial_ids: [] };
    if (l.qty < 0) return { ...base, serial_nos: [] };
    return { ...base, serial_ids: [], serial_nos: [] };
  });
}

/** 存草稿時的額外檢查（validateDraftDocument 之外）：T 數量不可為負、A 品項行原因必填。 */
export function validateStockDocDraft(
  docType: StockDocType,
  doc: Pick<DraftDocument, "doc_type" | "lines">,
): string | null {
  if (doc.doc_type !== docType) return "單別不正確。";
  for (const [i, line] of doc.lines.entries()) {
    if (line.line_type === "discount") {
      return `第 ${i + 1} 行：${docType === "T" ? "調撥單" : "盤點調整單"}不可有折扣行。`;
    }
    if (line.line_type !== "item") continue;
    if (docType === "T" && line.qty < 0) {
      return `第 ${i + 1} 行調撥數量不可為負數。`;
    }
    if (docType === "A" && !line.description?.trim()) {
      return `第 ${i + 1} 行需填寫調整原因。`;
    }
  }
  return null;
}

export interface StockDocItemInfo {
  id: string;
  code: string;
  track_serial: boolean;
  track_stock: boolean;
}

export interface StockDocForPost {
  doc_type: DocType;
  status: DocStatus;
  warehouse_id: string | null;
  to_warehouse_id: string | null;
  lines: {
    line_no: number;
    line_type: LineType;
    item_id: string | null;
    description: string | null;
    qty: number;
    serial_nos: string[] | null;
    serials: { id: string }[];
  }[];
}

/**
 * 過帳前檢查（呼叫 erp_post_document 前先擋下明顯錯誤，給較清楚的訊息；DB 仍會再驗）：
 * 草稿、倉庫、至少一個品項行、數量、A 原因必填、機號數量規則
 * （T 與 A 盤虧：選取既有機號數 = |qty|；A 盤盈：新機號數 = qty 且不可空白或重複）。
 */
export function validateStockDocForPost(
  docType: StockDocType,
  doc: StockDocForPost,
  items: StockDocItemInfo[],
): string | null {
  if (doc.doc_type !== docType) return "單別不正確。";
  if (doc.status !== "draft") return "此單據已不是草稿，無法過帳。";
  if (docType === "T") {
    if (!doc.warehouse_id || !doc.to_warehouse_id) {
      return "調撥單需選擇來源倉與目的倉。";
    }
    if (doc.warehouse_id === doc.to_warehouse_id) {
      return "調撥單的來源倉與目的倉不可相同。";
    }
  } else if (!doc.warehouse_id) {
    return "請選擇盤點調整的倉庫。";
  }

  const itemLines = doc.lines
    .filter((l) => l.line_type === "item")
    .sort((a, b) => a.line_no - b.line_no);
  if (itemLines.length === 0) return "單據至少需要一個品項行。";

  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const line of itemLines) {
    const n = line.line_no;
    const item = line.item_id ? itemById.get(line.item_id) : undefined;
    if (!item) return `第 ${n} 行請選擇品項。`;
    if (!item.track_stock) {
      return `第 ${n} 行（${item.code}）不追蹤庫存，不可${docType === "T" ? "調撥" : "盤點調整"}。`;
    }
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty === 0) {
      return `第 ${n} 行（${item.code}）數量不可為 0。`;
    }
    if (docType === "T" && qty < 0) {
      return `第 ${n} 行（${item.code}）調撥數量需為正數。`;
    }
    if (docType === "A" && !line.description?.trim()) {
      return `第 ${n} 行需填寫調整原因。`;
    }
    if (!item.track_serial) continue;

    const abs = Math.abs(qty);
    if (!Number.isInteger(abs)) {
      return `第 ${n} 行（${item.code}）追蹤機號的品項數量需為整數。`;
    }
    if (docType === "A" && qty > 0) {
      const raw = line.serial_nos ?? [];
      const cleaned = raw.map((s) => s.trim());
      if (cleaned.some((s) => !s)) {
        return `第 ${n} 行（${item.code}）機號不可空白。`;
      }
      if (
        new Set(cleaned.map((s) => s.toLowerCase())).size !== cleaned.length
      ) {
        return `第 ${n} 行（${item.code}）機號重複。`;
      }
      if (cleaned.length !== abs) {
        return `第 ${n} 行（${item.code}）盤盈需輸入 ${abs} 個新機號（目前 ${cleaned.length} 個）。`;
      }
    } else if (line.serials.length !== abs) {
      const verb = docType === "T" ? "調撥" : "盤虧";
      return `第 ${n} 行（${item.code}）${verb}需選取 ${abs} 台機號（目前 ${line.serials.length} 台）。`;
    }
  }
  return null;
}
