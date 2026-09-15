import { requireModule } from "@/lib/admin/auth";
import { StockDocNewPage } from "../../inventory/_components/StockDocPages";

export const metadata = { title: "新增盤點調整單 · ERP · 後台" };

export default async function NewAdjustmentPage() {
  await requireModule("erp");
  return <StockDocNewPage docType="A" />;
}
