// 機台對應（spec §6）：未封存空壓機清單（客戶、機台、馬力、目前方案與來源、
// 目前時數與抄表日），每列可逐台指定方案或改回自動比對；馬力同時符合多個方案時標示衝突。
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { listMachinePlanRows } from "@/lib/service-report/plan/queries";
import { PLAN_MATCH_SOURCE_LABELS } from "@/lib/service-report/plan/types";
import { MachinePlanSelect } from "../_components/MachinePlanSelect";
import { planConflictText } from "../_components/plan-form-state";
import {
  PLANS_PATH,
  PLAN_LINK_SECONDARY,
  PlanErrorAlert,
  PlanHeader,
  PlanTabs,
} from "../_components/plan-ui";

export const metadata = { title: "機台對應 · 機台維護報告單" };

export default async function MachinePlansPage() {
  await requireModule("service_report");
  const res = await listMachinePlanRows();
  const rows = res.ok ? res.data.rows : [];
  const plans = res.ok ? res.data.plans : [];

  return (
    <div className="mx-auto max-w-[1200px]">
      <PlanTabs active="machines" />
      <PlanHeader
        title="機台對應"
        description="未封存的空壓機；預設依馬力自動比對方案，需要時可逐台指定（覆寫比對結果）。"
        actions={
          <Link href={PLANS_PATH} className={PLAN_LINK_SECONDARY}>
            管理方案
          </Link>
        }
      />

      {!res.ok && <PlanErrorAlert message={res.error} />}

      {res.ok && rows.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-10 text-center text-[14px]">
          沒有未封存的空壓機保養卡，因此沒有可對應的機台。
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[980px] text-left text-[14px]">
            <thead className="bg-surface-muted text-text-muted text-[13px]">
              <tr>
                <th className="px-4 py-3 font-medium">客戶</th>
                <th className="px-4 py-3 font-medium">機台</th>
                <th className="px-4 py-3 font-medium">馬力</th>
                <th className="px-4 py-3 font-medium">目前方案</th>
                <th className="px-4 py-3 font-medium">目前時數</th>
                <th className="px-4 py-3 font-medium">指定方案</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const conflict = planConflictText(m.conflicts);
                return (
                  <tr
                    key={m.machine_id}
                    className="border-border border-t align-top"
                  >
                    <td className="px-4 py-3">{m.customer_name}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink">{m.machine_label}</span>
                      {m.model && (
                        <span className="text-text-muted block text-[12px]">
                          {m.model}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{m.horsepower || "—"}</td>
                    <td className="px-4 py-3">
                      {m.plan_name ? (
                        <>
                          <span className="text-ink">{m.plan_name}</span>
                          {m.plan_source && (
                            <span className="text-text-muted block text-[12px]">
                              {PLAN_MATCH_SOURCE_LABELS[m.plan_source]}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-text-muted">無方案</span>
                      )}
                      {conflict && (
                        <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-700">
                          {conflict}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.latest_hours === null ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <>
                          <span className="tabular-nums">
                            {m.latest_hours.toLocaleString("en-US")} 小時
                          </span>
                          <span className="text-text-muted block text-[12px]">
                            {rocDate(m.latest_date)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <MachinePlanSelect
                        machineId={m.machine_id}
                        machineLabel={`${m.customer_name} ${m.machine_label}`}
                        overridePlanId={m.override_plan_id}
                        plans={plans}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {res.ok && plans.length === 0 && rows.length > 0 && (
        <p className="text-text-muted mt-3 text-[13px]">
          尚未建立任何保養方案，請先到「方案」頁新增。
        </p>
      )}
    </div>
  );
}
