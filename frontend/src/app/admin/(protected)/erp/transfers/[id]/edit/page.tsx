import { requireModule } from "@/lib/admin/auth";
import { StockDocEditPage } from "../../../inventory/_components/StockDocPages";

export const metadata = { title: "編輯調撥單 · ERP · 後台" };

export default async function EditTransferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <StockDocEditPage docType="T" id={id} />;
}
