// 編輯保養方案：基本資料 + 階段編輯器。
// 用 listPlansWithStages 一次拿到方案、階段與「套用機台數」（刪除確認要用）。
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { listPlansWithStages } from "@/lib/service-report/plan/queries";
import { PlanForm } from "../_components/PlanForm";
import { PlanErrorAlert, PlanHeader, PlanTabs } from "../_components/plan-ui";

export const metadata = { title: "編輯保養方案 · 機台維護報告單" };

export default async function EditServicePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("service_report");
  const { id } = await params;
  const res = await listPlansWithStages();

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-[900px]">
        <PlanTabs active="plans" />
        <PlanHeader title="編輯保養方案" />
        <PlanErrorAlert message={res.error} />
      </div>
    );
  }

  const plan = res.data.find((p) => p.id === id);
  if (!plan) notFound();

  return (
    <div className="mx-auto max-w-[900px]">
      <PlanTabs active="plans" />
      <PlanHeader
        title={plan.name}
        description={
          plan.machine_count > 0
            ? `目前有 ${plan.machine_count} 台機台套用此方案（其中 ${plan.override_machine_count} 台為逐台指定）。`
            : "目前沒有機台套用此方案。"
        }
      />
      <PlanForm plan={plan} machineCount={plan.machine_count} />
    </div>
  );
}
