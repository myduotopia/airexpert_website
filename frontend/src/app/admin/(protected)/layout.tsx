import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

// 後台保護殼層：非 admin 由 requireAdmin() 導向 /admin/login。
// SiteChrome 已讓 /admin/* 不套公開站 Header/Footer，此處提供後台自己的 sidebar 殼層。
export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar email={admin.email ?? ""} />
      <main className="flex-1 overflow-x-hidden px-8 py-7">{children}</main>
    </div>
  );
}
