import { requireRole } from "@/lib/admin/auth";
import { NewMachineForm } from "@/components/admin/maintenance/NewMachineForm";
import { parseCardType } from "@/lib/admin/maintenance-normalize";

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
      <NewMachineForm cardType={cardType} />
    </div>
  );
}
