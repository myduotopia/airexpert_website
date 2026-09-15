import { requireModule } from "@/lib/admin/auth";
import { SalesDocDetail } from "../../sales/_components/SalesDocDetail";

export const metadata = { title: "報價單 · ERP" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <SalesDocDetail docType="Q" id={id} />;
}
