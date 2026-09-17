import type { ReactNode } from "react";
import { requireModule } from "@/lib/admin/auth";

// 機台維護報告單殼層：無 service_report 模組授權者一律導回 /admin（spec §3.2）。
// 注意：layout 不保護 server action，每個 action 開頭仍須自行檢查
// （見 lib/service-report/guard.ts 的 ensureServiceReport）。
export default async function ServiceReportLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModule("service_report");
  return <>{children}</>;
}
