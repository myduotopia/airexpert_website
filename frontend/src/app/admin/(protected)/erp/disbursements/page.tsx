import { requireModule } from "@/lib/admin/auth";
import {
  PaymentListView,
  type PaymentSearchParams,
} from "../collections/_components/PaymentListView";

export const metadata = { title: "付款 · ERP · 後台" };

export default async function DisbursementsPage({
  searchParams,
}: {
  searchParams: Promise<PaymentSearchParams>;
}) {
  await requireModule("erp");
  return <PaymentListView direction="out" searchParams={await searchParams} />;
}
