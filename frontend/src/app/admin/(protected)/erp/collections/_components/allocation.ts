// 收付款表單的純計算（client / server / 測試共用）：沖銷預設值、剩餘預收付、表單驗證。
// DB 端 erp_allocate_payment 仍會以同樣規則把關（over_allocation），這裡只是即時提示與提早擋下。
import type {
  CheckStatus,
  PaymentAllocationInput,
  PaymentDirection,
  PaymentMethod,
} from "@/lib/erp/types";
import { roundCents } from "@/lib/erp/statement";

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
 * 通過回 null，否則回中文訊息。
 */
export function validateAllocations(
  capacity: number,
  rows: AllocationRow[],
  docs: OutstandingDoc[],
): string | null {
  const byId = new Map(docs.map((d) => [d.document_id, d]));
  for (const r of rows) {
    if (!r.selected) continue;
    const doc = byId.get(r.document_id);
    if (!doc) return "沖銷單據已不在未沖銷清單，請重新整理。";
    const amt = Number(r.amount) || 0;
    if (amt === 0) return `單據 ${doc.doc_no} 的沖銷金額不可為 0。`;
    if (doc.outstanding > 0 && (amt < 0 || amt > doc.outstanding)) {
      return `單據 ${doc.doc_no} 沖銷金額需介於 0 與未沖餘額 ${doc.outstanding} 之間。`;
    }
    if (doc.outstanding < 0 && (amt > 0 || amt < doc.outstanding)) {
      return `退貨單 ${doc.doc_no} 沖銷金額需介於 ${doc.outstanding} 與 0 之間。`;
    }
    if (doc.outstanding === 0) return `單據 ${doc.doc_no} 已沖清。`;
  }
  const total = allocatedTotal(rows);
  if (total < 0) return "沖銷合計不可為負數。";
  if (total > roundCents(capacity)) {
    return `沖銷合計 ${total} 超過可沖銷金額 ${roundCents(capacity)}。`;
  }
  return null;
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

/** 表頭驗證（不含沖銷明細）；通過回 null。 */
export function validatePaymentForm(input: PaymentFormInput): string | null {
  const meta = DIRECTION_META[input.direction];
  if (!meta) return "收付款方向不正確。";
  if (!input.party_id) return `請選擇${meta.partyLabel}。`;
  if (!input.pay_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.pay_date)) {
    return `請填寫${meta.label}日期。`;
  }
  if (!PAYMENT_METHODS.includes(input.method)) return "請選擇付款方式。";
  if (!(Number(input.amount) > 0)) return "金額需大於 0。";
  if (input.method === "check") {
    if (!input.check_no?.trim()) return "支票需填寫票號。";
    if (!input.check_due_date) return "支票需填寫票期。";
    if (!input.bank?.trim()) return "支票需填寫銀行。";
  }
  for (const a of input.allocations) {
    if (!a.document_id || !(Number(a.amount) !== 0)) {
      return "沖銷明細需指定單據與非 0 金額。";
    }
  }
  const total = roundCents(
    input.allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  if (total < 0) return "沖銷合計不可為負數。";
  if (total > roundCents(input.amount)) {
    return `沖銷合計 ${total} 超過${meta.label}金額 ${roundCents(input.amount)}。`;
  }
  return null;
}
