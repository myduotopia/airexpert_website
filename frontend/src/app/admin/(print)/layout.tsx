import type { ReactNode } from "react";
import { requireRole } from "@/lib/admin/auth";
import { PrintStyles } from "@/components/erp/print/PrintStyles";

// 後台列印殼層（無側欄）。
// 列印頁網址沿用 spec §7 的 /admin/erp/print/*，但放在獨立 route group (print)，
// 因此不會套到 (protected)/layout.tsx 的 AdminSidebar；兩個 group 之間沒有重複的 URL
// （(protected)/erp 下沒有 print/ 目錄），不會路由衝突。
// 登入檢查與 (protected) 相同（後台人員角色）；模組授權由 (print)/erp/layout.tsx 把關。
// SiteChrome 已讓 /admin/* 不套公開站 Header/Footer。
export default async function AdminPrintLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireRole(["admin", "seo_manager", "office"]);
  return (
    <>
      <PrintStyles />
      {children}
    </>
  );
}
