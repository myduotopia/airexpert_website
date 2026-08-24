import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachineCardContext } from "@/lib/admin/maintenance";
import { NewRecordForm } from "@/components/admin/maintenance/NewRecordForm";

export const metadata = { title: "新增維護紀錄 · 後台" };

export default async function NewRecordPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const ctx = await getMachineCardContext(machineId);
  if (!ctx) notFound();
  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增維護紀錄</h1>
      {/* 送出 / 錯誤顯示 / 導頁都在 client 端；不把 server action 直接綁到 <form>，
          否則失敗時會 throw 成通用錯誤頁、整列輸入消失（#168）。 */}
      <NewRecordForm
        machineId={machineId}
        cardType={ctx.card_type}
        columns={ctx.columns.map((c) => ({ id: c.id, label: c.label }))}
      />
    </div>
  );
}
