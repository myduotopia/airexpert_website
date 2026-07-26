import { requireRole } from "@/lib/admin/auth";
import { CardBasicFields } from "@/components/admin/maintenance/CardBasicForm";
import { createMachineAction } from "../actions";

export const metadata = { title: "新增保養卡 · 後台" };

export default async function NewMachinePage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增保養卡</h1>
      <form action={createMachineAction} className="flex flex-col gap-6">
        <CardBasicFields />
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white"
        >
          建立
        </button>
      </form>
    </div>
  );
}
