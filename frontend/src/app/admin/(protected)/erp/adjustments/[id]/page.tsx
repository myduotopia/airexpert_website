import { requireModule } from "@/lib/admin/auth";
import { StockDocDetailPage } from "../../inventory/_components/StockDocPages";

export const metadata = { title: "盤點調整單 · ERP · 後台" };

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <StockDocDetailPage docType="A" id={id} />;
}
