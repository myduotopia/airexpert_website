// 保養方案錯誤訊息（spec §7）— 純函式（client / server 皆可用）。
import { srErrorMessage } from "../errors";

export const SP_DUPLICATE_NAME_MESSAGE = "方案名稱已存在";
export const SP_DUPLICATE_STAGE_HOURS_MESSAGE = "同一方案的階段時數不可重複";
export const SP_DUPLICATE_MESSAGE = "資料重複，請檢查輸入內容";
export const SP_PLAN_NOT_FOUND_MESSAGE = "找不到保養方案";
export const SP_STAGE_NOT_FOUND_MESSAGE = "找不到保養階段";
export const SP_MACHINE_NOT_FOUND_MESSAGE = "找不到機台";

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
  constraint?: string | null;
}

/**
 * 保養方案的 DB 錯誤 → 中文訊息。23505 依違反的 unique index 分辨
 * （sr_service_plan_stages_plan_hours_key ＝階段時數；sr_service_plans_name_key ＝方案名稱），
 * 其餘交給報告單模組共用的 srErrorMessage。
 */
export function planErrorMessage(error: DbError | null | undefined): string {
  if (error?.code === "23505") {
    const text =
      `${error.constraint ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (text.includes("plan_hours") || text.includes("stages")) {
      return SP_DUPLICATE_STAGE_HOURS_MESSAGE;
    }
    if (text.includes("name")) return SP_DUPLICATE_NAME_MESSAGE;
    return SP_DUPLICATE_MESSAGE;
  }
  return srErrorMessage(error);
}
