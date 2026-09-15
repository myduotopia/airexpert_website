import type { ReactNode } from "react";
import { requireModule } from "@/lib/admin/auth";

// ERP 殼層：無 erp 模組授權者一律導回 /admin（spec §3.2）。
// 注意：layout 不保護 server action，每個 ERP server action 開頭仍須自行檢查
// （見 lib/erp/guard.ts 的 ensureErp）。
export default async function ErpLayout({ children }: { children: ReactNode }) {
  await requireModule("erp");
  return <>{children}</>;
}
