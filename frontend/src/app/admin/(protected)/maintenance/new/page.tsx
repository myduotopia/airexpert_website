import { requireRole } from "@/lib/admin/auth";
import { NewMachineForm } from "@/components/admin/maintenance/NewMachineForm";

export const metadata = { title: "新增保養卡 · 後台" };

export default async function NewMachinePage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增保養卡</h1>
      <NewMachineForm />
    </div>
  );
}
