"use server";

// 收款（collections）/ 付款（disbursements）共用 server actions。
// 每個 action 開頭 ensureErp（layout 不保護 server action），寫入走 lib/erp/rpc.ts；
// 回傳 { ok, error }，不 throw（沿用保養卡 #171 模式）。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "@/lib/erp/errors";
import { ensureErp } from "@/lib/erp/guard";
import { listOutstandingDocuments } from "@/lib/erp/queries/ar-ap";
import { allocatePayment, postPayment, voidPayment } from "@/lib/erp/rpc";
import type {
  CheckStatus,
  ErpDocumentBalance,
  ErpResult,
  PaymentAllocationInput,
  PaymentDirection,
  PostPaymentResult,
} from "@/lib/erp/types";
import {
  DIRECTION_META,
  validatePaymentForm,
  type PaymentFormInput,
} from "./allocation";

function isDirection(v: unknown): v is PaymentDirection {
  return v === "in" || v === "out";
}

function revalidatePayments(direction: PaymentDirection, id?: string) {
  const base = DIRECTION_META[direction].basePath;
  revalidatePath(base);
  if (id) revalidatePath(`${base}/${id}`);
  revalidatePath("/admin/erp/statements");
  revalidatePath("/admin/erp");
}

/** 新增收款 / 付款（含沖銷）。 */
export async function createPaymentAction(
  input: PaymentFormInput,
): Promise<ErpResult<PostPaymentResult>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!input || !isDirection(input.direction)) {
    return { ok: false, error: "收付款方向不正確。" };
  }
  const invalid = validatePaymentForm(input);
  if (invalid) return { ok: false, error: invalid };

  const isCheck = input.method === "check";
  const res = await postPayment({
    direction: input.direction,
    pay_date: input.pay_date,
    customer_id: input.direction === "in" ? input.party_id : null,
    vendor_id: input.direction === "out" ? input.party_id : null,
    method: input.method,
    amount: Number(input.amount),
    check_no: isCheck ? input.check_no?.trim() || null : null,
    check_due_date: isCheck ? input.check_due_date || null : null,
    bank: input.bank?.trim() || null,
    check_status: isCheck ? "pending" : null,
    note: input.note?.trim() || null,
    allocations: input.allocations,
  });
  if (!res.ok) return res;
  revalidatePayments(input.direction, res.data?.id);
  return res;
}

/** 讀取對象的未沖銷單據（新增表單選完客戶 / 廠商後呼叫）。 */
export async function loadOutstandingAction(
  direction: PaymentDirection,
  partyId: string,
): Promise<ErpResult<ErpDocumentBalance[]>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isDirection(direction)) {
    return { ok: false, error: "收付款方向不正確。" };
  }
  return listOutstandingDocuments(direction, partyId);
}

/** 對既有收付款補沖銷。 */
export async function allocatePaymentAction(
  paymentId: string,
  direction: PaymentDirection,
  allocations: PaymentAllocationInput[],
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isDirection(direction)) {
    return { ok: false, error: "收付款方向不正確。" };
  }
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { ok: false, error: "請勾選要沖銷的單據。" };
  }
  const res = await allocatePayment(paymentId, allocations);
  if (res.ok) revalidatePayments(direction, paymentId);
  return res;
}

const CHECK_STATUSES: CheckStatus[] = ["pending", "cleared", "bounced"];

/** 更新支票狀態（未兌現 / 已兌現 / 退票）。退票不自動沖回，由使用者自行作廢。 */
export async function updateCheckStatusAction(
  paymentId: string,
  direction: PaymentDirection,
  status: CheckStatus,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isDirection(direction)) {
    return { ok: false, error: "收付款方向不正確。" };
  }
  if (!CHECK_STATUSES.includes(status)) {
    return { ok: false, error: "支票狀態不正確。" };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_payments")
    .update({ check_status: status })
    .eq("id", paymentId)
    .eq("direction", direction)
    .eq("method", "check")
    .eq("status", "posted")
    .select("id");
  if (error) return { ok: false, error: erpErrorMessage(error) };
  if (!data || data.length === 0) {
    return { ok: false, error: "找不到可更新的支票（可能已作廢）。" };
  }
  revalidatePayments(direction, paymentId);
  return { ok: true, data: null };
}

/** 作廢收付款（原因必填；沖銷一併刪除）。 */
export async function voidPaymentAction(
  paymentId: string,
  direction: PaymentDirection,
  reason: string,
): Promise<ErpResult<null>> {
  const denied = await ensureErp();
  if (denied) return denied;
  if (!isDirection(direction)) {
    return { ok: false, error: "收付款方向不正確。" };
  }
  const res = await voidPayment(paymentId, reason);
  if (res.ok) revalidatePayments(direction, paymentId);
  return res;
}
