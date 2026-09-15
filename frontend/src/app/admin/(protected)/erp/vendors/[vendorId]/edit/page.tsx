import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getVendor } from "@/lib/erp/queries/master-data";
import { MasterTabs } from "../../../items/_components/master-ui";
import { VendorForm } from "../../_components/VendorForm";

export const metadata = { title: "編輯廠商 · ERP 基本資料" };

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  await requireModule("erp");
  const { vendorId } = await params;
  const v = await getVendor(vendorId);
  if (!v) notFound();

  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="vendors" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯廠商</h1>
      <VendorForm
        vendorId={vendorId}
        initial={{
          code: v.code,
          name: v.name,
          tax_id: v.tax_id ?? "",
          contact_person: v.contact_person ?? "",
          phone: v.phone ?? "",
          fax: v.fax ?? "",
          email: v.email ?? "",
          address: v.address ?? "",
          currency: v.currency,
          payment_terms: v.payment_terms ?? "",
          active: v.active,
          note: v.note ?? "",
        }}
      />
    </div>
  );
}
