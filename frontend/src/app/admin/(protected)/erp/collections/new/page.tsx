import { requireModule } from "@/lib/admin/auth";
import { PaymentNewView } from "../_components/PaymentNewView";

export const metadata = { title: "新增收款 · ERP · 後台" };

export default async function NewCollectionPage() {
  await requireModule("erp");
  return <PaymentNewView direction="in" />;
}
