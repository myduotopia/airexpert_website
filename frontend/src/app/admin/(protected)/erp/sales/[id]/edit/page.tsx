import { requireModule } from "@/lib/admin/auth";
import { SalesDocEditPage } from "../../_components/SalesDocFormPage";

export const metadata = { title: "編輯銷貨單 · ERP" };

export default async function EditSalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocEditPage docType="S" id={id} />;
}
