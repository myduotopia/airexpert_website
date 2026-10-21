import type { ReactNode } from "react";
import { CONTENT_ROLES, requireRole } from "@/lib/admin/auth";

// 最新消息殼層（#259）：內容團隊（admin / seo_manager）才可進。
// 主要為了 /admin/news/ai（client component，無法在頁面內守門）；其餘 server 頁面另於頁內再守一次。
// server action 不受 layout 保護，各 action 開頭仍以 requireAdmin() 檢查。
export default async function AdminNewsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(CONTENT_ROLES);
  return <>{children}</>;
}
