import type { ReactNode } from "react";
import { requireModule } from "@/lib/admin/auth";

// 報告單列印殼層：與 (protected)/service-reports/layout.tsx 相同，無 service_report 授權者導回 /admin。
// 後台人員角色檢查由上層 (print)/layout.tsx 負責。
export default async function ServiceReportPrintLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModule("service_report");
  return <>{children}</>;
}
