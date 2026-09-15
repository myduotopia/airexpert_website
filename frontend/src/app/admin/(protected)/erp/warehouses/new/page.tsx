import { requireModule } from "@/lib/admin/auth";
import { MasterTabs } from "../../items/_components/master-ui";
import { WarehouseForm } from "../_components/WarehouseForm";

export const metadata = { title: "新增倉庫 · ERP 基本資料" };

export default async function NewWarehousePage() {
  await requireModule("erp");
  return (
    <div className="mx-auto max-w-[800px]">
      <MasterTabs active="warehouses" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增倉庫</h1>
      <WarehouseForm
        initial={{
          code: "",
          name: "",
          is_default: false,
          active: true,
          note: "",
        }}
      />
    </div>
  );
}
