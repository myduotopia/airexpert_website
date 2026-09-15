import { requireModule } from "@/lib/admin/auth";
import { SalesDocDetail } from "../_components/SalesDocDetail";

export const metadata = { title: "銷貨單 · ERP" };

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocDetail docType="S" id={id} />;
}
