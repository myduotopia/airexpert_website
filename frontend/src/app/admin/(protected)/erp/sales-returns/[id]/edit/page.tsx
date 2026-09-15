import { requireModule } from "@/lib/admin/auth";
import { SalesDocEditPage } from "../../../sales/_components/SalesDocFormPage";

export const metadata = { title: "編輯銷退單 · ERP" };

export default async function EditSalesReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocEditPage docType="SR" id={id} />;
}
