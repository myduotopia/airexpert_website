import { requireModule } from "@/lib/admin/auth";
import { StockDocNewPage } from "../../inventory/_components/StockDocPages";

export const metadata = { title: "新增調撥單 · ERP · 後台" };

export default async function NewTransferPage() {
  await requireModule("erp");
  return <StockDocNewPage docType="T" />;
}
