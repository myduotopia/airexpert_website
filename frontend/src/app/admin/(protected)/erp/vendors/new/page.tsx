import { requireModule } from "@/lib/admin/auth";
import { MasterTabs } from "../../items/_components/master-ui";
import { VendorForm } from "../_components/VendorForm";

export const metadata = { title: "新增廠商 · ERP 基本資料" };

export default async function NewVendorPage() {
  await requireModule("erp");
  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="vendors" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增廠商</h1>
      <VendorForm
        initial={{
          code: "",
          name: "",
          tax_id: "",
          contact_person: "",
          phone: "",
          fax: "",
          email: "",
          address: "",
          currency: "TWD",
          payment_terms: "",
          active: true,
          note: "",
        }}
      />
    </div>
  );
}
