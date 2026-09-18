// 機台維護報告單列表（spec §6）：搜尋 / 日期區間 / 狀態篩選、每頁 50 筆、分頁，
// 所有篩選狀態同步在 URL。作廢的列以灰階淡化。
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { listReports } from "@/lib/service-report/queries";
import { SERVICE_ITEM_LABELS } from "@/lib/service-report/types";
import { ReportListFilters } from "./_components/ReportListFilters";
import { ReportStatusBadge } from "./_components/ReportStatusBadge";
import {
  hasActiveFilters,
  parseReportListParams,
  reportListHref,
  SERVICE_REPORTS_PATH,
  type ListSearchParams,
} from "./_components/list-params";

export const metadata = { title: "機台維護報告單 · 後台" };

const PRIMARY_BUTTON =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white";
const SECONDARY_BUTTON =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold";

function serviceItemText(items: readonly string[] | null): string {
  const labels = (items ?? [])
    .map((k) => SERVICE_ITEM_LABELS[k as keyof typeof SERVICE_ITEM_LABELS])
    .filter(Boolean);
  return labels.length ? labels.join("、") : "—";
}

export default async function ServiceReportsPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  await requireModule("service_report");
  const query = parseReportListParams(await searchParams);
  const res = await listReports({
    q: query.q,
    status: query.status || null,
    from: query.from || null,
    to: query.to || null,
    page: query.page,
  });

  const rows = res.ok ? res.data.rows : [];
  const total = res.ok ? res.data.total : 0;
  const pageSize = res.ok ? res.data.pageSize : 50;
  // listReports 會把超出範圍的頁碼夾回最後一頁，分頁連結一律以實際頁碼為準。
  const page = res.ok ? res.data.page : query.page;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-[24px] font-bold">機台維護報告單</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            開立報告單、列印給技師帶到現場，回收後回填結果並結案。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${SERVICE_REPORTS_PATH}/print/blank`}
            target="_blank"
            rel="noreferrer"
            className={SECONDARY_BUTTON}
          >
            列印空白表單
          </Link>
          <Link href={`${SERVICE_REPORTS_PATH}/new`} className={PRIMARY_BUTTON}>
            開立報告單
          </Link>
        </div>
      </div>

      <ReportListFilters
        key={`${query.q}|${query.status}|${query.from}|${query.to}`}
        initial={{
          q: query.q,
          status: query.status,
          from: query.from,
          to: query.to,
        }}
      />

      {!res.ok && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          {res.error}
        </p>
      )}

      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[880px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className="px-3 py-2 font-medium">派工單號</th>
              <th className="px-3 py-2 font-medium">維護日期</th>
              <th className="px-3 py-2 font-medium">客戶名稱</th>
              <th className="px-3 py-2 font-medium">設備</th>
              <th className="px-3 py-2 font-medium">服務項目</th>
              <th className="px-3 py-2 font-medium">狀態</th>
              <th className="px-3 py-2 text-right font-medium">列印次數</th>
              <th className="px-3 py-2 font-medium">最後列印</th>
            </tr>
          </thead>
          <tbody>
            {res.ok && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  {hasActiveFilters(query)
                    ? "沒有符合條件的報告單，請調整搜尋或篩選條件。"
                    : "尚未開立任何報告單，請點右上角「開立報告單」。"}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const voided = r.status === "voided";
              return (
                <tr
                  key={r.id}
                  className={`border-border border-t ${voided ? "text-text-muted bg-gray-50/60" : ""}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`${SERVICE_REPORTS_PATH}/${r.id}`}
                      className={`hover:text-primary-deep font-mono font-medium ${voided ? "text-text-muted line-through" : "text-ink"}`}
                    >
                      {r.report_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {rocDate(r.report_date)}
                  </td>
                  <td className="px-3 py-2">{r.customer_name || "—"}</td>
                  <td className="px-3 py-2">
                    <span>{r.equipment || "—"}</span>
                    {r.serial_no && (
                      <span className="text-text-muted block text-[12px]">
                        編號 {r.serial_no}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[13px]">
                    {serviceItemText(r.service_items)}
                  </td>
                  <td className="px-3 py-2">
                    <ReportStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.print_count}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.last_printed_at ? rocDateTime(r.last_printed_at) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-text-muted mt-3 flex items-center justify-between text-[13px]">
        <span>
          共 {total} 筆，第 {Math.min(page, pageCount)} / {pageCount} 頁
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={reportListHref(query, page - 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              上一頁
            </Link>
          )}
          {page < pageCount && (
            <Link
              href={reportListHref(query, page + 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              下一頁
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
