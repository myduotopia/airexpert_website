import { notFound } from "next/navigation";
import { getEmployee } from "@/lib/employees/queries";
import { employeeInputFromRow, isEmployeeId } from "@/lib/employees/normalize";
import { ConfirmDeleteButton } from "../../../erp/items/_components/ConfirmDeleteButton";
import { EmployeeForm } from "../../_components/EmployeeForm";
import { EmployeesTabs } from "../../_components/EmployeesTabs";
import { deleteEmployeeAction } from "../../actions";

export const metadata = { title: "編輯員工 · 後台" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  if (!isEmployeeId(employeeId)) notFound();
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  return (
    <div className="mx-auto max-w-[800px]">
      <EmployeesTabs />
      <h1 className="text-ink mb-6 text-[24px] font-bold">
        編輯員工
        <span className="text-text-muted ml-2 text-[16px] font-normal">
          {employee.name}
        </span>
      </h1>
      <EmployeeForm
        employeeId={employeeId}
        initial={employeeInputFromRow(employee)}
      />

      <section className="border-border mt-10 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-[16px] font-bold">刪除員工</h2>
        <p className="text-text-muted mt-1 mb-3 text-[14px]">
          只有尚未被客戶、單據或維護報告單使用的員工可以刪除（例如建錯的資料）；
          已使用的員工請取消勾選「在職」停用，既有資料照常顯示。
        </p>
        <ConfirmDeleteButton
          id={employeeId}
          action={deleteEmployeeAction}
          confirmText={`確定刪除員工「${employee.name}」？`}
          redirectTo="/admin/employees"
        />
      </section>
    </div>
  );
}
