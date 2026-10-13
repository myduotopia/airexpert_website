// 退款單（#249）純函式：表單檢核與確認框內容（client / server / 測試共用）。
// 退款給客戶（RF，direction = in）：從客戶預收付出；廠商退款（VR，direction = out）：廠商退還預付。
// DB 端 erp_post_refund 依日期先後扣減預收（預付）來源，並再檢查一次金額不超過餘額（over_allocation）。
import { rocDate } from "@/lib/admin/minguo";
import { PAYMENT_METHOD_LABEL, roundCents } from "@/lib/erp/statement";
import type { PaymentDirection, PaymentMethod } from "@/lib/erp/types";
import { mergeErrors } from "@/lib/erp/validate";
import { DIRECTION_META } from "./allocation";
import { confirmMoney, wanHint } from "./payment-confirm";

/** 退款方式：匯款、現金、支票。 */
export const REFUND_METHODS: PaymentMethod[] = ["transfer", "cash", "check"];

export interface RefundFormInput {
  direction: PaymentDirection;
  pay_date: string;
  party_id: string | null;
  method: PaymentMethod;
  amount: number;
  check_no?: string | null;
  check_due_date?: string | null;
  bank?: string | null;
  note?: string | null;
}

/** 退款金額的動作字：退款給客戶是「付出」，廠商退款是「收回」。 */
export function refundVerb(direction: PaymentDirection): string {
  return direction === "in" ? "退款" : "收回";
}

/**
 * 退款表單檢核，一次列出所有錯誤；通過回空陣列。
 * prepaid = 該對象目前的預收（預付）餘額；未知（server action）時傳 null，由 DB 把關。
 */
export function collectRefundErrors(
  input: RefundFormInput,
  prepaid: number | null,
): string[] {
  const meta = DIRECTION_META[input.direction];
  if (!meta) return ["退款方向不正確。"];
  const errors: string[] = [];
  if (!input.party_id) errors.push(`請選擇${meta.partyLabel}。`);
  if (!input.pay_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.pay_date)) {
    errors.push("請填寫退款日期。");
  }
  if (!REFUND_METHODS.includes(input.method)) {
    errors.push("退款方式需為匯款、現金或支票。");
  }
  const amount = roundCents(Number(input.amount) || 0);
  if (!(amount > 0)) errors.push("退款金額需大於 0。");
  if (input.method === "check") {
    if (!input.check_no?.trim()) errors.push("支票需填寫票號。");
    if (!input.check_due_date) errors.push("支票需填寫到期日（票期）。");
    if (!input.bank?.trim()) errors.push("支票需填寫銀行。");
  }
  if (prepaid !== null && amount > 0) {
    const cap = roundCents(prepaid);
    if (cap <= 0) {
      errors.push(
        `此${meta.partyLabel}沒有${meta.unallocatedLabel}餘額可退款；${meta.creditLabel}的負數餘額請先以 0 元沖抵單轉為${meta.unallocatedLabel}。`,
      );
    } else if (amount > cap) {
      errors.push(
        `退款金額 ${amount} 超過${meta.unallocatedLabel}餘額 ${cap}。`,
      );
    }
  }
  return mergeErrors(errors);
}

/** 同 collectRefundErrors（不檢查餘額），回第一條；通過回 null。server action 用。 */
export function validateRefundForm(input: RefundFormInput): string | null {
  return collectRefundErrors(input, null)[0] ?? null;
}

export interface RefundConfirmInput {
  direction: PaymentDirection;
  partyLabel: string | null;
  payDate: string;
  amount: number;
  method: PaymentMethod;
  checkNo: string;
  checkDueDate: string;
  bank: string;
  /** 退款前的預收（預付）餘額。 */
  prepaid: number;
}

export interface RefundConfirmSummary {
  title: string;
  confirmLabel: string;
  amountLabel: string;
  amountText: string;
  amountHint: string | null;
  details: { label: string; value: string }[];
  /** 「預收」／「預付」。 */
  prepaidLabel: string;
  prepaidBeforeText: string;
  prepaidAfterText: string;
}

export function refundConfirmSummary(
  input: RefundConfirmInput,
): RefundConfirmSummary {
  const meta = DIRECTION_META[input.direction];
  const details: { label: string; value: string }[] = [
    { label: meta.partyLabel, value: input.partyLabel?.trim() || "—" },
    { label: "退款日期", value: rocDate(input.payDate) },
    {
      label: "方式",
      value: PAYMENT_METHOD_LABEL[input.method] ?? input.method,
    },
  ];
  if (input.bank.trim()) {
    details.push({ label: "銀行", value: input.bank.trim() });
  }
  if (input.method === "check") {
    details.push({ label: "票號", value: input.checkNo.trim() || "—" });
    details.push({ label: "到期日", value: rocDate(input.checkDueDate) });
  }
  return {
    title: `確定過帳此${meta.refundLabel}？`,
    confirmLabel: `過帳${meta.refundLabel}`,
    amountLabel: `${refundVerb(input.direction)}金額（TWD）`,
    amountText: confirmMoney(input.amount),
    amountHint: wanHint(input.amount),
    details,
    prepaidLabel: meta.unallocatedLabel,
    prepaidBeforeText: confirmMoney(input.prepaid),
    prepaidAfterText: confirmMoney(
      roundCents((Number(input.prepaid) || 0) - (Number(input.amount) || 0)),
    ),
  };
}
