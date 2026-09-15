// ERP 報表彙總（spec §8、§6 總覽）。純函式：輸入明細列 → 輸出彙總，client / server 皆可用。
//
// 金額口徑：
// - 銷售額一律為「未稅、TWD」。每張單先依 calc.ts 算出單據未稅額（內含稅：round(subtotal/(1+rate), dp)），
//   × exchange_rate 換成 TWD（取到分），再依行金額比例分配到各行（以「分」為單位做最大餘數分配，
//   確保各行加總 = 單據未稅 TWD，群組合計與單據表頭一致）。
// - 折扣行：依客戶／業務彙總時，折扣本就屬於該單所屬群組；依品項彙總時，折扣再依該單品項行金額比例
//   分攤到各品項行（同樣最大餘數分配）。單據若無可分攤的品項行（品項行金額合計為 0），折扣列在「未分攤折扣」。
// - 成本 = Σ qty × unit_cost（unit_cost 為過帳寫入的 TWD 平均成本；不追蹤庫存的品項 unit_cost 為 null → 0）。
// - SR（銷退）的數量、銷售額、成本皆以負數扣減；作廢（voided）與草稿不計。
import { currencyDecimals, roundHalfAwayFromZero } from "./calc";
import type { DocStatus, DocType, LineType, TaxType } from "./types";

// ── 共用 ─────────────────────────────────────────────────────

/** 金額取到分（遠離 0）。 */
function cents(x: number): number {
  return roundHalfAwayFromZero(x, 2);
}

/** 數量取到 3 位（numeric(12,3)）。 */
function qty3(x: number): number {
  return roundHalfAwayFromZero(x, 3);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isoToUtcMs(iso: string): number {
  const m = ISO_DATE.exec(iso.slice(0, 10));
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 兩個西元日期（YYYY-MM-DD）相差天數：to − from。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((isoToUtcMs(to) - isoToUtcMs(from)) / 86_400_000);
}

/** 西元日期加減天數。 */
export function addDays(iso: string, days: number): string {
  const d = new Date(isoToUtcMs(iso) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** today 所在月份的 1 日～月底。 */
export function currentMonthRange(today: string): { from: string; to: string } {
  const m = ISO_DATE.exec(today);
  if (!m) throw new Error(`日期格式錯誤：${today}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const prefix = `${m[1]}-${m[2]}`;
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * 把 target（分）依 weights 比例分配成整數分，最大餘數法，保證加總 = target。
 * weights 總和為 0 時回傳 null（無法比例分配）。
 */
export function allocateCents(
  target: number,
  weights: number[],
): number[] | null {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0 || Math.abs(totalWeight) < 1e-9) return null;
  const raw = weights.map((w) => (target * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  let remainder = target - floored.reduce((s, f) => s + f, 0);
  // 依小數部分大到小補 1 分（remainder 必為 0..n 的整數）。
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floored];
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    out[order[k].i] += 1;
  }
  return out;
}

// ── 銷售毛利 ─────────────────────────────────────────────────

export interface SalesDocInput {
  id: string;
  doc_type: DocType;
  status: DocStatus;
  doc_date: string;
  customer_id: string | null;
  sales_rep: string | null;
  tax_type: TaxType;
  tax_rate: number;
  currency: string;
  exchange_rate: number;
}

export interface SalesLineInput {
  document_id: string;
  line_type: LineType;
  item_id: string | null;
  qty: number;
  amount: number;
  unit_cost: number | null;
}

export type SalesGroupBy = "customer" | "item" | "sales_rep";
export const SALES_GROUP_BY: readonly SalesGroupBy[] = [
  "customer",
  "item",
  "sales_rep",
];

/** 彙總前的最小事實列（已帶正負號、TWD 未稅）。item_id = null 表示未分攤折扣。 */
export interface SalesFact {
  document_id: string;
  customer_id: string | null;
  sales_rep: string | null;
  item_id: string | null;
  qty: number;
  revenue: number;
  cost: number;
}

/** 單據未稅額（單據幣別）— 與 calc.ts calcDocumentTotals 相同的取整規則。 */
export function documentUntaxed(
  subtotal: number,
  taxType: TaxType,
  taxRate: number,
  currency: string,
): number {
  if (taxType !== "included") return cents(subtotal);
  const rate = Number(taxRate) || 0;
  return roundHalfAwayFromZero(
    subtotal / (1 + rate),
    currencyDecimals(currency),
  );
}

/**
 * 單據 + 明細 → 事實列。只取已過帳 S / SR、doc_date 在 [from, to]（任一端可省略）。
 * 每張單的品項行各一列（折扣已依比例併入）；無品項行可分攤的折扣另成 item_id=null 一列。
 */
export function buildSalesFacts(
  docs: SalesDocInput[],
  lines: SalesLineInput[],
  period: { from?: string | null; to?: string | null } = {},
): SalesFact[] {
  const linesByDoc = new Map<string, SalesLineInput[]>();
  for (const l of lines) {
    const arr = linesByDoc.get(l.document_id);
    if (arr) arr.push(l);
    else linesByDoc.set(l.document_id, [l]);
  }

  const facts: SalesFact[] = [];
  for (const d of docs) {
    if (d.status !== "posted") continue;
    if (d.doc_type !== "S" && d.doc_type !== "SR") continue;
    if (period.from && d.doc_date < period.from) continue;
    if (period.to && d.doc_date > period.to) continue;
    const sign = d.doc_type === "SR" ? -1 : 1;

    const docLines = (linesByDoc.get(d.id) ?? []).filter(
      (l) => l.line_type === "item" || l.line_type === "discount",
    );
    const itemLines = docLines.filter((l) => l.line_type === "item");
    const discountLines = docLines.filter((l) => l.line_type === "discount");

    const subtotal = cents(
      docLines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    );
    const untaxed = documentUntaxed(
      subtotal,
      d.tax_type,
      d.tax_rate,
      d.currency,
    );
    const fx = Number(d.exchange_rate) || 0;
    const targetCents = Math.round(cents(untaxed * fx) * 100);

    // 1) 單據未稅 TWD → 各行（品項行 + 折扣行）。
    let lineCents = allocateCents(
      targetCents,
      docLines.map((l) => Number(l.amount) || 0),
    );
    if (!lineCents) {
      // 行金額合計為 0（例：折扣剛好抵銷）：各行各自換算，最後一行吸收差額。
      const factor =
        (d.tax_type === "included" ? 1 / (1 + (Number(d.tax_rate) || 0)) : 1) *
        fx;
      lineCents = docLines.map((l) =>
        Math.round((Number(l.amount) || 0) * factor * 100),
      );
      if (lineCents.length > 0) {
        const diff = targetCents - lineCents.reduce((s, c) => s + c, 0);
        lineCents[lineCents.length - 1] += diff;
      }
    }
    const centsOf = new Map<SalesLineInput, number>();
    docLines.forEach((l, i) => centsOf.set(l, lineCents![i] ?? 0));

    // 2) 折扣 → 品項行（依品項行金額比例）。
    const discountCents = discountLines.reduce(
      (s, l) => s + (centsOf.get(l) ?? 0),
      0,
    );
    const itemRevenueCents = itemLines.map((l) => centsOf.get(l) ?? 0);
    let unallocatedDiscount = 0;
    if (discountCents !== 0) {
      const shares = allocateCents(
        discountCents,
        itemLines.map((l) => Number(l.amount) || 0),
      );
      if (shares) shares.forEach((s, i) => (itemRevenueCents[i] += s));
      else unallocatedDiscount = discountCents;
    }

    itemLines.forEach((l, i) => {
      const q = Number(l.qty) || 0;
      facts.push({
        document_id: d.id,
        customer_id: d.customer_id,
        sales_rep: d.sales_rep,
        item_id: l.item_id,
        qty: sign * q,
        revenue: (sign * itemRevenueCents[i]) / 100,
        cost: cents(sign * q * (Number(l.unit_cost) || 0)),
      });
    });
    if (unallocatedDiscount !== 0) {
      facts.push({
        document_id: d.id,
        customer_id: d.customer_id,
        sales_rep: d.sales_rep,
        item_id: null,
        qty: 0,
        revenue: (sign * unallocatedDiscount) / 100,
        cost: 0,
      });
    }
  }
  return facts;
}

export interface SalesMarginRow {
  /** customer_id / item_id / sales_rep；null 表示未指定（或未分攤折扣）。 */
  key: string | null;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  /** 毛利率（0.25 = 25%）；銷售額為 0 時 null。 */
  marginRate: number | null;
}

export interface SalesMarginReport {
  rows: SalesMarginRow[];
  totals: Omit<SalesMarginRow, "key">;
}

function finishRow<K extends string | null>(
  key: K,
  qty: number,
  revenue: number,
  cost: number,
) {
  const r = cents(revenue);
  const c = cents(cost);
  const margin = cents(r - c);
  return {
    key,
    qty: qty3(qty),
    revenue: r,
    cost: c,
    margin,
    marginRate: r === 0 ? null : margin / r,
  };
}

function groupKey(f: SalesFact, groupBy: SalesGroupBy): string | null {
  switch (groupBy) {
    case "customer":
      return f.customer_id;
    case "item":
      return f.item_id;
    default: {
      const rep = (f.sales_rep ?? "").trim();
      return rep === "" ? null : rep;
    }
  }
}

/** 事實列 → 依客戶／品項／業務彙總（銷售額大到小）+ 合計。 */
export function aggregateSalesMargin(
  facts: SalesFact[],
  groupBy: SalesGroupBy,
): SalesMarginReport {
  const acc = new Map<
    string | null,
    { qty: number; revenue: number; cost: number }
  >();
  let tq = 0;
  let tr = 0;
  let tc = 0;
  for (const f of facts) {
    const k = groupKey(f, groupBy);
    const a = acc.get(k) ?? { qty: 0, revenue: 0, cost: 0 };
    a.qty += f.qty;
    a.revenue += f.revenue;
    a.cost += f.cost;
    acc.set(k, a);
    tq += f.qty;
    tr += f.revenue;
    tc += f.cost;
  }
  const rows = [...acc.entries()]
    .map(([k, a]) => finishRow(k, a.qty, a.revenue, a.cost))
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) ||
        String(a.key).localeCompare(String(b.key)),
    );
  const { key: _k, ...totals } = finishRow(null, tq, tr, tc);
  void _k;
  return { rows, totals };
}

// ── 帳齡（應收 / 應付） ──────────────────────────────────────

export type AgingBucket = "d0_30" | "d31_60" | "d61_90" | "d90p";
export const AGING_BUCKETS: readonly AgingBucket[] = [
  "d0_30",
  "d31_60",
  "d61_90",
  "d90p",
];
export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  d0_30: "0–30 天",
  d31_60: "31–60 天",
  d61_90: "61–90 天",
  d90p: "超過 90 天",
};

/** 單據日期距基準日天數 → 區間。未來日期（負天數）歸 0–30。 */
export function agingBucket(docDate: string, asOf: string): AgingBucket {
  const age = daysBetween(docDate, asOf);
  if (age <= 30) return "d0_30";
  if (age <= 60) return "d31_60";
  if (age <= 90) return "d61_90";
  return "d90p";
}

export interface AgingDocInput {
  doc_type: DocType;
  doc_date: string;
  customer_id: string | null;
  vendor_id: string | null;
  outstanding: number;
}

export interface AgingPartyInput {
  party_id: string;
  balance: number;
  unallocated: number;
}

export interface AgingRow {
  party_id: string;
  buckets: Record<AgingBucket, number>;
  /** 未沖銷單據合計（= Σ 區間）。 */
  outstanding: number;
  /** 未沖銷預收（付）。 */
  unallocated: number;
  /** 淨額 = outstanding − unallocated。 */
  net: number;
}

export interface AgingReport {
  rows: AgingRow[];
  totals: Omit<AgingRow, "party_id">;
}

function emptyBuckets(): Record<AgingBucket, number> {
  return { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
}

/**
 * 帳齡彙總。partyType=customer 取 S/SR，vendor 取 I/PR（SR/PR outstanding 已為負）。
 * 列出未沖銷或預收（付）不為 0 的對象，依淨額大到小排序。
 */
export function buildAgingReport(
  docs: AgingDocInput[],
  parties: AgingPartyInput[],
  asOf: string,
  partyType: "customer" | "vendor",
): AgingReport {
  const types: DocType[] = partyType === "customer" ? ["S", "SR"] : ["I", "PR"];
  const map = new Map<
    string,
    { buckets: Record<AgingBucket, number>; unallocated: number }
  >();
  const entry = (id: string) => {
    let e = map.get(id);
    if (!e) {
      e = { buckets: emptyBuckets(), unallocated: 0 };
      map.set(id, e);
    }
    return e;
  };

  for (const d of docs) {
    if (!types.includes(d.doc_type)) continue;
    const id = partyType === "customer" ? d.customer_id : d.vendor_id;
    if (!id) continue;
    const amt = Number(d.outstanding) || 0;
    if (amt === 0) continue;
    entry(id).buckets[agingBucket(d.doc_date, asOf)] += amt;
  }
  for (const p of parties) {
    const u = Number(p.unallocated) || 0;
    if (u !== 0) entry(p.party_id).unallocated += u;
  }

  const totals = {
    buckets: emptyBuckets(),
    outstanding: 0,
    unallocated: 0,
    net: 0,
  };
  const rows: AgingRow[] = [];
  for (const [party_id, e] of map) {
    const buckets = emptyBuckets();
    for (const b of AGING_BUCKETS) buckets[b] = cents(e.buckets[b]);
    const outstanding = cents(
      AGING_BUCKETS.reduce((s, b) => s + buckets[b], 0),
    );
    const unallocated = cents(e.unallocated);
    if (outstanding === 0 && unallocated === 0) continue;
    const net = cents(outstanding - unallocated);
    rows.push({ party_id, buckets, outstanding, unallocated, net });
    for (const b of AGING_BUCKETS) totals.buckets[b] += buckets[b];
    totals.outstanding += outstanding;
    totals.unallocated += unallocated;
  }
  for (const b of AGING_BUCKETS) totals.buckets[b] = cents(totals.buckets[b]);
  totals.outstanding = cents(totals.outstanding);
  totals.unallocated = cents(totals.unallocated);
  totals.net = cents(totals.outstanding - totals.unallocated);
  rows.sort((a, b) => b.net - a.net || a.party_id.localeCompare(b.party_id));
  return { rows, totals };
}

// ── 總覽 ─────────────────────────────────────────────────────

export interface LowStockItemInput {
  id: string;
  track_stock: boolean;
  safety_stock: number;
}

/** 低庫存品項數：追蹤庫存、各倉合計 < 安全存量（與存量表 isLowStock 一致，數量取 3 位比較）。 */
export function countLowStock(
  items: LowStockItemInput[],
  levels: { item_id: string; qty: number }[],
): number {
  const totals = new Map<string, number>();
  for (const l of levels) {
    totals.set(l.item_id, (totals.get(l.item_id) ?? 0) + (Number(l.qty) || 0));
  }
  return items.filter(
    (i) =>
      i.track_stock &&
      qty3(totals.get(i.id) ?? 0) < qty3(Number(i.safety_stock) || 0),
  ).length;
}

export interface CheckDueInput {
  id: string;
  direction: "in" | "out";
  method: string;
  status: string;
  check_status: string | null;
  check_due_date: string | null;
}

/** 到期支票：已過帳、支票、未兌現（pending）、到期日在 [today, today+days]；依到期日排序。 */
export function filterChecksDue<T extends CheckDueInput>(
  payments: T[],
  today: string,
  days = 7,
): T[] {
  const end = addDays(today, days);
  return payments
    .filter(
      (p) =>
        p.method === "check" &&
        p.status === "posted" &&
        p.check_status === "pending" &&
        !!p.check_due_date &&
        p.check_due_date >= today &&
        p.check_due_date <= end,
    )
    .sort(
      (a, b) =>
        (a.check_due_date ?? "").localeCompare(b.check_due_date ?? "") ||
        a.id.localeCompare(b.id),
    );
}

/** 收付款詳情頁路徑。 */
export function paymentHref(p: {
  id: string;
  direction: "in" | "out";
}): string {
  return `/admin/erp/${p.direction === "in" ? "collections" : "disbursements"}/${p.id}`;
}

// ── CSV ──────────────────────────────────────────────────────

export type CsvCell = string | number | null | undefined;

const CSV_BOM = "﻿";

/** 單一欄位：數字輸出原值；文字若含逗號、引號、換行則加雙引號並跳脫；公式開頭字元前加 '。 */
export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV（UTF-8 BOM、CRLF），Excel 直接開啟中文不亂碼。 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** 毛利率 → 百分比數值（小數 1 位，例 0.2534 → 25.3）；null 維持 null。 */
export function percentValue(rate: number | null): number | null {
  return rate === null ? null : roundHalfAwayFromZero(rate * 100, 1);
}
