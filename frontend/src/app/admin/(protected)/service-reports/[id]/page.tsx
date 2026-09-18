// 報告單詳情（spec §6）：ReportSheet 唯讀預覽 ＋ 狀態 / 列印紀錄面板 ＋ 依狀態顯示的操作列。
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportSheet } from "@/components/service-report/ReportSheet";
import { requireModule } from "@/lib/admin/auth";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { getBranding } from "@/lib/data/site";
import { getReport } from "@/lib/service-report/queries";
import { TIME_SLOT_LABELS } from "@/lib/service-report/types";
import { ReportActions } from "../_components/ReportActions";
import { ReportStatusBadge } from "../_components/ReportStatusBadge";
import { SERVICE_REPORTS_PATH } from "../_components/list-params";

export const metadata = { title: "報告單明細 · 機台維護報告單" };

export default async function ServiceReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("service_report");
  const { id } = await params;
  const res = await getReport(id);

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <BackLink />
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          {res.error}
        </p>
      </div>
    );
  }
  const report = res.data;
  if (!report) notFound();

  const branding = await getBranding();
  const meta: [string, string][] = [
    ["維護日期", rocDate(report.report_date)],
    ["時段", report.time_slot ? TIME_SLOT_LABELS[report.time_slot] : "—"],
    ["列印次數", `${report.print_count} 次`],
    ["首次列印", rocDateTime(report.first_printed_at)],
    ["最後列印", rocDateTime(report.last_printed_at)],
    ["結案時間", rocDateTime(report.completed_at)],
    ["建立時間", rocDateTime(report.created_at)],
    ["最後更新", rocDateTime(report.updated_at)],
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <BackLink />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-ink text-[22px] font-bold">
          機台維護報告單 <span className="font-mono">{report.report_no}</span>
        </h1>
        <ReportStatusBadge status={report.status} />
      </div>

      {report.status === "voided" && (
        <p className="mb-4 rounded-lg bg-gray-100 px-4 py-3 text-[14px] text-gray-600">
          已於 {rocDateTime(report.voided_at)} 作廢，原因：
          {report.void_reason || "—"}
        </p>
      )}

      <div className="mb-6">
        <ReportActions
          id={report.id}
          status={report.status}
          printCount={report.print_count}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <h2 className="text-ink mb-2 text-[15px] font-semibold">
            報告單預覽
          </h2>
          <div className="border-border overflow-hidden rounded-xl border bg-white p-2">
            <ReportSheet
              data={report}
              mode="preview"
              logoUrl={branding.logo_url || null}
            />
          </div>
          <p className="text-text-muted mt-2 text-[13px]">
            此為畫面預覽；實際列印請按「列印」進入列印頁（會記錄列印次數）。
          </p>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="border-border rounded-xl border bg-white p-4">
            <h2 className="text-ink mb-3 text-[15px] font-semibold">
              狀態與列印紀錄
            </h2>
            <dl className="flex flex-col gap-2 text-[14px]">
              <div className="flex items-center gap-2">
                <dt className="text-text-muted w-20 shrink-0">狀態</dt>
                <dd>
                  <ReportStatusBadge status={report.status} />
                </dd>
              </div>
              {meta.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2">
                  <dt className="text-text-muted w-20 shrink-0">{k}</dt>
                  <dd className="text-ink min-w-0 break-words">{v}</dd>
                </div>
              ))}
              {report.status === "voided" && (
                <div className="flex min-w-0 gap-2">
                  <dt className="text-text-muted w-20 shrink-0">作廢原因</dt>
                  <dd className="text-ink min-w-0 break-words">
                    {report.void_reason || "—"}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="border-border rounded-xl border bg-white p-4">
            <h2 className="text-ink mb-2 text-[15px] font-semibold">
              內部備註
            </h2>
            <p className="text-ink text-[14px] whitespace-pre-wrap">
              {report.note || "—"}
            </p>
            <p className="text-text-muted mt-2 text-[13px]">
              不會列印在表單上。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <div className="mb-4">
      <Link
        href={SERVICE_REPORTS_PATH}
        className="text-text-muted hover:text-ink text-[14px]"
      >
        ← 報告單列表
      </Link>
    </div>
  );
}
