import {
  MeetingPrintSheet,
  MeetingPrintStyles,
} from "@/components/erp/meeting/MeetingPrint";
import { PrintShell } from "@/components/erp/print/PrintSheet";
import { MachineIssuesPrintTable } from "@/components/erp/meeting/tracking/TrackingPrintTables";
import { TRACKING_PAGE_CONFIG } from "@/components/erp/meeting/tracking/config";
import {
  trackingFilterSummary,
  trackingPeriodText,
  trackingReportTitle,
} from "@/components/erp/meeting/tracking/report";
import { requireModule } from "@/lib/admin/auth";
import {
  meetingTabHref,
  type MeetingSearchParams,
} from "@/lib/erp/meeting/params";
import { loadTrackingView } from "@/lib/erp/tracking/view";

export const metadata = { title: "新機問題列印 · 週報 · ERP · 後台" };

const KIND = "machine-issues" as const;

// 新機問題列印（#272）：A4 橫式（#271 MeetingPrint 版型），全部符合篩選的資料（不分頁），條件與週報頁相同。
export default async function MeetingMachineIssuesPrintPage({
  searchParams,
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  await requireModule("erp");
  const view = await loadTrackingView(KIND, await searchParams);
  const cfg = TRACKING_PAGE_CONFIG[KIND];
  const title = trackingReportTitle(KIND, view.filters);
  const meta = [
    trackingPeriodText(view.filters),
    trackingFilterSummary(
      view.filters,
      cfg.statusLabels,
      view.employees,
      cfg.noneLabel,
    ),
    `共 ${view.rows.length} 筆`,
  ].join("　");

  return (
    <PrintShell title={title} backHref={meetingTabHref(KIND, view.query)}>
      <MeetingPrintStyles />
      <MeetingPrintSheet title={title} printedOn={view.today} meta={meta}>
        <MachineIssuesPrintTable rows={view.rows} refYear={view.refYear} />
      </MeetingPrintSheet>
    </PrintShell>
  );
}
