import { requireModule } from "@/lib/admin/auth";
import { listCustomerOptions } from "@/lib/erp/queries/pickers";
import {
  meetingTabHref,
  type MeetingSearchParams,
} from "@/lib/erp/meeting/params";
import { pageSlice, trackingParams } from "@/lib/erp/tracking/filters";
import { loadTrackingView } from "@/lib/erp/tracking/view";
import { DeliveryJobsBoard } from "@/components/erp/meeting/tracking/DeliveryJobsBoard";
import { TrackingToolbar } from "@/components/erp/meeting/tracking/TrackingToolbar";
import { Pager } from "../../items/_components/master-ui";

export const metadata = { title: "交機進度 · 週報 · ERP · 後台" };

const KIND = "delivery" as const;

// 週報 tab：交機進度（#272）。子頁籤由 #271 的 meeting/layout.tsx 提供；本頁自行守門。
// 期間預設「全部」（看全部未結案）；列印走 /admin/erp/print/meeting/delivery（同查詢參數）。
export default async function MeetingDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const [view, customers] = await Promise.all([
    loadTrackingView(KIND, sp),
    listCustomerOptions(),
  ]);
  const paged = pageSlice(view.rows, view.filters.page);

  return (
    <section>
      <TrackingToolbar kind={KIND} view={view} />
      <DeliveryJobsBoard
        rows={paged.rows}
        customers={customers}
        employees={view.employees}
        refYear={view.refYear}
      />
      <Pager
        basePath={meetingTabHref(KIND)}
        params={trackingParams(view.filters)}
        page={paged.page}
        total={paged.total}
        pageSize={paged.pageSize}
      />
    </section>
  );
}
