// 員工主檔權限檢查（server action 用）— SERVER ONLY。
// 員工主檔由 ERP 與機台維護報告單共用：有 erp 或 service_report 任一模組授權即可讀寫
// （與 0027 的 RLS 一致）。layout 不保護 server action，每個 action 開頭仍須自行檢查。
import "server-only";

import { hasModule } from "@/lib/admin/auth";

export const EMPLOYEE_FORBIDDEN_MESSAGE = "沒有員工主檔權限";

/** 員工主檔可用的模組（任一即可）。 */
export const EMPLOYEE_MODULES = ["erp", "service_report"] as const;

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
