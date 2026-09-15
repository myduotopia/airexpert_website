import { requireModule } from "@/lib/admin/auth";
import { SalesDocNewPage } from "../../sales/_components/SalesDocFormPage";

export const metadata = { title: "新增報價單 · ERP" };

export default async function NewQuotePage() {
  await requireModule("erp");
  return <SalesDocNewPage docType="Q" />;
}
