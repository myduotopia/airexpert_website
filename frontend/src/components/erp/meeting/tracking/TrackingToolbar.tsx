// 週報追蹤清單（#272）工具列：#271 共用 ReportToolbar（期間含「全部」）＋狀態／負責人篩選、
// 列印（獨立列印路由）、匯出 CSV（server 先產好，工具列以 Blob 下載）。server component。
import { ReportToolbar } from "@/components/erp/meeting/ReportToolbar";
import { MEETING_RANGE_PRESETS_WITH_ALL } from "@/lib/erp/meeting/date-range";
import { meetingPrintHref, meetingTabHref } from "@/lib/erp/meeting/params";
import { trackingCsvFile } from "@/lib/erp/tracking/csv";
import type { TrackingKind } from "@/lib/erp/tracking/types";
import type { TrackingView } from "@/lib/erp/tracking/view";
import { TRACKING_PAGE_CONFIG } from "./config";
import { trackingFilterSummary, trackingPeriodText } from "./report";
import { TrackingFilterFields } from "./TrackingFilterFields";

export function TrackingToolbar<K extends TrackingKind>({
  kind,
  view,
}: {
  kind: K;
  view: TrackingView<K>;
}) {
  const cfg = TRACKING_PAGE_CONFIG[kind];
  const { filters } = view;
  return (
    <ReportToolbar
      basePath={meetingTabHref(kind)}
      range={filters.range}
      q={filters.q}
      query={view.query}
      presets={MEETING_RANGE_PRESETS_WITH_ALL}
      keywordPlaceholder={cfg.keywordPlaceholder}
      printHref={meetingPrintHref(kind, view.query)}
      csv={trackingCsvFile(kind, view.rows, filters.range)}
      summary={
        <>
          <div>
            {trackingPeriodText(filters)}，
            {trackingFilterSummary(
              filters,
              cfg.statusLabels,
              view.employees,
              cfg.noneLabel,
            )}
            ，共 {view.rows.length} 筆
          </div>
          <div className="mt-0.5 text-[12px]">{cfg.note}</div>
        </>
      }
    >
      <TrackingFilterFields
        filters={filters}
        statuses={cfg.statuses}
        employees={view.employees}
        roles={cfg.roles}
        ownerLabel={cfg.ownerLabel}
        noneLabel={cfg.noneLabel}
      />
    </ReportToolbar>
  );
}
