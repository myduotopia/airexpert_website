import type { ReactNode } from "react";
import { requireAnyModule } from "@/lib/admin/auth";

// 員工主檔殼層（#223）：ERP 與機台維護報告單共用，有 erp 或 service_report 任一模組即可進入，
// 否則導回 /admin。layout 不保護 server action，各 action 開頭另以 ensureEmployeeAccess() 檢查。
export default async function EmployeesLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAnyModule(["erp", "service_report"]);
  return <>{children}</>;
}
