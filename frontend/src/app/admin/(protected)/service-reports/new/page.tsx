import { requireModule } from "@/lib/admin/auth";
import { taipeiTodayYmd } from "@/lib/analytics/ranges";
import { getBranding } from "@/lib/data/site";
import {
  listCustomerOptions,
  listMachineOptions,
} from "@/lib/service-report/queries";
import { emptyFormState } from "@/components/service-report/form-state";
import { ReportForm } from "@/components/service-report/ReportForm";
import { nextReportNoAction, saveReportAction } from "../actions";

export const metadata = { title: "開立機台維護報告單 · 後台" };

// 開單頁：客戶／機台選單一次載入（client 端搜尋與依客戶篩選）。
// 不在此呼叫 nextReportNoAction — 開頁即取號會吃掉流水號，單號留空由 saveReportAction 自動編。
export default async function NewServiceReportPage() {
  await requireModule("service_report");

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
      <h1 className="text-ink text-[24px] font-bold">開立機台維護報告單</h1>
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          讀取客戶／機台清單失敗：{loadError}（仍可手動填寫）
        </div>
      )}
      <ReportForm
        initial={emptyFormState(taipeiTodayYmd())}
        customers={customers.ok ? customers.data : []}
        machines={machines.ok ? machines.data : []}
        logoUrl={branding.logo_url}
        onSave={saveReportAction}
        onReserveNo={nextReportNoAction}
      />
    </div>
  );
}
