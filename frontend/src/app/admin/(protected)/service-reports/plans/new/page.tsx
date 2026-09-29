// 新增保養方案。
import { requireModule } from "@/lib/admin/auth";
import { PlanForm } from "../_components/PlanForm";
import { PlanHeader, PlanTabs } from "../_components/plan-ui";

export const metadata = { title: "新增保養方案 · 機台維護報告單" };

export default async function NewServicePlanPage() {
  await requireModule("service_report");
  return (
    <div className="mx-auto max-w-[900px]">
      <PlanTabs active="plans" />
      <PlanHeader
        title="新增保養方案"
        description="先填方案名稱與適用馬力，再逐一加上階段（時數、名稱與料件）。"
      />
      <PlanForm />
    </div>
  );
}
