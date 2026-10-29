import { requireModule } from "@/lib/admin/auth";
import { listCustomerOptions } from "@/lib/erp/queries/pickers";
import { listEmployeeOptions } from "@/lib/employees/queries";
import { taipeiToday } from "@/lib/employees/status";
import { exportTrackingCsvAction } from "@/lib/erp/tracking/actions";
import { taipeiYear } from "@/lib/erp/tracking/display";
import {
  filtersToParams,
  parseTrackingFilters,
} from "@/lib/erp/tracking/filters";
import { listAllTracking, listTracking } from "@/lib/erp/tracking/queries";
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
} from "@/lib/erp/tracking/types";
import { DeliveryJobsBoard } from "@/components/erp/meeting/tracking/DeliveryJobsBoard";
import { TrackingFilterFields } from "@/components/erp/meeting/tracking/TrackingFilterFields";
import { SectionHeader } from "@/components/erp/meeting/tracking/ui";
import {
  TRACKING_BASE_PATHS,
  trackingFilterSummary,
  trackingHref,
  trackingReportTitle,
} from "@/components/erp/meeting/tracking/report";
// ⚠️ 暫代版（#271 合併後改用 #271 的 ReportToolbar 與列印版型）
import { ReportToolbar } from "@/components/erp/meeting/tracking/_shim/ReportToolbar";
import { PrintFrame } from "@/components/erp/meeting/tracking/_shim/PrintFrame";
import { Pager } from "../../items/_components/master-ui";

export const metadata = { title: "交機進度 · 週報" };

const KIND = "delivery" as const;
const NONE_LABEL = "交機負責人待確認";

// 週報 tab：交機進度（#272）。子頁籤由 #271 的 meeting/layout.tsx 提供；本頁自行守門。
// ?print=1：列印模式（全部符合篩選的資料、A4 橫式）。
export default async function MeetingDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const filters = parseTrackingFilters(KIND, sp);
  const today = taipeiToday();
  const refYear = taipeiYear();
  const printMode = sp.print === "1";

  if (printMode) {
    const [rows, employees] = await Promise.all([
      listAllTracking(KIND, filters),
      listEmployeeOptions({ includeInactive: true }),
    ]);
    return (
      <PrintFrame
        title={trackingReportTitle(KIND, filters)}
        subtitle={trackingFilterSummary(
          filters,
          DELIVERY_STATUS_LABELS,
          employees,
          NONE_LABEL,
          today,
        )}
        backHref={trackingHref(KIND, filters)}
      >
        <DeliveryJobsBoard rows={rows} refYear={refYear} readOnly />
      </PrintFrame>
    );
  }

  const [result, customers, employees] = await Promise.all([
    listTracking(KIND, filters),
    listCustomerOptions(),
    listEmployeeOptions({ includeInactive: true }),
  ]);
  const params = filtersToParams(filters);

  return (
    <div className="mx-auto max-w-[1400px]">
      <SectionHeader
        title="交機進度"
        description={`共 ${result.total} 筆（${trackingFilterSummary(filters, DELIVERY_STATUS_LABELS, employees, NONE_LABEL)}）。日期區間依交機時間（與區間重疊者），設定區間時不含交機時間待確認者。`}
      />
      <ReportToolbar
        basePath={TRACKING_BASE_PATHS[KIND]}
        dateLabel="交機時間"
        from={filters.from}
        to={filters.to}
        q={filters.q}
        qPlaceholder="客戶、機器設備、注意事項、單號"
        today={today}
        printHref={trackingHref(KIND, filters, { print: "1" })}
        exportCsv={exportTrackingCsvAction.bind(null, KIND, params)}
      >
        <TrackingFilterFields
          filters={filters}
          statuses={DELIVERY_STATUSES.map((s) => ({
            value: s,
            label: DELIVERY_STATUS_LABELS[s],
          }))}
          employees={employees}
          roles={["sales", "technician"]}
          ownerLabel="負責人（業務或交機）"
          noneLabel={NONE_LABEL}
        />
      </ReportToolbar>
      <DeliveryJobsBoard
        rows={result.rows}
        customers={customers}
        employees={employees}
        refYear={refYear}
      />
      <Pager
        basePath={TRACKING_BASE_PATHS[KIND]}
        params={params}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
