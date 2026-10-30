import { notFound } from "next/navigation";
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import { tryListEmployeeOptions } from "@/lib/employees/queries";
import { listStagesForMachine } from "@/lib/service-report/plan/queries";
import {
  getReport,
  listCustomerOptions,
  listMachineOptions,
  listReportTechnicians,
} from "@/lib/service-report/queries";
import { STATUS_LABELS } from "@/lib/service-report/types";
import { formStateFromReport } from "@/components/service-report/form-state";
import { PhotoBackfillEditor } from "@/components/service-report/PhotoBackfillEditor";
import { ReportForm } from "@/components/service-report/ReportForm";
import { canPhotoBackfill } from "@/lib/service-report/photo-extract";
import { nextReportNoAction, saveReportAction } from "../../actions";
import { recognizeReportPhotosAction } from "../../photo-actions";
import { listMachineStagesAction } from "../../stage-actions";

export const metadata = { title: "編輯機台維護報告單 · 後台" };

// 編輯頁：與開單頁同一個 ReportForm；作廢後唯讀（不進表單，導回詳情）。
// ?photo=1（詳情頁「拍照辨識回填」，#280）：已列印的報告單先拍照辨識，結果預填同一個 ReportForm。
export default async function EditServiceReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string | string[] }>;
}) {
  await requireModule("service_report");
  const { id } = await params;
  const { photo } = await searchParams;

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

  const [customers, machines, branding, stagesRes, employees, technicians] =
    await Promise.all([
      listCustomerOptions(),
      listMachineOptions(),
      getBranding(),
      report.machine_id
        ? listStagesForMachine(report.machine_id)
        : Promise.resolve(null),
      tryListEmployeeOptions(),
      listReportTechnicians(report.id),
    ]);
  const loadError = !customers.ok
    ? customers.error
    : !machines.ok
      ? machines.error
      : !employees.ok
        ? employees.error
        : null;
  // 技師列讀不到時不可進表單：儲存會以「只有主技師」覆蓋既有的協同技師。
  if (!technicians.ok) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
      >
        讀取報告單技師失敗：{technicians.error}（請重新整理頁面後再試）
      </div>
    );
  }
  const stages = stagesRes?.ok ? stagesRes.data : null;
  const photoParam = Array.isArray(photo) ? photo[0] : photo;
  const photoMode = photoParam === "1" && canPhotoBackfill(report.status);
  const formProps = {
    reportId: report.id,
    initial: formStateFromReport(report, technicians.data),
    customers: customers.ok ? customers.data : [],
    machines: machines.ok ? machines.data : [],
    employees: employees.ok ? employees.data : [],
    status: report.status,
    printed: report.print_count > 0,
    logoUrl: branding.logo_url,
    onSave: saveReportAction,
    onReserveNo: report.print_count > 0 ? undefined : nextReportNoAction,
    stages,
    onLoadStages: listMachineStagesAction,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-ink text-[24px] font-bold">
          {photoMode ? "拍照辨識回填" : "編輯報告單"} {report.report_no}
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
          讀取客戶／機台／員工清單失敗：{loadError}（請重新整理頁面後再試）
        </div>
      )}
      {photoMode ? (
        <PhotoBackfillEditor
          {...formProps}
          reportId={report.id}
          reportNo={report.report_no}
          onRecognize={recognizeReportPhotosAction}
          plainEditHref={`/admin/service-reports/${report.id}/edit`}
        />
      ) : (
        <ReportForm {...formProps} />
      )}
    </div>
  );
}
