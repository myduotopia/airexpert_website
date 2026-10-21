// 後台總覽（/admin）的落地導向 — 純函式（無 server-only 依賴，便於測試）。

import type { AdminModule, AdminRole } from "./auth";
import { navForRole } from "./nav-config";
import { ACCOUNT_SETTINGS_PATH } from "./staff-accounts";

/** 總覽頁上會以卡片列出的區段（排除總覽本身、網站設定與帳號設定）。 */
export function dashboardSectionsFor(role: AdminRole) {
  return navForRole(role).filter(
    (i) => i.key !== "dashboard" && i.key !== "settings" && i.key !== "account",
  );
}

/** 依模組授權決定的落地頁（第一個持有的模組）；都沒有回 null。 */
function moduleLandingPath(modules: readonly AdminModule[]): string | null {
  if (modules.includes("erp")) return "/admin/erp";
  if (modules.includes("service_report")) return "/admin/service-reports";
  if (modules.includes("maintenance")) return "/admin/maintenance";
  if (modules.includes("hr") || modules.includes("employees")) {
    return "/admin/employees";
  }
  return null;
}

/**
 * 登入者進入 /admin 時應導向的路徑；null = 留在總覽頁。
 * - office → /admin/maintenance（保養記錄卡是其唯一功能）；
 * - hr（人事，#259）且持有 hr 模組 → /admin/employees（員工頁是其唯一功能；即使另有其他模組也以員工頁為落地）；
 * - staff（員工，#261）→ 依模組（職位權限）導向；沒有任何模組 → 帳號設定頁（員工帳號一定進得去的頁面）；
 * - 角色本身沒有任何可見區段（例：erp 角色）時，依模組授權導向：
 *   erp → /admin/erp，否則 service_report → /admin/service-reports，否則 maintenance → /admin/maintenance，
 *   否則 hr／employees → /admin/employees。
 * 只在「確實持有」該模組授權時導向：目標 layout 的 requireModule() 缺授權會
 * 導回 /admin，若無條件導向會變成無限轉址。
 * 必改密碼的帳號不會走到這裡（(protected) layout 先導到帳號設定頁；此時 modules 也是空的）。
 */
export function landingPathFor(
  role: AdminRole,
  modules: readonly AdminModule[],
): string | null {
  if (role === "office") return "/admin/maintenance";
  if (role === "hr" && modules.includes("hr")) return "/admin/employees";
  if (role === "staff") {
    return moduleLandingPath(modules) ?? ACCOUNT_SETTINGS_PATH;
  }
  if (dashboardSectionsFor(role).length > 0) return null;
  return moduleLandingPath(modules);
}
