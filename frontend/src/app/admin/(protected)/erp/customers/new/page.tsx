import { requireModule } from "@/lib/admin/auth";
import { emptyCustomerInput } from "@/lib/erp/quick-create";
import { listEmployeeOptions } from "@/lib/employees/queries";
import { MasterTabs } from "../../items/_components/master-ui";
import { CustomerForm } from "../_components/CustomerForm";

export const metadata = { title: "新增客戶 · ERP 基本資料" };

export default async function NewCustomerPage() {
  await requireModule("erp");
  const employees = await listEmployeeOptions();
  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="customers" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增客戶</h1>
      <CustomerForm initial={emptyCustomerInput()} employees={employees} />
    </div>
  );
}
