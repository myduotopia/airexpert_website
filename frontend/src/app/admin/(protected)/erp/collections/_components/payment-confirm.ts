// 過帳收款／付款確認框的內容（#240、#238 B-07）：純函式，PaymentForm 與測試共用。
// 列出對象、金額（醒目，另以「萬」複述）、方式（支票含票號與到期日）、沖銷筆數與金額、預收／預付餘額，
// 讓數字欄多打一個 0（#238 N-1）時在送出前還有最後一道確認可以攔下。
import { rocDate } from "@/lib/admin/minguo";
import { formatMoney, formatQty } from "@/lib/erp/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type { PaymentDirection, PaymentMethod } from "@/lib/erp/types";
import {
  allocatedTotal,
  DIRECTION_META,
  isOffsetAmount,
  remainingAmount,
  type AllocationRow,
  type OutstandingDoc,
} from "./allocation";

export interface PaymentConfirmInput {
  direction: PaymentDirection;
  /** 對象顯示名稱（編號 + 名稱）；未知時為 null。 */
  partyLabel: string | null;
  payDate: string;
  amount: number;
  method: PaymentMethod;
  checkNo: string;
  checkDueDate: string;
  bank: string;
  rows: AllocationRow[];
  docs: OutstandingDoc[];
}

export interface PaymentConfirmSummary {
  /** 金額 0 的沖抵單（#249）。 */
  offset: boolean;
  title: string;
  /** 確認鈕文字（動作名）：「過帳收款」／「過帳付款」。 */
  confirmLabel: string;
  amountLabel: string;
  amountText: string;
  /** 以「萬」複述的金額（未滿一萬為 null）。 */
  amountHint: string | null;
  details: { label: string; value: string }[];
  allocationCount: number;
  allocationTotalText: string;
  allocations: { docNo: string; amountText: string }[];
  /** 「預收」／「預付」。 */
  remainingLabel: string;
  remainingText: string;
}

/** 金額：整數不帶小數、有角分時顯示 2 位（確認框不可把 1,234.5 顯示成 1,235）。 */
export function confirmMoney(value: number): string {
  const v = Number(value) || 0;
  return formatMoney(v, { decimals: Number.isInteger(v) ? 0 : 2 });
}

/** 以「萬」複述金額：75000 → "7.5 萬"、1234567 → "約 123.46 萬"；未滿一萬回 null。 */
export function wanHint(amount: number): string | null {
  const v = Math.abs(Number(amount) || 0);
  if (v < 10000) return null;
  const wan = v / 10000;
  const rounded = Math.round(wan * 100) / 100;
  const text = `${formatQty(rounded)} 萬`;
  return rounded === wan ? text : `約 ${text}`;
}

export function paymentConfirmSummary(
  input: PaymentConfirmInput,
): PaymentConfirmSummary {
  const meta = DIRECTION_META[input.direction];
  // 沖抵單不收付現金：方式顯示「沖抵」，不列銀行／票號（送出時亦會正規化，見 normalizePaymentInput）。
  const offset = isOffsetAmount(input.amount);
  const details: { label: string; value: string }[] = [
    { label: meta.partyLabel, value: input.partyLabel?.trim() || "—" },
    { label: `${meta.label}日期`, value: rocDate(input.payDate) },
    {
      label: "方式",
      value: offset
        ? `沖抵（以${meta.creditLabel}沖抵，不${input.direction === "in" ? "收" : "付"}款）`
        : (PAYMENT_METHOD_LABEL[input.method] ?? input.method),
    },
  ];
  if (!offset && input.bank.trim()) {
    details.push({ label: "銀行", value: input.bank.trim() });
  }
  if (!offset && input.method === "check") {
    details.push({ label: "票號", value: input.checkNo.trim() || "—" });
    details.push({ label: "到期日", value: rocDate(input.checkDueDate) });
  }

  const docNo = new Map(input.docs.map((d) => [d.document_id, d.doc_no]));
  const selected = input.rows.filter(
    (r) => r.selected && (Number(r.amount) || 0) !== 0,
  );

  return {
    offset,
    title: offset ? "確定過帳此沖抵單？" : `確定過帳此${meta.label}？`,
    confirmLabel: offset ? "過帳沖抵單" : `過帳${meta.label}`,
    amountLabel: offset ? "沖抵單金額（TWD）" : `${meta.label}金額（TWD）`,
    amountText: confirmMoney(input.amount),
    amountHint: wanHint(input.amount),
    details,
    allocationCount: selected.length,
    allocationTotalText: confirmMoney(allocatedTotal(selected)),
    allocations: selected.map((r) => ({
      docNo: docNo.get(r.document_id) ?? "—",
      amountText: confirmMoney(r.amount),
    })),
    remainingLabel: meta.unallocatedLabel,
    remainingText: confirmMoney(remainingAmount(input.amount, selected)),
  };
}
