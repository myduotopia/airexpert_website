// 週報追蹤清單（#272）的報表標題、期間與篩選摘要。純函式（server page／列印頁用）。
// 期間、標題格式沿用 #271 週報共用的 lib/erp/meeting/date-range.ts。
import { meetingReportTitle } from "@/lib/erp/meeting/date-range";
import { rocShortDate } from "@/lib/erp/meeting/maintenance";
import { TRACKING_TITLES } from "@/lib/erp/tracking/csv";
import type { TrackingFilters } from "@/lib/erp/tracking/filters";
import type { EmployeeOption } from "@/lib/employees/types";
import type { TrackingKind } from "@/lib/erp/tracking/types";

/** 報表標題：「交機進度 11/01~11/07」；不限日期只顯示類別名稱。 */
export function trackingReportTitle(
  kind: TrackingKind,
  f: TrackingFilters,
): string {
  return meetingReportTitle(TRACKING_TITLES[kind], f.range);
}

/** 期間文字：「不限日期」或「115/11/01 ～ 115/11/07」。 */
export function trackingPeriodText(f: TrackingFilters): string {
  const { preset, from, to } = f.range;
  if (preset === "all" || !from || !to) return "不限日期";
  return `${rocShortDate(from)} ～ ${rocShortDate(to)}`;
}

/** 篩選摘要（清單說明、列印右上角）：狀態｜負責人｜關鍵字。 */
export function trackingFilterSummary(
  f: TrackingFilters,
  statusLabels: Record<string, string>,
  employees: EmployeeOption[],
  noneLabel: string,
): string {
  const parts: string[] = [];
  parts.push(
    f.status === "open"
      ? "未結案"
      : f.status === "all"
        ? "全部狀態"
        : (statusLabels[f.status] ?? f.status),
  );
  if (f.owner === "none") parts.push(noneLabel);
  else if (f.owner) {
    parts.push(
      `負責人：${employees.find((e) => e.id === f.owner)?.name ?? "（未知）"}`,
    );
  }
  if (f.q) parts.push(`關鍵字：${f.q}`);
  return parts.join("｜");
}
