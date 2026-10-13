// 收付款表單的純計算（client / server / 測試共用）：沖銷預設值、剩餘預收付、表單驗證。
// 驗證有 collect*（一次列出所有錯誤，表單用）與 validate*（第一條，server action 用）兩種。
// DB 端 erp_allocate_payment 仍會以同樣規則把關（over_allocation），這裡只是即時提示與提早擋下。
//
// 沖銷規則（#249，與 0029 migration 相同）：
//   R1 每列與未沖餘額同號、不超過其絕對值；
//   R2 沖銷合計 ≤ 可沖額度（新增 = 金額；補沖銷 = 目前預收／預付餘額）——退貨單的負數會增加額度；
//   R3 沖銷合計為負（退貨貸項轉為預收／預付）時，須先沖清所有未結的正數單據，不可憑空產生預收；
//   R4 金額 0 = 沖抵單：至少要勾一張退貨單（負數），方式一律存「其他」、不帶票號銀行。
import type {
  CheckStatus,
  PaymentAllocationInput,
  PaymentDirection,
  PaymentMethod,
} from "@/lib/erp/types";
import { roundCents } from "@/lib/erp/statement";
import { mergeErrors } from "@/lib/erp/validate";

/** 金額取到分（= statement.roundCents）。 */
export const roundAmount = roundCents;

/** 可沖銷單據（erp_document_balances 的一列；SR / PR 的 outstanding 為負）。 */
export interface OutstandingDoc {
  document_id: string;
  doc_type: string;
  doc_no: string;
  doc_date: string;
  total_twd: number;
  allocated: number;
  outstanding: number;
}

/** 表單上一列沖銷的狀態。 */
export interface AllocationRow {
  document_id: string;
  selected: boolean;
  amount: number;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "transfer",
  "check",
  "other",
];

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  pending: "未兌現",
  cleared: "已兌現",
  bounced: "退票",
};

/** server action 送不出去（斷網、server 失敗）時顯示的提示；表單輸入保留不動。 */
export const NETWORK_ERROR = "連線失敗，請稍後再試";

export const DIRECTION_META: Record<
  PaymentDirection,
  {
    label: string;
    partyLabel: string;
    basePath: string;
    unallocatedLabel: string;
    docTypes: readonly string[];
    /** 正數單據（銷貨／進貨）。 */
    debitLabel: string;
    /** 退貨單（銷退／進退，負數）。 */
    creditLabel: string;
    /** 退款單名稱（#249）：客戶退款（RF）／廠商退款（VR）。 */
    refundLabel: string;
    /** 列表頁的退款入口文字。 */
    refundAction: string;
    refundPath: string;
  }
> = {
  in: {
    label: "收款",
    partyLabel: "客戶",
    basePath: "/admin/erp/collections",
    unallocatedLabel: "預收",
    docTypes: ["S", "SR"],
    debitLabel: "銷貨",
    creditLabel: "銷退",
    refundLabel: "客戶退款",
    refundAction: "退款給客戶",
    refundPath: "/admin/erp/collections/refunds/new",
  },
  out: {
    label: "付款",
    partyLabel: "廠商",
    basePath: "/admin/erp/disbursements",
    unallocatedLabel: "預付",
    docTypes: ["I", "PR"],
    debitLabel: "進貨",
    creditLabel: "進退",
    refundLabel: "廠商退款",
    refundAction: "廠商退款",
    refundPath: "/admin/erp/disbursements/refunds/new",
  },
};

/** 金額為 0 的收付款 = 沖抵單（#249）：只以退貨單沖抵單據，不收付現金。 */
export function isOffsetAmount(amount: number): boolean {
  return roundCents(Number(amount) || 0) === 0;
}

/**
 * 詳情頁是否顯示「補沖銷」（#241 A-8）：已過帳且未沖銷餘額（預收／預付，取到分）> 0。
 * 餘額為 0 時沒有可沖的金額，區塊與確認鈕一併隱藏。
 */
export function canAllocateMore(payment: {
  status: string;
  unallocated: number;
}): boolean {
  return (
    payment.status === "posted" && roundCents(Number(payment.unallocated)) > 0
  );
}

/** 已勾選沖銷的合計。 */
export function allocatedTotal(rows: AllocationRow[]): number {
  return roundCents(
    rows.reduce((s, r) => s + (r.selected ? Number(r.amount) || 0 : 0), 0),
  );
}

/** 收付款金額扣掉沖銷後的剩餘（成為預收 / 預付）。 */
export function remainingAmount(amount: number, rows: AllocationRow[]): number {
  return roundCents((Number(amount) || 0) - allocatedTotal(rows));
}

/**
 * 依勾選狀態重新計算全部已勾選列的預設沖銷金額（#249：結果與勾選順序無關）。
 * 1. 已勾選的退貨單（未沖餘額為負）整張沖銷，其貸項加入可沖額度；
 * 2. 再依 docs 的順序（日期舊 → 新）分配給已勾選的一般單據：min(未沖餘額, 剩餘額度)，額度不足為 0。
 * 未勾選列金額為 0。回傳與 docs 同順序的完整列（勾選或取消時呼叫；手動改過的金額會重設為預設值）。
 */
export function distributeAllocations(
  docs: OutstandingDoc[],
  rows: AllocationRow[],
  capacity: number,
): AllocationRow[] {
  const selected = new Set(
    rows.filter((r) => r.selected).map((r) => r.document_id),
  );
  const amounts = new Map<string, number>();
  let pool = roundCents(Number(capacity) || 0);
  for (const d of docs) {
    if (!selected.has(d.document_id) || !(d.outstanding < 0)) continue;
    const amt = roundCents(d.outstanding);
    amounts.set(d.document_id, amt);
    pool = roundCents(pool - amt);
  }
  for (const d of docs) {
    if (!selected.has(d.document_id) || d.outstanding < 0) continue;
    const amt = defaultAllocation(d.outstanding, pool);
    amounts.set(d.document_id, amt);
    pool = roundCents(pool - amt);
  }
  return docs.map((d) => ({
    document_id: d.document_id,
    selected: selected.has(d.document_id),
    amount: amounts.get(d.document_id) ?? 0,
  }));
}

/**
 * 勾選一張單據時的預設沖銷金額：
 * - 一般單據（outstanding > 0）：min(outstanding, 剩餘)，剩餘 ≤ 0 時為 0；
 * - 退貨單（outstanding < 0）：整張沖銷（負數會增加可沖額度）。
 */
export function defaultAllocation(
  outstanding: number,
  remaining: number,
): number {
  if (outstanding < 0) return roundCents(outstanding);
  return roundCents(Math.max(0, Math.min(outstanding, remaining)));
}

/** 單據沖銷後的未沖餘額。 */
export function outstandingAfter(outstanding: number, amount: number): number {
  return roundCents(outstanding - amount);
}

/**
 * 驗證沖銷明細（規則同 DB 0029 erp_allocate_payment，見檔頭 R1–R3）：
 * 每列金額非 0、與未沖餘額同號且不超過其絕對值；合計 ≤ capacity；
 * 合計為負（退貨貸項轉預收／預付）時，docs 中的一般單據須全數沖清。
 * capacity = 新增時為收付款金額、補沖銷時為目前未沖銷餘額；docs 須為該對象全部未沖銷單據。
 * 回傳全部錯誤（逐列 → 合計，#240 B-08a）；通過回空陣列。
 */
export function collectAllocationErrors(
  capacity: number,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
  direction: PaymentDirection = "in",
): string[] {
  const errors: string[] = [];
  const byId = new Map(docs.map((d) => [d.document_id, d]));
  for (const r of rows) {
    if (!r.selected) continue;
    const doc = byId.get(r.document_id);
    if (!doc) {
      errors.push("沖銷單據已不在未沖銷清單，請重新整理。");
      continue;
    }
    const amt = Number(r.amount) || 0;
    if (amt === 0) {
      errors.push(`單據 ${doc.doc_no} 的沖銷金額不可為 0。`);
    } else if (doc.outstanding > 0 && (amt < 0 || amt > doc.outstanding)) {
      errors.push(
        `單據 ${doc.doc_no} 沖銷金額需介於 0 與未沖餘額 ${doc.outstanding} 之間。`,
      );
    } else if (doc.outstanding < 0 && (amt > 0 || amt < doc.outstanding)) {
      errors.push(
        `退貨單 ${doc.doc_no} 沖銷金額需介於 ${doc.outstanding} 與 0 之間。`,
      );
    } else if (doc.outstanding === 0) {
      errors.push(`單據 ${doc.doc_no} 已沖清。`);
    }
  }
  const total = allocatedTotal(rows);
  if (total > roundCents(capacity)) {
    errors.push(`沖銷合計 ${total} 超過可沖銷金額 ${roundCents(capacity)}。`);
  }
  if (total < 0) {
    const meta = DIRECTION_META[direction] ?? DIRECTION_META.in;
    const amountOf = new Map(
      rows.filter((r) => r.selected).map((r) => [r.document_id, r.amount]),
    );
    const open = docs.filter(
      (d) =>
        d.outstanding > 0 &&
        outstandingAfter(
          d.outstanding,
          Number(amountOf.get(d.document_id)) || 0,
        ) > 0,
    );
    if (open.length > 0) {
      errors.push(
        `沖銷合計為 ${total}：${meta.creditLabel}貸項要轉為${meta.unallocatedLabel}，須先沖清所有未結${meta.debitLabel}單（尚未沖清：${open.map((d) => d.doc_no).join("、")}）。`,
      );
    }
  }
  return mergeErrors(errors);
}

/** 同 collectAllocationErrors，只回第一條；通過回 null。 */
export function validateAllocations(
  capacity: number,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
  direction: PaymentDirection = "in",
): string | null {
  return collectAllocationErrors(capacity, rows, docs, direction)[0] ?? null;
}

/** 已勾選列 → RPC allocations。 */
export function toAllocationInputs(
  rows: AllocationRow[],
): PaymentAllocationInput[] {
  return rows
    .filter((r) => r.selected && (Number(r.amount) || 0) !== 0)
    .map((r) => ({ document_id: r.document_id, amount: roundCents(r.amount) }));
}

/** 新增收付款表單的輸入。 */
export interface PaymentFormInput {
  direction: PaymentDirection;
  pay_date: string;
  party_id: string | null;
  method: PaymentMethod;
  amount: number;
  check_no?: string | null;
  check_due_date?: string | null;
  bank?: string | null;
  note?: string | null;
  allocations: PaymentAllocationInput[];
}

/**
 * 沖抵單（金額 0）不收付現金：方式一律「其他」、不帶票號／票期／銀行（DB 亦同樣正規化）。
 * 其他金額原樣回傳。
 */
export function normalizePaymentInput(
  input: PaymentFormInput,
): PaymentFormInput {
  if (!isOffsetAmount(input.amount) || !(Number(input.amount) >= 0)) {
    return input;
  }
  return {
    ...input,
    amount: 0,
    method: "other",
    check_no: null,
    check_due_date: null,
    bank: null,
  };
}

/** 表頭欄位的錯誤（對象、日期、方式、金額、支票欄位）；沖抵單不檢查方式與支票欄位。 */
function paymentHeaderErrors(input: PaymentFormInput): string[] {
  const meta = DIRECTION_META[input.direction];
  if (!meta) return ["收付款方向不正確。"];
  const errors: string[] = [];
  if (!input.party_id) errors.push(`請選擇${meta.partyLabel}。`);
  if (!input.pay_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.pay_date)) {
    errors.push(`請填寫${meta.label}日期。`);
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    errors.push("金額不可為負數。");
  } else if (isOffsetAmount(amount)) {
    return errors;
  }
  if (!PAYMENT_METHODS.includes(input.method)) errors.push("請選擇付款方式。");
  if (input.method === "check") {
    if (!input.check_no?.trim()) errors.push("支票需填寫票號。");
    if (!input.check_due_date) errors.push("支票需填寫到期日（票期）。");
    if (!input.bank?.trim()) errors.push("支票需填寫銀行。");
  }
  return errors;
}

/** R4：沖抵單（金額 0）至少要沖一張退貨單（負數沖銷）。 */
function offsetErrors(input: PaymentFormInput): string[] {
  const meta = DIRECTION_META[input.direction];
  if (!meta || !isOffsetAmount(input.amount)) return [];
  return input.allocations.some((a) => Number(a.amount) < 0)
    ? []
    : [`金額 0 為沖抵單，需至少勾選一張${meta.creditLabel}單。`];
}

/**
 * 新增收付款的輸入檢核（表頭 + RPC allocations），一次列出所有錯誤（#240 B-08a）；通過回空陣列。
 * server action 以 validatePaymentForm（第一條）把關。合計為負時能否轉預收（R3）需要該對象全部單據，
 * 由表單（collectPaymentSubmitErrors）與 DB 檢查。
 */
export function collectPaymentFormErrors(input: PaymentFormInput): string[] {
  const errors = paymentHeaderErrors(input);
  const meta = DIRECTION_META[input.direction];
  if (!meta) return errors;
  errors.push(...offsetErrors(input));
  if (
    input.allocations.some((a) => !a.document_id || !(Number(a.amount) !== 0))
  ) {
    errors.push("沖銷明細需指定單據與非 0 金額。");
  }
  const total = roundCents(
    input.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  // 金額為負時表頭已報錯，不再重複報超沖
  if (Number(input.amount) >= 0 && total > roundCents(input.amount)) {
    errors.push(
      `沖銷合計 ${total} 超過${meta.label}金額 ${roundCents(input.amount)}。`,
    );
  }
  return mergeErrors(errors);
}

/** 表頭驗證（含沖銷明細合計）；回第一條錯誤，通過回 null。 */
export function validatePaymentForm(input: PaymentFormInput): string | null {
  return collectPaymentFormErrors(input)[0] ?? null;
}

/**
 * 新增收付款表單送出前的檢核：表頭錯誤 + 逐列沖銷錯誤（以收付款金額為可沖額度），一次列出。
 * 沖銷合計只由 collectAllocationErrors 報一次（不與表頭的合計檢查重複）。
 */
export function collectPaymentSubmitErrors(
  input: PaymentFormInput,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
): string[] {
  return mergeErrors(
    paymentHeaderErrors(input),
    offsetErrors(input),
    collectAllocationErrors(
      Math.max(0, Number(input.amount) || 0),
      rows,
      docs,
      input.direction,
    ),
  );
}
