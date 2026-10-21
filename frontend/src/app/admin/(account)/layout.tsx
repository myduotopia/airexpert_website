import type { ReactNode } from "react";
import {
  ADMIN_ROLES,
  getCurrentModules,
  getSessionUser,
  mustChangePassword,
  requireRole,
} from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

// 帳號設定殼層（#261）：只放 /admin/settings/account（員工帳號改密碼）。
// 獨立成 route group 而不放在 (protected)：(protected) 的根 layout 會把「必須先改密碼」的帳號導到這裡，
// 若同在 (protected) 底下會無限轉址。本層只確認是後台人員並渲染側欄（必改密碼時側欄只有「帳號設定」）；
// 頁面本身另以 requireRole(['staff']) 守門。與 (protected)/settings（網站設定，admin only）網址不衝突。
export default async function AdminAccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const role = await requireRole([...ADMIN_ROLES]);
  const user = await getSessionUser();
  const [modules, locked] = await Promise.all([
    getCurrentModules(),
    mustChangePassword(),
  ]);

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar
        email={user?.email ?? ""}
        role={role}
        modules={modules}
        mustChangePassword={locked}
      />
      <main className="flex-1 overflow-x-hidden px-4 pt-16 pb-8 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}
