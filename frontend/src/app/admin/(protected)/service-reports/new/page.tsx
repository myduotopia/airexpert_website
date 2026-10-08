import { requireModule } from "@/lib/admin/auth";
import { taipeiTodayYmd } from "@/lib/analytics/ranges";
import { getBranding } from "@/lib/data/site";
import { tryListEmployeeOptions } from "@/lib/employees/queries";
import { listStagesForMachine } from "@/lib/service-report/plan/queries";
import type { PlanPart } from "@/lib/service-report/plan/types";
import {
  listCustomerOptions,
  listMachineOptions,
} from "@/lib/service-report/queries";
import { isUuid } from "@/lib/service-report/validate";
import {
  applyCustomerPrefill,
  applyMachinePrefill,
  applyStageToState,
  emptyFormState,
  type ReportFormState,
} from "@/components/service-report/form-state";
import { ReportForm } from "@/components/service-report/ReportForm";
import { nextReportNoAction, saveReportAction } from "../actions";
import { listMachineStagesAction } from "../stage-actions";

export const metadata = { title: "開立機台維護報告單 · 後台" };

/** 從提醒區塊 / 保養方案頁帶過來的參數（spec §6.2）。 */
interface NewReportSearchParams {
  machineId?: string | string[];
  stageId?: string | string[];
  /** 循環里程碑（如 22000）；省略時退回該階段在這一輪的里程碑。 */
  milestone?: string | string[];
}

function uuidParam(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && isUuid(s) ? s : null;
}

function numberParam(v: string | string[] | undefined): number | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string" || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// 開單頁：客戶／機台選單一次載入（client 端搜尋與依客戶篩選）。
// 不在此呼叫 nextReportNoAction — 開頁即取號會吃掉流水號，單號留空由 saveReportAction 自動編。
// ?machineId= 預選機台並帶入欄位；?stageId=&milestone= 進頁即套用該里程碑的料件。
export default async function NewServiceReportPage({
  searchParams,
}: {
  searchParams: Promise<NewReportSearchParams>;
}) {
  await requireModule("service_report");
  const sp = await searchParams;
  const machineId = uuidParam(sp.machineId);
  const stageId = uuidParam(sp.stageId);
  const milestone = numberParam(sp.milestone);

  const [customers, machines, branding, stagesRes, employees] =
    await Promise.all([
      listCustomerOptions(),
      listMachineOptions(),
      getBranding(),
      machineId ? listStagesForMachine(machineId) : Promise.resolve(null),
      tryListEmployeeOptions(),
    ]);
  const loadError = !customers.ok
    ? customers.error
    : !machines.ok
      ? machines.error
      : !employees.ok
        ? employees.error
        : null;
  const stageError = stagesRes && !stagesRes.ok ? stagesRes.error : null;
  const stages = stagesRes?.ok ? stagesRes.data : null;

  let initial: ReportFormState = emptyFormState(taipeiTodayYmd());
  let initialOverflow: PlanPart[] | undefined;

  const machine =
    machineId && machines.ok
      ? (machines.data.find((m) => m.id === machineId) ?? null)
      : null;
  if (machine) {
    const customer = customers.ok
      ? (customers.data.find((c) => c.id === machine.customer_id) ?? null)
      : null;
    if (customer) initial = applyCustomerPrefill(initial, customer, true);
    initial = applyMachinePrefill(initial, machine, customer);
  }

  // 里程碑對得起來才套用；沒帶 milestone（舊連結）就取該階段在這一輪的里程碑。
  const target = stageId
    ? (stages?.milestones.find(
        (m) =>
          m.stage.id === stageId &&
          (milestone === null || m.milestone === milestone),
      ) ?? null)
    : null;
  if (target) {
    // 剛開的空表單沒有已填料件，直接覆蓋（等同只填空白列）。
    const applied = applyStageToState(initial, target, { overwrite: true });
    initial = applied.state;
    initialOverflow = applied.overflow;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-[24px] font-bold">開立機台維護報告單</h1>
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          讀取客戶／機台／員工清單失敗：{loadError}（仍可手動填寫）
        </div>
      )}
      {stageError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
        >
          讀取保養方案失敗：{stageError}（料件請手動填寫）
        </div>
      )}
      <ReportForm
        initial={initial}
        customers={customers.ok ? customers.data : []}
        machines={machines.ok ? machines.data : []}
        employees={employees.ok ? employees.data : []}
        logoUrl={branding.logo_url}
        onSave={saveReportAction}
        onReserveNo={nextReportNoAction}
        stages={stages}
        initialOverflow={initialOverflow}
        onLoadStages={listMachineStagesAction}
      />
    </div>
  );
}
