import { requireRole } from "@/lib/admin/auth";
import { CardBasicFields } from "@/components/admin/maintenance/CardBasicForm";
import { ColumnsEditor } from "@/components/admin/maintenance/ColumnsEditor";
import { parseCardType } from "@/lib/admin/maintenance-normalize";
import { createMachineAction } from "../actions";

export const metadata = { title: "新增保養卡 · 後台" };

export default async function NewMachinePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireRole(["office"]);
  const raw = (await searchParams).type;
  // ?type=filter → 乾燥機（過濾系統）卡；其餘一律空壓機卡（與 DB 預設值一致）。
  const cardType = parseCardType(Array.isArray(raw) ? raw[0] : raw);

  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">
        {cardType === "filter" ? "新增過濾系統保養卡" : "新增空壓機保養卡"}
      </h1>
      <form action={createMachineAction} className="flex flex-col gap-6">
        <CardBasicFields cardType={cardType} />
        {cardType === "filter" && <ColumnsEditor />}
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
