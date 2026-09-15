import { requireModule } from "@/lib/admin/auth";
import { PaymentDetailView } from "../../collections/_components/PaymentDetailView";

export const metadata = { title: "付款詳情 · ERP · 後台" };

export default async function DisbursementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("erp");
  const { id } = await params;
  return <PaymentDetailView direction="out" id={id} />;
}
