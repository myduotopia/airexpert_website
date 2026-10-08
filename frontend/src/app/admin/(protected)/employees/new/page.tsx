import { emptyEmployeeInput } from "@/lib/employees/normalize";
import { EmployeeForm } from "../_components/EmployeeForm";
import { EmployeesTabs } from "../_components/EmployeesTabs";

export const metadata = { title: "新增員工 · 後台" };

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-[800px]">
      <EmployeesTabs />
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增員工</h1>
      <EmployeeForm initial={emptyEmployeeInput()} />
    </div>
  );
}
