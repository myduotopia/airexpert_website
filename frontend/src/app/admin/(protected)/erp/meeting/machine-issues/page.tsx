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
  MACHINE_ISSUE_STATUSES,
  MACHINE_ISSUE_STATUS_LABELS,
} from "@/lib/erp/tracking/types";
import { MachineIssuesBoard } from "@/components/erp/meeting/tracking/MachineIssuesBoard";
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

export const metadata = { title: "新機問題 · 週報" };

const KIND = "machine-issues" as const;
const NONE_LABEL = "負責人未指定";

// 週報 tab：新機問題（#272）。子頁籤由 #271 的 meeting/layout.tsx 提供；本頁自行守門。
// ?print=1：列印模式（全部符合篩選的資料、A4 橫式）。
export default async function MeetingMachineIssuesPage({
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
          MACHINE_ISSUE_STATUS_LABELS,
          employees,
          NONE_LABEL,
          today,
        )}
        backHref={trackingHref(KIND, filters)}
      >
        <MachineIssuesBoard
          rows={rows}
          refYear={refYear}
          today={today}
          readOnly
        />
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
        title="新機問題"
        description={`共 ${result.total} 筆（${trackingFilterSummary(filters, MACHINE_ISSUE_STATUS_LABELS, employees, NONE_LABEL)}）。日期區間依發生日期；重點追蹤排在最前並以醒目底色顯示。`}
      />
      <ReportToolbar
        basePath={TRACKING_BASE_PATHS[KIND]}
        dateLabel="發生日期"
        from={filters.from}
        to={filters.to}
        q={filters.q}
        qPlaceholder="客戶、機型、機號、問題、負責人"
        today={today}
        printHref={trackingHref(KIND, filters, { print: "1" })}
        exportCsv={exportTrackingCsvAction.bind(null, KIND, params)}
      >
        <TrackingFilterFields
          filters={filters}
          statuses={MACHINE_ISSUE_STATUSES.map((s) => ({
            value: s,
            label: MACHINE_ISSUE_STATUS_LABELS[s],
          }))}
          employees={employees}
          roles={["technician"]}
          ownerLabel="負責人"
          noneLabel={NONE_LABEL}
        />
      </ReportToolbar>
      <MachineIssuesBoard
        rows={result.rows}
        customers={customers}
        employees={employees}
        refYear={refYear}
        today={today}
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
