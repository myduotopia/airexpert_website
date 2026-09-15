import { requireModule } from "@/lib/admin/auth";
import { StockDocEditPage } from "../../../inventory/_components/StockDocPages";

export const metadata = { title: "編輯盤點調整單 · ERP · 後台" };

export default async function EditAdjustmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <StockDocEditPage docType="A" id={id} />;
}
