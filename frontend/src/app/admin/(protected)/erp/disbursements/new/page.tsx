import { requireModule } from "@/lib/admin/auth";
import { PaymentNewView } from "../../collections/_components/PaymentNewView";

export const metadata = { title: "新增付款 · ERP · 後台" };

export default async function NewDisbursementPage() {
  await requireModule("erp");
  return <PaymentNewView direction="out" />;
}
