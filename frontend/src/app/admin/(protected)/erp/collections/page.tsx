import { requireModule } from "@/lib/admin/auth";
import {
  PaymentListView,
  type PaymentSearchParams,
} from "./_components/PaymentListView";

export const metadata = { title: "收款 · ERP · 後台" };

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<PaymentSearchParams>;
}) {
  await requireModule("erp");
  return <PaymentListView direction="in" searchParams={await searchParams} />;
}
