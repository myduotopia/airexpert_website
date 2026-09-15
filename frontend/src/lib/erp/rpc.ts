// ERP 過帳 / 作廢 / 收付款 RPC 的型別包裝 — SERVER ONLY。
// 會動庫存或金額的操作一律走 RPC（單一交易，spec §2）；RPC 為 security invoker，
// 以登入者 session 呼叫（RLS 仍生效）。錯誤經 erpErrorMessage 轉中文，不 throw。
// 每個 wrapper 開頭都先檢查 erp 授權（DB 端 has_module 仍會再擋一次）。
// revalidatePath 由呼叫端的 server action 負責（依頁面而異）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "./errors";
import { ensureErp } from "./guard";
import type {
  ErpResult,
  PaymentAllocationInput,
  PaymentPayload,
  PostDocumentResult,
  PostPaymentResult,
  VoidDocumentResult,
} from "./types";

async function callRpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<ErpResult<T>> {
  const denied = await ensureErp();
  if (denied) return denied;
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: erpErrorMessage(error) };
  return { ok: true, data: data as T };
}

function requireReason(reason: string): string | null {
  return reason?.trim() ? null : "請填寫作廢原因。";
}

/** 過帳單據（erp_post_document）：取號、動庫存 / 成本 / 序號，S 單建立保養卡機台。 */
export async function postDocument(
  docId: string,
): Promise<ErpResult<PostDocumentResult>> {
  const res = await callRpc<PostDocumentResult>("erp_post_document", {
    p_doc_id: docId,
  });
  if (!res.ok) return res;
  return {
    ok: true,
    data: {
      doc_no: res.data?.doc_no ?? "",
      warnings: res.data?.warnings ?? [],
      mx_machine_ids: res.data?.mx_machine_ids ?? [],
    },
  };
}

/** 作廢已過帳單據（erp_void_document）；reason 必填。 */
export async function voidDocument(
  docId: string,
  reason: string,
): Promise<ErpResult<VoidDocumentResult>> {
  const bad = requireReason(reason);
  if (bad) return { ok: false, error: bad };
  const res = await callRpc<VoidDocumentResult>("erp_void_document", {
    p_doc_id: docId,
    p_reason: reason.trim(),
  });
  if (!res.ok) return res;
  return { ok: true, data: { warnings: res.data?.warnings ?? [] } };
}

/** 建立收款 / 付款並沖銷（erp_post_payment）。 */
export async function postPayment(
  payload: PaymentPayload,
): Promise<ErpResult<PostPaymentResult>> {
  if (!(Number(payload.amount) > 0)) {
    return { ok: false, error: "金額需大於 0。" };
  }
  if (
    payload.method === "check" &&
    (!payload.check_no?.trim() || !payload.check_due_date)
  ) {
    return { ok: false, error: "支票需填寫票號與票期。" };
  }
  return callRpc<PostPaymentResult>("erp_post_payment", {
    p_payment: { ...payload, allocations: payload.allocations ?? [] },
  });
}

/** 對既有收付款補沖銷（erp_allocate_payment）。 */
export async function allocatePayment(
  paymentId: string,
  allocations: PaymentAllocationInput[],
): Promise<ErpResult<null>> {
  const res = await callRpc<unknown>("erp_allocate_payment", {
    p_payment_id: paymentId,
    p_allocations: allocations,
  });
  return res.ok ? { ok: true, data: null } : res;
}

/** 作廢收付款（erp_void_payment）；reason 必填。 */
export async function voidPayment(
  paymentId: string,
  reason: string,
): Promise<ErpResult<null>> {
  const bad = requireReason(reason);
  if (bad) return { ok: false, error: bad };
  const res = await callRpc<unknown>("erp_void_payment", {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });
  return res.ok ? { ok: true, data: null } : res;
}
