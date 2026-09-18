import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import { getReport } from "@/lib/service-report/queries";
import { sheetDataFromReport } from "@/components/service-report/form-state";
import { SheetPrintView } from "@/components/service-report/SheetPrintView";
import { recordPrintAction } from "../../../../(protected)/service-reports/actions";

export const metadata = { title: "報告單列印 · 後台" };

const SR_PATH = "/admin/service-reports";

// 報告單列印頁（無側欄）：整張 A4 ReportSheet + 工具列（校正、可列印範圍警示、列印）。
// 按「列印」會先 recordPrintAction（draft → printed、列印次數 +1），成功才 window.print()。
export default async function ServiceReportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // layout 已守門；頁面再檢查一次（React cache 去重，不多查）。
  await requireModule("service_report");
  const { id } = await params;

  const found = await getReport(id);
  if (!found.ok) {
    return (
      <div className="mx-auto max-w-[560px] p-8">
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          讀取報告單失敗：{found.error}
        </div>
      </div>
    );
  }
  const report = found.data;
  if (!report) notFound();

  const branding = await getBranding();
  const voided = report.status === "voided";

  return (
    <SheetPrintView
      title={`機台維護報告單 ${report.report_no}`}
      backHref={`${SR_PATH}/${report.id}`}
      data={sheetDataFromReport(report)}
      logoUrl={branding.logo_url}
      onRecordPrint={recordPrintAction.bind(null, report.id)}
      blockedReason={voided ? "已作廢的報告單不可列印" : null}
      notice={
        voided
          ? { title: "此報告單已作廢，不可列印", detail: report.void_reason }
          : null
      }
    />
  );
}
