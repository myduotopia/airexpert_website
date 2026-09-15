// ERP RPC 錯誤碼 → 中文訊息（spec §9）。純函式。
// RPC 以 raise exception '<code>' using errcode='P0001', detail='<中文訊息>' 丟出，
// supabase-js 對應為 error.message = code、error.details = 中文訊息。

export type ErpErrorCode =
  | "forbidden"
  | "not_draft"
  | "not_posted"
  | "validation"
  | "insufficient_stock"
  | "serial_unavailable"
  | "over_receipt"
  | "has_dependents"
  | "over_allocation";

/** server action 無 erp 授權時的訊息。 */
export const ERP_FORBIDDEN_MESSAGE = "沒有 ERP 權限";

export const ERP_ERROR_MESSAGES: Record<ErpErrorCode, string> = {
  forbidden: ERP_FORBIDDEN_MESSAGE,
  not_draft: "此單據已不是草稿，無法修改或過帳。",
  not_posted: "此單據尚未過帳或已作廢，無法作廢。",
  validation: "資料驗證未通過，請檢查必填欄位與明細。",
  insufficient_stock: "庫存不足，無法出庫。",
  serial_unavailable: "所選機號目前不可使用（狀態或倉庫不符）。",
  over_receipt: "進貨數量超過採購單未到貨數量。",
  has_dependents: "此單據已被其他單據或收付款引用，請先作廢相關單據。",
  over_allocation: "沖銷金額超過可沖銷餘額。",
};

export function isErpErrorCode(code: unknown): code is ErpErrorCode {
  return typeof code === "string" && Object.hasOwn(ERP_ERROR_MESSAGES, code);
}

/**
 * 將 supabase / RPC 錯誤轉為給使用者看的中文訊息：
 * 1. 有 details（RPC 帶的人讀訊息）→ 直接使用；
 * 2. message 為已知錯誤碼 → 對應中文；
 * 3. 其他（DB / 網路錯誤）→「操作失敗：<原始訊息>」。
 */
export function erpErrorMessage(
  err: { message?: string | null; details?: string | null } | null | undefined,
): string {
  const details = err?.details?.trim();
  if (details) return details;
  const message = err?.message?.trim();
  if (isErpErrorCode(message)) return ERP_ERROR_MESSAGES[message];
  if (message) return `操作失敗：${message}`;
  return "操作失敗，請稍後再試。";
}
