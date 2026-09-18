// 報告單狀態標籤（草稿 / 已列印 / 已結案 / 作廢）。樣式同 ERP 的 DocStatusBadge。
import {
  STATUS_LABELS,
  type ServiceReportStatus,
} from "@/lib/service-report/types";

const CLASSES: Record<ServiceReportStatus, string> = {
  draft: "bg-amber-100 text-amber-700",
  printed: "bg-sky-100 text-sky-700",
  completed: "bg-primary/10 text-primary-deep",
  voided: "bg-gray-100 text-gray-500",
};

export function ReportStatusBadge({ status }: { status: ServiceReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${CLASSES[status] ?? CLASSES.draft}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
