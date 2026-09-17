// 後台總覽（/admin）的落地導向 — 純函式（無 server-only 依賴，便於測試）。

import type { AdminModule, AdminRole } from "./auth";
import { navForRole } from "./nav-config";

/** 總覽頁上會以卡片列出的區段（排除總覽本身與網站設定）。 */
export function dashboardSectionsFor(role: AdminRole) {
  return navForRole(role).filter(
    (i) => i.key !== "dashboard" && i.key !== "settings",
  );
}

/**
 * 登入者進入 /admin 時應導向的路徑；null = 留在總覽頁。
 * - office → /admin/maintenance（保養記錄卡是其唯一功能）；
 * - 角色本身沒有任何可見區段（例：erp 角色）時，依模組授權導向：
 *   erp → /admin/erp，否則 service_report → /admin/service-reports。
 * 只在「確實持有」該模組授權時導向：目標 layout 的 requireModule() 缺授權會
 * 導回 /admin，若無條件導向會變成無限轉址。
 */
export function landingPathFor(
  role: AdminRole,
  modules: readonly AdminModule[],
): string | null {
  if (role === "office") return "/admin/maintenance";
  if (dashboardSectionsFor(role).length > 0) return null;
  if (modules.includes("erp")) return "/admin/erp";
  if (modules.includes("service_report")) return "/admin/service-reports";
  return null;
}
