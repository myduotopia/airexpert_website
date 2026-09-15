import { requireModule } from "@/lib/admin/auth";
import { SalesDocDetail } from "../../sales/_components/SalesDocDetail";

export const metadata = { title: "銷退單 · ERP" };

export default async function SalesReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocDetail docType="SR" id={id} />;
}
