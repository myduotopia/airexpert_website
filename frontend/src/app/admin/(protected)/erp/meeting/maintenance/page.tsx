import { GatedLink } from "@/components/erp/GatedLink";
import { ReportToolbar } from "@/components/erp/meeting/ReportToolbar";
import { ERP_LABEL, ERP_SELECT } from "@/components/erp/styles";
import { hasModule, requireModule } from "@/lib/admin/auth";
import { serviceReportHref } from "@/lib/erp/admin-links";
import { meetingCsvFile } from "@/lib/erp/meeting/csv";
import {
  formatShare,
  maintenanceCsvRows,
  rocShortDate,
  techColumnLabel,
} from "@/lib/erp/meeting/maintenance";
import {
  MAINTENANCE_TITLE,
  loadMaintenanceView,
} from "@/lib/erp/meeting/maintenance-view";
import {
  meetingPrintHref,
  meetingTabHref,
  type MeetingSearchParams,
} from "@/lib/erp/meeting/params";

export const metadata = { title: "維護完成紀錄 · 週報 · ERP · 後台" };

const TH = "px-3 py-2 font-medium whitespace-nowrap";
const TD = "px-3 py-2 align-top";
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

// 維護完成紀錄（#271）：區間內已結案、未作廢的維護報告單；每位技師一欄（工時比例），表尾合計。
// 資料經由 erp_meeting_maintenance（0037，security definer，只回報表欄位）。
// 點列可到報告單詳情——詳情頁需要 service_report 模組，沒有的人只顯示文字。
export default async function MeetingMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const [view, canOpenReport] = await Promise.all([
    loadMaintenanceView(sp),
    hasModule("service_report"),
  ]);
  const { range, table } = view;
  const csvData = maintenanceCsvRows(table);
  const csv = view.error
    ? null
    : meetingCsvFile(MAINTENANCE_TITLE, range, csvData.headers, csvData.rows);

  return (
    <section>
      <ReportToolbar
        basePath={meetingTabHref("maintenance")}
        range={range}
        q={view.q}
        query={view.query}
        keywordPlaceholder="客戶、損壞狀況、處理進度"
        printHref={
          view.error ? null : meetingPrintHref("maintenance", view.query)
        }
        csv={csv}
        summary={`${rocShortDate(range.from)} ～ ${rocShortDate(range.to)}，已結案 ${table.rows.length} 筆`}
      >
        <label className="flex flex-col gap-1.5">
          <span className={ERP_LABEL}>技師</span>
          <select
            name="tech"
            defaultValue={view.tech}
            className={`${ERP_SELECT} w-44`}
          >
            <option value="">全部技師</option>
            {view.techOptions.map((t) => (
              <option key={t.key} value={t.key}>
                {techColumnLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </ReportToolbar>

      {view.error ? (
        <p role="alert" className="text-[14px] text-red-600">
          讀取維護完成紀錄失敗：{view.error}
        </p>
      ) : table.rows.length === 0 ? (
        <p className="border-border text-text-muted rounded-xl border bg-white px-4 py-8 text-center text-[14px]">
          此期間沒有符合條件的已結案維護報告單。
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-[14px]">
            <thead className="bg-surface-muted text-text-muted text-left">
              <tr>
                <th className={TH}>日期</th>
                <th className={TH}>客戶簡稱</th>
                <th className={TH}>損壞狀況</th>
                {table.columns.map((c) => (
                  <th key={c.key} className={`${TH} text-right`}>
                    {techColumnLabel(c)}
                  </th>
                ))}
                <th className={TH}>處理進度</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.id} className="border-border border-t">
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>
                    <GatedLink
                      href={serviceReportHref(r.id)}
                      allowed={canOpenReport}
                      className="text-primary-deep font-semibold hover:underline"
                      title={`報告單 ${r.report_no}`}
                    >
                      {rocShortDate(r.report_date)}
                    </GatedLink>
                    <div className="text-text-muted font-mono text-[12px]">
                      {r.report_no}
                    </div>
                  </td>
                  <td className={TD}>{r.customer_name || "—"}</td>
                  <td className={`${TD} whitespace-pre-wrap`}>
                    {r.summary || "—"}
                  </td>
                  {table.columns.map((c) => (
                    <td key={c.key} className={NUM}>
                      {formatShare(r.shares[c.key])}
                    </td>
                  ))}
                  <td className={TD}>{r.progress}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-border bg-surface-muted border-t font-semibold">
                <td className={TD} colSpan={3}>
                  合計（{table.rows.length} 筆）
                </td>
                {table.columns.map((c) => (
                  <td key={c.key} className={NUM}>
                    {formatShare(table.totals[c.key])}
                  </td>
                ))}
                <td className={TD} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
