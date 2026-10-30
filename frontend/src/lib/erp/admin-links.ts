// ERP 頁面連到保養卡／維護報告單的連結（#283）。純函式，client / server 皆可用。
//
// 保養卡（/admin/maintenance*）需 hasMaintenanceAccess()（office 角色或 maintenance 模組）；
// 維護報告單（/admin/service-reports*）需 service_report 模組。沒有權限的人點了會被導回總覽、
// 畫面上沒有任何說明，所以 ERP 頁面由 server 先算好權限（布林值），沒有權限就改顯示純文字。

/** 沒有保養卡權限時，取代整個連結／按鈕的提示文字。 */
export const MAINTENANCE_PERMISSION_HINT = "需保養卡權限";

export function maintenanceMachineHref(machineId: string): string {
  return `/admin/maintenance/${machineId}`;
}

export function serviceReportHref(reportId: string): string {
  return `/admin/service-reports/${reportId}`;
}

/** 有權限才回連結；沒有權限回 null（呼叫端改顯示純文字）。 */
export function gatedHref(href: string, allowed: boolean): string | null {
  return allowed ? href : null;
}
