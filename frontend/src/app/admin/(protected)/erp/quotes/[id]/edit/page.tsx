import { requireModule } from "@/lib/admin/auth";
import { SalesDocEditPage } from "../../../sales/_components/SalesDocFormPage";

export const metadata = { title: "編輯報價單 · ERP" };

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocEditPage docType="Q" id={id} />;
}
