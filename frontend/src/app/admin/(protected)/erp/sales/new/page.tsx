import { requireModule } from "@/lib/admin/auth";
import { SalesDocNewPage } from "../_components/SalesDocFormPage";

export const metadata = { title: "新增銷貨單 · ERP" };

export default async function NewSalePage() {
  await requireModule("erp");
  return <SalesDocNewPage docType="S" />;
}
