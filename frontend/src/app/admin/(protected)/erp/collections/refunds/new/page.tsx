import { requireModule } from "@/lib/admin/auth";
import { RefundNewView } from "../../_components/RefundNewView";

export const metadata = { title: "退款給客戶 · ERP · 後台" };

export default async function NewCustomerRefundPage() {
  await requireModule("erp");
  return <RefundNewView direction="in" />;
}
