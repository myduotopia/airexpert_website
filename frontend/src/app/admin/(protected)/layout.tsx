import type { ReactNode } from "react";
import { requireRole, getSessionUser } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

// 後台保護殼層：admin 與 seo_manager 皆可進；其餘由 requireRole() 導向 /admin/login。
// 注意：admin-only 的頁面（網站設定 / 人員管理 / 聯絡來信）各自再以 requireAdmin() 守門，
// 此層只負責「是否為後台人員」與依角色渲染側欄；側欄亦以 navForRole() 隱藏無權項目。
// SiteChrome 已讓 /admin/* 不套公開站 Header/Footer，此處提供後台自己的 sidebar 殼層。
export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const role = await requireRole(["admin", "seo_manager"]);
  // requireRole 已確保是後台人員；取 session user 的 email 顯示於側欄。
  const user = await getSessionUser();
  const email = user?.email ?? "";

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar email={email} role={role} />
      <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
    </div>
  );
}
