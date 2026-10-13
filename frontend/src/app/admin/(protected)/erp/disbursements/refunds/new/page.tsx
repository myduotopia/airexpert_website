import { requireModule } from "@/lib/admin/auth";
import { RefundNewView } from "../../../collections/_components/RefundNewView";

export const metadata = { title: "廠商退款 · ERP · 後台" };

export default async function NewVendorRefundPage() {
  await requireModule("erp");
  return <RefundNewView direction="out" />;
}
