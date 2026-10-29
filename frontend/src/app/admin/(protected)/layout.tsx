import type { ReactNode } from "react";
import {
  ADMIN_ROLES,
  requireRole,
  getSessionUser,
  getCurrentModules,
  redirectIfMustChangePassword,
} from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { getReminderBadgeCount } from "@/lib/erp/queries/reminders";

// 後台保護殼層：所有後台角色皆可進；非後台人員由 requireRole() 導向 /admin/login。
// 注意：此層只負責「是否為後台人員」與依角色 + 模組授權渲染側欄；側欄以 navForUser() 隱藏無權項目，
// 但隱藏不等於擋下 —— 每個頁面都必須自己守門（缺守門的頁面會對所有後台角色開放，含 hr 人事）：
//   admin-only（網站設定 / 人員管理 / 聯絡來信 / 首頁 / 活動）→ requireAdmin()；
//   CMS 內容區（商品 / 最新消息 / 服務 / 節能實績）→ requireRole(CONTENT_ROLES)；
//   SEO / 流量分析 → requireRole(['admin','seo_manager'])；保養卡 → requireMaintenanceAccess()（office 或 maintenance 模組）；
//   模組頁（ERP / 維護報告單 / 員工）→ requireModule() / requireAnyModule()。
// 員工帳號（staff，#261）必須先改密碼時，一律導到帳號設定頁（獨立的 (account) route group，不經過本 layout）。
// test/admin-page-guards.test.ts 會靜態掃描所有頁面確認上述守門存在。
// SiteChrome 已讓 /admin/* 不套公開站 Header/Footer，此處提供後台自己的 sidebar 殼層。
export default async function AdminProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const role = await requireRole([...ADMIN_ROLES]);
  await redirectIfMustChangePassword();
  // requireRole 已確保是後台人員；取 session user 的 email 顯示於側欄。
  const user = await getSessionUser();
  const email = user?.email ?? "";
  const modules = await getCurrentModules();
  // ERP「提醒事項」徽章（#274）：逾期＋3 天內到期數；讀取失敗回 null 不影響頁面。
  const reminderCount = modules.includes("erp")
    ? await getReminderBadgeCount()
    : null;

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar
        email={email}
        role={role}
        modules={modules}
        badges={reminderCount ? { "erp-reminders": reminderCount } : {}}
      />
      {/* 行動版：上方留白避開固定漢堡鈕、左右縮排較小；lg 以上恢復原本間距。 */}
      <main className="flex-1 overflow-x-hidden px-4 pt-16 pb-8 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}
