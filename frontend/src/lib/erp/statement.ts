// 月結對帳單（spec §5.5）純函式：期初 / 本期逐列累計 / 期末。client / server 皆可用。
// 資料讀取見 lib/erp/queries/ar-ap.ts 的 getStatementData（#178 列印頁共用）。
//
// 金額規則：
//   * 單據：S、I 為 +；SR、PR 為 −（輸入的 total_twd 不論正負，一律依單別定號，
//     因此 erp_documents 原始值或 erp_document_balances 已帶負號的值皆可直接傳入）。
//   * 收付款：amount 一律減少餘額（收款減應收、付款減應付）。
//   * 期初 = 起日前已過帳單據合計 − 起日前已過帳收付款合計；期末 = 期初 + 本期單據 − 本期收付款。
//   * 作廢（status ≠ posted）不列入；草稿單據亦不列入。
import { rocDate } from "@/lib/admin/minguo";
import type { DocType, PartyType, PaymentMethod } from "./types";
import { DOC_TYPE_LABEL } from "./doc-no";

export interface StatementDocInput {
  id: string;
  doc_type: DocType;
  doc_no: string | null;
  doc_date: string;
  total_twd: number;
  /** 未提供視為 posted（查詢端已篩選）。 */
  status?: string | null;
  invoice_no?: string | null;
  note?: string | null;
}

export interface StatementPaymentInput {
  id: string;
  doc_no: string | null;
  pay_date: string;
  method: PaymentMethod;
  amount: number;
  check_no?: string | null;
  check_due_date?: string | null;
  /** 未提供視為 posted。 */
  status?: string | null;
  note?: string | null;
}

export interface StatementRow {
  kind: "document" | "payment";
  id: string;
  date: string;
  doc_no: string | null;
  doc_type: DocType | null;
  method: PaymentMethod | null;
  description: string;
  /** 單據金額（SR / PR 為負）；收付款列為 null。 */
  charge: number | null;
  /** 收付款金額（正數，減少餘額）；單據列為 null。 */
  payment: number | null;
  /** 此列之後的累計餘額。 */
  balance: number;
}

export interface Statement {
  from: string;
  to: string;
  opening: number;
  /** 本期單據合計（含 SR / PR 負數）。 */
  documentsTotal: number;
  /** 本期收付款合計。 */
  paymentsTotal: number;
  closing: number;
  rows: StatementRow[];
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "現金",
  transfer: "匯款",
  check: "支票",
  other: "其他",
};

/** 金額取到分，避免浮點累加誤差。 */
export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 單據對餘額的影響：S / I 為 +，SR / PR 為 −。 */
export function signedDocAmount(docType: DocType, totalTwd: number): number {
  const abs = Math.abs(Number(totalTwd) || 0);
  return docType === "SR" || docType === "PR" ? -abs : abs;
}

function isPosted(status: string | null | undefined): boolean {
  return status == null || status === "posted";
}

function docDescription(d: StatementDocInput): string {
  const parts = [DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type];
  if (d.invoice_no?.trim()) parts.push(`發票 ${d.invoice_no.trim()}`);
  if (d.note?.trim()) parts.push(d.note.trim());
  return parts.join("　");
}

function paymentDescription(
  p: StatementPaymentInput,
  partyType: PartyType,
): string {
  const parts = [
    `${partyType === "vendor" ? "付款" : "收款"}（${PAYMENT_METHOD_LABEL[p.method] ?? p.method}）`,
  ];
  if (p.method === "check") {
    if (p.check_no?.trim()) parts.push(`票號 ${p.check_no.trim()}`);
    if (p.check_due_date) parts.push(`票期 ${rocDate(p.check_due_date)}`);
  }
  if (p.note?.trim()) parts.push(p.note.trim());
  return parts.join("　");
}

/**
 * 組對帳單。from / to 為西元 YYYY-MM-DD（含端點）。
 * openingDocs / openingPayments：起日前的資料；docs / payments：期間內的資料。
 * 為了容錯，仍會依日期再篩一次（落在錯誤區段的列會被忽略）。
 * 同日排序：單據在前、收付款在後，再依單號。
 */
export function buildStatement(input: {
  openingDocs: StatementDocInput[];
  openingPayments: StatementPaymentInput[];
  docs: StatementDocInput[];
  payments: StatementPaymentInput[];
  from: string;
  to: string;
  partyType?: PartyType;
}): Statement {
  const { from, to } = input;
  const partyType = input.partyType ?? "customer";

  let opening = 0;
  for (const d of input.openingDocs) {
    if (isPosted(d.status) && d.doc_date < from) {
      opening += signedDocAmount(d.doc_type, d.total_twd);
    }
  }
  for (const p of input.openingPayments) {
    if (isPosted(p.status) && p.pay_date < from) {
      opening -= Math.abs(Number(p.amount) || 0);
    }
  }
  opening = roundCents(opening);

  const inPeriod = (date: string) => date >= from && date <= to;
  type Pending = Omit<StatementRow, "balance">;
  const pending: Pending[] = [];
  for (const d of input.docs) {
    if (!isPosted(d.status) || !inPeriod(d.doc_date)) continue;
    pending.push({
      kind: "document",
      id: d.id,
      date: d.doc_date,
      doc_no: d.doc_no,
      doc_type: d.doc_type,
      method: null,
      description: docDescription(d),
      charge: signedDocAmount(d.doc_type, d.total_twd),
      payment: null,
    });
  }
  for (const p of input.payments) {
    if (!isPosted(p.status) || !inPeriod(p.pay_date)) continue;
    pending.push({
      kind: "payment",
      id: p.id,
      date: p.pay_date,
      doc_no: p.doc_no,
      doc_type: null,
      method: p.method,
      description: paymentDescription(p, partyType),
      charge: null,
      payment: Math.abs(Number(p.amount) || 0),
    });
  }

  pending.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "document" ? -1 : 1;
    return (a.doc_no ?? "").localeCompare(b.doc_no ?? "");
  });

  let balance = opening;
  let documentsTotal = 0;
  let paymentsTotal = 0;
  const rows: StatementRow[] = pending.map((r) => {
    if (r.charge !== null) {
      documentsTotal += r.charge;
      balance += r.charge;
    }
    if (r.payment !== null) {
      paymentsTotal += r.payment;
      balance -= r.payment;
    }
    balance = roundCents(balance);
    return { ...r, balance };
  });

  documentsTotal = roundCents(documentsTotal);
  paymentsTotal = roundCents(paymentsTotal);
  return {
    from,
    to,
    opening,
    documentsTotal,
    paymentsTotal,
    closing: roundCents(opening + documentsTotal - paymentsTotal),
    rows,
  };
}

// ── 期間 / 對象參數 ───────────────────────────────────────────

const TPE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 台北時區今天（YYYY-MM-DD）。 */
export function taipeiToday(now: Date = new Date()): string {
  return TPE_DATE.format(now);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 是否為合法西元日期字串 YYYY-MM-DD（含月份天數檢查）。 */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** 預設期間：today 所在月份的上一個月 1 日～月底。 */
export function previousMonthRange(today: string): {
  from: string;
  to: string;
} {
  const m = ISO_DATE.exec(today);
  if (!m) throw new Error(`日期格式錯誤：${today}`);
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const mm = String(mo).padStart(2, "0");
  const yy = String(y).padStart(4, "0");
  return { from: `${yy}-${mm}-01`, to: `${yy}-${mm}-${String(last)}` };
}

export interface StatementParty {
  type: PartyType;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 解析 `customer:<uuid>` / `vendor:<uuid>`；不合法回 null。 */
export function parseStatementParty(
  v: string | null | undefined,
): StatementParty | null {
  if (!v) return null;
  const i = v.indexOf(":");
  if (i < 0) return null;
  const type = v.slice(0, i);
  const id = v.slice(i + 1);
  if ((type !== "customer" && type !== "vendor") || !UUID.test(id)) {
    return null;
  }
  return { type, id };
}

export function formatStatementParty(p: StatementParty): string {
  return `${p.type}:${p.id}`;
}

/** 對帳單列印頁網址（頁面由 #178 實作）。 */
export function statementPrintHref(
  party: StatementParty,
  from: string,
  to: string,
): string {
  const qs = new URLSearchParams({
    party: formatStatementParty(party),
    from,
    to,
  });
  return `/admin/erp/print/statement?${qs.toString()}`;
}
