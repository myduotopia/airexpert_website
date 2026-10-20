import type { ReactNode } from "react";
import { requireAnyModule } from "@/lib/admin/auth";
import { EMPLOYEE_MODULES } from "@/lib/employees/guard";

// 員工主檔殼層（#223、#257）：ERP、機台維護報告單與人事（hr）共用，有任一模組即可進入，
// 否則導回 /admin。只開放 /admin/employees 底下的頁面；ERP／報告單頁面仍各自 requireModule。
// layout 不保護 server action，各 action 開頭另以 ensureEmployeeAccess() 檢查。
export default async function EmployeesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyModule(EMPLOYEE_MODULES);
  return <>{children}</>;
}
