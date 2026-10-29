// 週報追蹤清單（#272）的報表標題、篩選摘要與連結。純函式（server page 用）。
import { rocDate } from "@/lib/admin/minguo";
import { TRACKING_TITLES } from "@/lib/erp/tracking/csv";
import {
  filtersToParams,
  type TrackingFilters,
} from "@/lib/erp/tracking/filters";
import type { EmployeeOption } from "@/lib/employees/types";
import type { TrackingKind } from "@/lib/erp/tracking/types";
import { rangeLabel } from "./_shim/date-range";

export const TRACKING_BASE_PATHS: Record<TrackingKind, string> = {
  delivery: "/admin/erp/meeting/delivery",
  repairs: "/admin/erp/meeting/repairs",
  "machine-issues": "/admin/erp/meeting/machine-issues",
};

/** 報表標題：「交機進度 11/01~11/07」；未設日期區間只顯示類別名稱。 */
export function trackingReportTitle(
  kind: TrackingKind,
  f: TrackingFilters,
): string {
  const range = rangeLabel(f.from, f.to);
  return range ? `${TRACKING_TITLES[kind]} ${range}` : TRACKING_TITLES[kind];
}

/** 篩選摘要（列印副標、清單說明）：狀態｜負責人｜關鍵字｜列印日期。 */
export function trackingFilterSummary(
  f: TrackingFilters,
  statusLabels: Record<string, string>,
  employees: EmployeeOption[],
  noneLabel: string,
  today?: string,
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
  if (today) parts.push(`列印日期 ${rocDate(today)}`);
  return parts.join("｜");
}

/** 網址 + 篩選參數（extra 例：{ print: "1" }、{ page: "2" }）。 */
export function trackingHref(
  kind: TrackingKind,
  f: TrackingFilters,
  extra: Record<string, string> = {},
): string {
  const sp = new URLSearchParams({ ...filtersToParams(f), ...extra });
  const qs = sp.toString();
  return qs ? `${TRACKING_BASE_PATHS[kind]}?${qs}` : TRACKING_BASE_PATHS[kind];
}
