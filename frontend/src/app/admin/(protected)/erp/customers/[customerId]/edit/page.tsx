import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getErpCustomer } from "@/lib/erp/queries/master-data";
import { MasterTabs } from "../../../items/_components/master-ui";
import { CustomerForm } from "../../_components/CustomerForm";

export const metadata = { title: "編輯客戶 · ERP 基本資料" };

export default async function EditErpCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireModule("erp");
  const { customerId } = await params;
  const c = await getErpCustomer(customerId);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="customers" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯客戶</h1>
      <CustomerForm
        customerId={customerId}
        initial={{
          code: c.code ?? "",
          name: c.name,
          contact_person: c.contact_person ?? "",
          phone: c.phone ?? "",
          address: c.address ?? "",
          note: c.note ?? "",
          tax_id: c.tax_id ?? "",
          invoice_title: c.invoice_title ?? "",
          delivery_address: c.delivery_address ?? "",
          payment_terms: c.payment_terms ?? "",
          sales_rep: c.sales_rep ?? "",
          erp_active: c.erp_active,
        }}
      />
    </div>
  );
}
