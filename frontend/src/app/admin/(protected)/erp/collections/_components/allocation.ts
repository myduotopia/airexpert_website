// 收付款表單的純計算（client / server / 測試共用）：沖銷預設值、剩餘預收付、表單驗證。
// 驗證有 collect*（一次列出所有錯誤，表單用）與 validate*（第一條，server action 用）兩種。
// DB 端 erp_allocate_payment 仍會以同樣規則把關（over_allocation），這裡只是即時提示與提早擋下。
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
  }
> = {
  in: {
    label: "收款",
    partyLabel: "客戶",
    basePath: "/admin/erp/collections",
    unallocatedLabel: "預收",
    docTypes: ["S", "SR"],
  },
  out: {
    label: "付款",
    partyLabel: "廠商",
    basePath: "/admin/erp/disbursements",
    unallocatedLabel: "預付",
    docTypes: ["I", "PR"],
  },
};

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
 * 驗證沖銷明細（規則同 DB §5.4／決策 14）：
 * 每列金額非 0、與未沖餘額同號且不超過其絕對值；合計介於 0 與 capacity 之間。
 * capacity = 新增時為收付款金額、補沖銷時為目前未沖銷餘額。
 * 回傳全部錯誤（逐列 → 合計，#240 B-08a）；通過回空陣列。
 */
export function collectAllocationErrors(
  capacity: number,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
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
  if (total < 0) errors.push("沖銷合計不可為負數。");
  if (total > roundCents(capacity)) {
    errors.push(`沖銷合計 ${total} 超過可沖銷金額 ${roundCents(capacity)}。`);
  }
  return mergeErrors(errors);
}

/** 同 collectAllocationErrors，只回第一條；通過回 null。 */
export function validateAllocations(
  capacity: number,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
): string | null {
  return collectAllocationErrors(capacity, rows, docs)[0] ?? null;
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

/** 表頭欄位的錯誤（對象、日期、方式、金額、支票欄位）。 */
function paymentHeaderErrors(input: PaymentFormInput): string[] {
  const meta = DIRECTION_META[input.direction];
  if (!meta) return ["收付款方向不正確。"];
  const errors: string[] = [];
  if (!input.party_id) errors.push(`請選擇${meta.partyLabel}。`);
  if (!input.pay_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.pay_date)) {
    errors.push(`請填寫${meta.label}日期。`);
  }
  if (!PAYMENT_METHODS.includes(input.method)) errors.push("請選擇付款方式。");
  if (!(Number(input.amount) > 0)) errors.push("金額需大於 0。");
  if (input.method === "check") {
    if (!input.check_no?.trim()) errors.push("支票需填寫票號。");
    if (!input.check_due_date) errors.push("支票需填寫到期日（票期）。");
    if (!input.bank?.trim()) errors.push("支票需填寫銀行。");
  }
  return errors;
}

/**
 * 新增收付款的輸入檢核（表頭 + RPC allocations），一次列出所有錯誤（#240 B-08a）；通過回空陣列。
 * server action 以 validatePaymentForm（第一條）把關。
 */
export function collectPaymentFormErrors(input: PaymentFormInput): string[] {
  const errors = paymentHeaderErrors(input);
  const meta = DIRECTION_META[input.direction];
  if (!meta) return errors;
  if (
    input.allocations.some((a) => !a.document_id || !(Number(a.amount) !== 0))
  ) {
    errors.push("沖銷明細需指定單據與非 0 金額。");
  }
  const total = roundCents(
    input.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  if (total < 0) errors.push("沖銷合計不可為負數。");
  if (total > roundCents(input.amount)) {
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
    collectAllocationErrors(input.amount, rows, docs),
  );
}
