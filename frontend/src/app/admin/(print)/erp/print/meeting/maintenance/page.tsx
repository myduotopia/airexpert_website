import {
  MeetingPrintSheet,
  MeetingPrintStyles,
} from "@/components/erp/meeting/MeetingPrint";
import { PrintMessage, PrintShell } from "@/components/erp/print/PrintSheet";
import { requireModule } from "@/lib/admin/auth";
import { meetingReportTitle } from "@/lib/erp/meeting/date-range";
import {
  formatShare,
  rocShortDate,
  techColumnLabel,
} from "@/lib/erp/meeting/maintenance";
import {
  MAINTENANCE_TITLE,
  loadMaintenanceView,
} from "@/lib/erp/meeting/maintenance-view";
import {
  meetingTabHref,
  type MeetingSearchParams,
} from "@/lib/erp/meeting/params";

export const metadata = { title: "維護完成紀錄列印 · 週報 · ERP · 後台" };

// 維護完成紀錄列印（#271）：A4 橫式，標題「維護完成紀錄 MM/DD~MM/DD」，條件與週報頁相同（查詢參數）。
export default async function MeetingMaintenancePrintPage({
  searchParams,
}: {
  searchParams: Promise<MeetingSearchParams>;
}) {
  await requireModule("erp");
  const view = await loadMaintenanceView(await searchParams);
  const { table, range } = view;
  const title = meetingReportTitle(MAINTENANCE_TITLE, range);
  const backHref = meetingTabHref("maintenance", view.query);
  const techLabel = view.tech
    ? view.techOptions.find((t) => t.key === view.tech)?.name
    : null;
  const meta = [
    `共 ${table.rows.length} 筆`,
    techLabel ? `技師：${techLabel}` : null,
    view.q ? `關鍵字：${view.q}` : null,
  ]
    .filter(Boolean)
    .join("　");

  if (view.error) {
    return (
      <PrintShell title={title} backHref={backHref}>
        <PrintMessage>讀取維護完成紀錄失敗：{view.error}</PrintMessage>
      </PrintShell>
    );
  }

  return (
    <PrintShell title={title} backHref={backHref}>
      <MeetingPrintStyles />
      <MeetingPrintSheet title={title} printedOn={view.today} meta={meta}>
        {table.rows.length === 0 ? (
          <p className="mtg-empty">此期間沒有符合條件的已結案維護報告單。</p>
        ) : (
          <table className="mtg-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>客戶簡稱</th>
                <th>損壞狀況</th>
                {table.columns.map((c) => (
                  <th key={c.key} className="mtg-num">
                    {techColumnLabel(c)}
                  </th>
                ))}
                <th>處理進度</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.id}>
                  <td className="mtg-nowrap">{rocShortDate(r.report_date)}</td>
                  <td>{r.customer_name}</td>
                  <td className="mtg-wrap">{r.summary}</td>
                  {table.columns.map((c) => (
                    <td key={c.key} className="mtg-num">
                      {formatShare(r.shares[c.key])}
                    </td>
                  ))}
                  <td className="mtg-wrap">{r.progress}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>合計（{table.rows.length} 筆）</td>
                {table.columns.map((c) => (
                  <td key={c.key} className="mtg-num">
                    {formatShare(table.totals[c.key])}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </MeetingPrintSheet>
    </PrintShell>
  );
}
