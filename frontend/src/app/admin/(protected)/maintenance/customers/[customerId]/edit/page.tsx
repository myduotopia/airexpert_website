import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getCustomer } from "@/lib/admin/maintenance";
import { EditCustomerForm } from "@/components/admin/maintenance/EditCustomerForm";

export const metadata = { title: "編輯客戶 · 後台" };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireRole(["office"]);
  const { customerId } = await params;
  const data = await getCustomer(customerId);
  if (!data) notFound();
  const { customer } = data;

  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯客戶</h1>
      <EditCustomerForm
        customerId={customerId}
        values={{
          code: customer.code ?? undefined,
          name: customer.name ?? undefined,
          contact_person: customer.contact_person ?? undefined,
          phone: customer.phone ?? undefined,
          address: customer.address ?? undefined,
          note: customer.note ?? undefined,
        }}
      />
    </div>
  );
}
