import { requireModule } from "@/lib/admin/auth";
import { listVendorOptions } from "@/lib/erp/queries/pickers";
import { ItemForm } from "../_components/ItemForm";
import { MasterTabs } from "../_components/master-ui";
import { defaultItemInput } from "../_lib/rules";

export const metadata = { title: "新增品項 · ERP 基本資料" };

export default async function NewItemPage() {
  await requireModule("erp");
  const vendors = await listVendorOptions();
  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="items" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增品項</h1>
      <ItemForm initial={defaultItemInput("part")} vendors={vendors} />
    </div>
  );
}
