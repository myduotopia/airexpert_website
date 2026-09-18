import { notFound } from "next/navigation";
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import {
  getReport,
  listCustomerOptions,
  listMachineOptions,
} from "@/lib/service-report/queries";
import { STATUS_LABELS } from "@/lib/service-report/types";
import { formStateFromReport } from "@/components/service-report/form-state";
import { ReportForm } from "@/components/service-report/ReportForm";
import { nextReportNoAction, saveReportAction } from "../../actions";

export const metadata = { title: "編輯機台維護報告單 · 後台" };

// 編輯頁：與開單頁同一個 ReportForm；作廢後唯讀（不進表單，導回詳情）。
export default async function EditServiceReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("service_report");
  const { id } = await params;

  const found = await getReport(id);
  if (!found.ok) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
      >
        讀取報告單失敗：{found.error}
      </div>
    );
  }
  const report = found.data;
  if (!report) notFound();

  if (report.status === "voided") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-ink text-[24px] font-bold">
          報告單 {report.report_no}
        </h1>
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
        >
          <span className="font-semibold">此報告單已作廢，不可編輯</span>
          {report.void_reason ? <span>：{report.void_reason}</span> : null}
        </div>
        <Link
          href={`/admin/service-reports/${report.id}`}
          className="text-primary-deep text-[14px] font-semibold"
        >
          回報告單
        </Link>
      </div>
    );
  }

  const [customers, machines, branding] = await Promise.all([
    listCustomerOptions(),
    listMachineOptions(),
    getBranding(),
  ]);
  const loadError = !customers.ok
    ? customers.error
    : !machines.ok
      ? machines.error
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-ink text-[24px] font-bold">
          編輯報告單 {report.report_no}
        </h1>
        <span className="text-text-muted text-[14px]">
          狀態：{STATUS_LABELS[report.status]}
          {report.print_count > 0 ? `（已列印 ${report.print_count} 次）` : ""}
        </span>
      </div>
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          讀取客戶／機台清單失敗：{loadError}（仍可手動填寫）
        </div>
      )}
      <ReportForm
        reportId={report.id}
        initial={formStateFromReport(report)}
        customers={customers.ok ? customers.data : []}
        machines={machines.ok ? machines.data : []}
        status={report.status}
        printed={report.print_count > 0}
        logoUrl={branding.logo_url}
        onSave={saveReportAction}
        onReserveNo={report.print_count > 0 ? undefined : nextReportNoAction}
      />
    </div>
  );
}
