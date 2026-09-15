import type { ReactNode } from "react";
import { requireModule } from "@/lib/admin/auth";

// ERP 列印殼層：與 (protected)/erp/layout.tsx 相同，無 erp 模組授權者導回 /admin（spec §3.2）。
export default async function ErpPrintLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModule("erp");
  return <>{children}</>;
}
