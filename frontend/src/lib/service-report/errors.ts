// 報告單錯誤訊息（spec §7）— 純函式（client / server 皆可用）。

export const SR_DUPLICATE_NO_MESSAGE = "派工單號已存在";
export const SR_STALE_MESSAGE = "報告單狀態已變更，請重新整理";
export const SR_NOT_FOUND_MESSAGE = "找不到報告單";
export const SR_PRINTED_NO_LOCKED_MESSAGE = "已列印的報告單不可改派工單號";
export const SR_FK_MISSING_MESSAGE = "所選客戶或機台已不存在，請重新選擇";
export const SR_TECHNICIAN_MISSING_MESSAGE =
  "所選維護人員已不存在（可能已被刪除），請重新選擇";
export const SR_CO_TECHNICIAN_MISSING_MESSAGE =
  "所選協同技師已不存在（可能已被刪除），請重新選擇";
export const SR_TECHNICIAN_DUPLICATE_MESSAGE = "同一位技師不可重複列出";
export const SR_AUTO_NO_FAILED_MESSAGE =
  "自動編號失敗，請稍後再試或手動輸入派工單號";

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * supabase / RPC 錯誤 → 中文訊息：
 * 1. 23505 unique 衝突（sr_reports_report_no_key）→「派工單號已存在」；
 * 2. 23503 外鍵違反（客戶 / 機台已被刪除）→「所選客戶或機台已不存在，請重新選擇」；
 *    維護人員（technician_id → employees，0027）已被刪除 →「所選維護人員已不存在」；
 *    協同技師（sr_report_technicians，0037）的員工已被刪除 →「所選協同技師已不存在」、重複 →「同一位技師不可重複列出」；
 * 3. 42501 RLS / 權限不足 →「沒有機台維護報告單權限」；
 * 4. 觸發器 / RPC 以 P0001 + detail 丟出的人讀訊息 → 直接使用；
 * 5. 其他 →「操作失敗：<原始訊息>」。
 */
export function srErrorMessage(error: DbError | null | undefined): string {
  if (!error) return "操作失敗";
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  // 技師工時分攤（0037 sr_report_technicians）的約束：重複技師、員工已被刪除。
  const techTable = text.includes("sr_report_technicians");
  if (error.code === "23505") {
    return techTable
      ? SR_TECHNICIAN_DUPLICATE_MESSAGE
      : SR_DUPLICATE_NO_MESSAGE;
  }
  if (error.code === "23503") {
    if (techTable) return SR_CO_TECHNICIAN_MISSING_MESSAGE;
    return text.includes("technician_id")
      ? SR_TECHNICIAN_MISSING_MESSAGE
      : SR_FK_MISSING_MESSAGE;
  }
  if (error.code === "42501") return "沒有機台維護報告單權限";
  if (error.code === "P0001" && error.details) return error.details;
  return `操作失敗：${error.message ?? "未知錯誤"}`;
}
