import { requireRole } from "@/lib/admin/auth";
import { RecordFields } from "@/components/admin/maintenance/RecordForm";
import { addRecordAction } from "../../../actions";

export const metadata = { title: "新增維護紀錄 · 後台" };

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const action = addRecordAction.bind(null, machineId);
  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增維護紀錄</h1>
      <form action={action} className="flex flex-col gap-6">
        <RecordFields />
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white"
        >
          儲存
        </button>
      </form>
    </div>
  );
}
