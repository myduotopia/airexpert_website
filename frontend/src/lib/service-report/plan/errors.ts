// 保養方案錯誤訊息（spec §7）— 純函式（client / server 皆可用）。
import { srErrorMessage } from "../errors";

export const SP_DUPLICATE_NAME_MESSAGE = "方案名稱已存在";
export const SP_DUPLICATE_STAGE_HOURS_MESSAGE = "同一方案的階段時數不可重複";
export const SP_DUPLICATE_MESSAGE = "資料重複，請檢查輸入內容";
export const SP_FK_MISSING_MESSAGE = "所選保養方案或階段已不存在，請重新整理";
export const SP_CHECK_VIOLATION_MESSAGE = "資料格式不正確，請檢查輸入";
export const SP_PLAN_NOT_FOUND_MESSAGE = "找不到保養方案";
export const SP_STAGE_NOT_FOUND_MESSAGE = "找不到保養階段";
export const SP_MACHINE_NOT_FOUND_MESSAGE = "找不到機台";

/** 分頁讀取超過保護上限時，queries.ts 以此 code 回報（非 PostgreSQL 錯誤碼）。 */
export const SP_TOO_MANY_ROWS_CODE = "SP_TOO_MANY_ROWS";
export const SP_TOO_MANY_ROWS_MESSAGE =
  "資料量超過系統一次可處理的上限，請聯絡管理員";

/** 0022 的兩個 unique index（23505 分辨用；只比對這兩個字面名稱）。 */
const STAGE_HOURS_CONSTRAINT = "sr_service_plan_stages_plan_hours_key";
const PLAN_NAME_CONSTRAINT = "sr_service_plans_name_key";

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
  constraint?: string | null;
}

/** 只看 constraint 欄位與 message（details 含使用者輸入，比對會誤判）。 */
function violates(error: DbError, constraint: string): boolean {
  return (
    error.constraint === constraint ||
    (error.message ?? "").includes(constraint)
  );
}

/**
 * 保養方案的 DB 錯誤 → 中文訊息：
 * 1. 23505 依違反的 unique index 分辨（階段時數 / 方案名稱），認不出來的用通用重複訊息；
 * 2. 23503 外鍵違反（方案 / 階段已被刪除）→ 方案語境的訊息（報告單模組的版本講的是客戶 / 機台）；
 * 3. 23514 check 違反 → 中文的格式訊息（否則會把原始英文丟給使用者）；
 * 4. 讀取超過保護上限 → 明確告知資料量過大（不以殘缺資料誤導）；
 * 5. 其餘交給報告單模組共用的 srErrorMessage。
 */
export function planErrorMessage(error: DbError | null | undefined): string {
  if (error?.code === "23505") {
    if (violates(error, STAGE_HOURS_CONSTRAINT)) {
      return SP_DUPLICATE_STAGE_HOURS_MESSAGE;
    }
    if (violates(error, PLAN_NAME_CONSTRAINT)) return SP_DUPLICATE_NAME_MESSAGE;
    return SP_DUPLICATE_MESSAGE;
  }
  if (error?.code === "23503") return SP_FK_MISSING_MESSAGE;
  if (error?.code === "23514") return SP_CHECK_VIOLATION_MESSAGE;
  if (error?.code === SP_TOO_MANY_ROWS_CODE) return SP_TOO_MANY_ROWS_MESSAGE;
  return srErrorMessage(error);
}
