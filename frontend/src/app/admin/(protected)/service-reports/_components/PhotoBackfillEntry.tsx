// 詳情頁「拍照辨識回填」入口（#280）：顯示時機與「回填結果」相同（actionsForStatus 含 fill＝已列印、未結案）；
// 作廢、草稿、已結案都不顯示。頁面本身已由 requireModule("service_report") 把關，
// 辨識 action 另以 ensureServiceReport 檢查。點擊後到編輯頁 ?photo=1 上傳照片並預填既有回填表單。
import Link from "next/link";
import type { ServiceReportStatus } from "@/lib/service-report/types";
import { SERVICE_REPORTS_PATH } from "./list-params";
import { actionsForStatus } from "./report-actions";

const SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold";

/** 是否顯示入口（與「回填結果」同一條件）。 */
export function showPhotoBackfillEntry(
  status: ServiceReportStatus,
  printCount: number,
): boolean {
  return actionsForStatus(status, printCount).includes("fill");
}

export function PhotoBackfillEntry({
  id,
  status,
  printCount,
}: {
  id: string;
  status: ServiceReportStatus;
  printCount: number;
}) {
  if (!showPhotoBackfillEntry(status, printCount)) return null;
  return (
    <Link
      href={`${SERVICE_REPORTS_PATH}/${id}/edit?photo=1`}
      className={SECONDARY}
    >
      拍照辨識回填
    </Link>
  );
}
