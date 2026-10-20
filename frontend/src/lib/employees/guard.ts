// 員工主檔權限檢查（server action 用）— SERVER ONLY。
// 員工主檔由 ERP、機台維護報告單與人事共用：有 erp、service_report 或 hr 任一模組授權即可讀寫
// 非敏感欄位（與 0027 + 0031 §7c 的 RLS 一致）。layout 不保護 server action，每個 action 開頭仍須自行檢查。
import "server-only";

import { hasModule } from "@/lib/admin/auth";

export const EMPLOYEE_FORBIDDEN_MESSAGE = "沒有員工主檔權限";

/** 員工主檔可用的模組（任一即可）。 */
export const EMPLOYEE_MODULES = ["erp", "service_report", "hr"] as const;

/** 有權限回 null；否則回 { ok:false, error } 可直接 return 給 client。 */
export async function ensureEmployeeAccess(): Promise<{
  ok: false;
  error: string;
} | null> {
  for (const m of EMPLOYEE_MODULES) {
    if (await hasModule(m)) return null;
  }
  return { ok: false, error: EMPLOYEE_FORBIDDEN_MESSAGE };
}

export const HR_FORBIDDEN_ACTION_MESSAGE = "沒有人事（hr）權限";

/** 敏感資料（hr 模組）權限：有權限回 null；否則回 { ok:false, error }。DB 的 hr_* RPC 另有相同檢查。 */
export async function ensureHrAccess(): Promise<{
  ok: false;
  error: string;
} | null> {
  return (await hasModule("hr"))
    ? null
    : { ok: false, error: HR_FORBIDDEN_ACTION_MESSAGE };
}
