// 保養方案列表（spec §6）：名稱、適用馬力、階段數、套用機台數、啟用狀態；
// 新增／編輯／刪除（刪除前確認並提示套用機台數）。
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listPlansWithStages } from "@/lib/service-report/plan/queries";
import { stageLabel } from "@/lib/service-report/plan/stage";
import { PlanDeleteButton } from "./_components/PlanDeleteButton";
import {
  HpTagChips,
  PLANS_PATH,
  PLAN_LINK_PRIMARY,
  PLAN_TEXT_LINK,
  PlanActiveBadge,
  PlanErrorAlert,
  PlanHeader,
  PlanTabs,
} from "./_components/plan-ui";

export const metadata = { title: "保養方案 · 機台維護報告單" };

export default async function ServicePlansPage() {
  await requireModule("service_report");
  const res = await listPlansWithStages();
  const rows = res.ok ? res.data : [];

  return (
    <div className="mx-auto max-w-[1100px]">
      <PlanTabs active="plans" />
      <PlanHeader
        title="保養方案"
        description="階段保養設定；開單時會依累計時數自動帶入該階段的料件。未填適用馬力的方案為「通用預設」，套用到所有沒有其他對應的空壓機。"
        actions={
          <Link href={`${PLANS_PATH}/new`} className={PLAN_LINK_PRIMARY}>
            新增方案
          </Link>
        }
      />

      {!res.ok && <PlanErrorAlert message={res.error} />}

      {res.ok && rows.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-10 text-center text-[14px]">
          尚未建立任何保養方案。請點右上角「新增方案」，例如「20HP
          空壓機」，並設定 2000／4000／6000 小時三個階段與料件。
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[860px] text-left text-[14px]">
            <thead className="bg-surface-muted text-text-muted text-[13px]">
              <tr>
                <th className="px-4 py-3 font-medium">方案名稱</th>
                <th className="px-4 py-3 font-medium">適用馬力</th>
                <th className="px-4 py-3 font-medium">階段</th>
                <th className="px-4 py-3 text-right font-medium">階段數</th>
                <th className="px-4 py-3 text-right font-medium">套用機台</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-border border-t align-top">
                  <td className="px-4 py-3">
                    <Link
                      href={`${PLANS_PATH}/${p.id}`}
                      className={PLAN_TEXT_LINK}
                    >
                      {p.name}
                    </Link>
                    {p.note && (
                      <span className="text-text-muted mt-0.5 block text-[12px]">
                        {p.note}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <HpTagChips tags={p.hp_tags ?? []} />
                  </td>
                  <td className="text-text-muted px-4 py-3 text-[13px]">
                    {p.stages.length === 0
                      ? "尚未設定階段"
                      : p.stages.map((s) => stageLabel(s)).join("、")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.stages.length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.machine_count}
                    {p.override_machine_count > 0 && (
                      <span className="text-text-muted block text-[12px]">
                        含指定 {p.override_machine_count}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PlanActiveBadge active={p.active} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start justify-end gap-2">
                      <Link
                        href={`${PLANS_PATH}/${p.id}`}
                        className="border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold"
                      >
                        編輯
                      </Link>
                      <PlanDeleteButton
                        id={p.id}
                        name={p.name}
                        machineCount={p.machine_count}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
