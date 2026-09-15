import { requireModule } from "@/lib/admin/auth";
import { PaymentDetailView } from "../_components/PaymentDetailView";

export const metadata = { title: "收款詳情 · ERP · 後台" };

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <PaymentDetailView direction="in" id={id} />;
}
