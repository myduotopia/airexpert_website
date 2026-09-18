// 報告單詳情頁可用的動作（spec §4.4 狀態規則）— 純函式，供 UI 與測試共用。
//
// | 狀態      | 可用動作                                      |
// |-----------|-----------------------------------------------|
// | draft     | 編輯、列印、作廢、刪除（僅 print_count = 0）  |
// | printed   | 編輯、列印、回填結果、結案、作廢              |
// | completed | 編輯（二次確認）、列印、重新開啟、作廢        |
// | voided    | 無（唯讀，只能返回列表）                      |
import {
  SR_NOT_FOUND_MESSAGE,
  SR_STALE_MESSAGE,
} from "@/lib/service-report/errors";
import type { ServiceReportStatus } from "@/lib/service-report/types";

export type ReportActionKey =
  | "edit"
  | "print"
  | "fill"
  | "complete"
  | "reopen"
  | "void"
  | "delete";

export const REPORT_ACTION_LABELS: Record<ReportActionKey, string> = {
  edit: "編輯",
  print: "列印",
  fill: "回填結果",
  complete: "結案",
  reopen: "重新開啟",
  void: "作廢",
  delete: "刪除",
};

/** 依狀態（與列印次數）決定要顯示哪些動作，順序即畫面上的排列順序。 */
export function actionsForStatus(
  status: ServiceReportStatus,
  printCount: number,
): ReportActionKey[] {
  switch (status) {
    case "draft":
      // 已列印過的草稿（極少見：列印後狀態應已轉 printed）不可刪除，只能作廢。
      return printCount > 0
        ? ["edit", "print", "void"]
        : ["edit", "print", "void", "delete"];
    case "printed":
      return ["edit", "print", "fill", "complete", "void"];
    case "completed":
      return ["edit", "print", "reopen", "void"];
    case "voided":
      return [];
    default:
      return [];
  }
}

/** 已結案的報告單編輯前需二次確認（spec §4.4）。 */
export function needsEditConfirm(status: ServiceReportStatus): boolean {
  return status === "completed";
}

/**
 * 代表「畫面上的狀態已過時」的 action 錯誤訊息（與 actions.ts 的前置條件訊息一致）。
 * 出現這些訊息時提示使用者重新整理，而不是重試同一個動作。
 */
export const STATE_CONFLICT_MESSAGES: readonly string[] = [
  SR_STALE_MESSAGE,
  SR_NOT_FOUND_MESSAGE,
  "只有已列印的報告單可以結案",
  "只有已結案的報告單可以重新開啟",
  "報告單已作廢",
  "已作廢的報告單不可列印",
  "只有未列印過的草稿可以刪除，其他請改用作廢",
];

/** 是否要在錯誤訊息旁提供「重新整理」按鈕。 */
export function shouldOfferRefresh(error: string | null | undefined): boolean {
  return Boolean(error) && STATE_CONFLICT_MESSAGES.includes(error as string);
}
