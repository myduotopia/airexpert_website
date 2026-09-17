// 報告單錯誤訊息（spec §7）— 純函式（client / server 皆可用）。

export const SR_DUPLICATE_NO_MESSAGE = "派工單號已存在";
export const SR_STALE_MESSAGE = "報告單狀態已變更，請重新整理";
export const SR_NOT_FOUND_MESSAGE = "找不到報告單";

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * supabase / RPC 錯誤 → 中文訊息：
 * 1. 23505 unique 衝突（sr_reports_report_no_key）→「派工單號已存在」；
 * 2. 42501 RLS / 權限不足 →「沒有機台維護報告單權限」；
 * 3. 觸發器 / RPC 以 P0001 + detail 丟出的人讀訊息 → 直接使用；
 * 4. 其他 →「操作失敗：<原始訊息>」。
 */
export function srErrorMessage(error: DbError | null | undefined): string {
  if (!error) return "操作失敗";
  if (error.code === "23505") return SR_DUPLICATE_NO_MESSAGE;
  if (error.code === "42501") return "沒有機台維護報告單權限";
  if (error.code === "P0001" && error.details) return error.details;
  return `操作失敗：${error.message ?? "未知錯誤"}`;
}
