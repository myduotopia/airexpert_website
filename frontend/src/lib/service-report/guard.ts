// 機台維護報告單權限檢查（server action 用）— SERVER ONLY。
// layout 以 requireModule("service_report") 守頁面（redirect）；server action 不受 layout 保護，
// 且在 action 裡 redirect 會讓 client 失去表單輸入，故一律改回 { ok:false, error }。
import "server-only";

import { hasModule } from "@/lib/admin/auth";

export const SR_FORBIDDEN_MESSAGE = "沒有機台維護報告單權限";

/** 有 service_report 授權回 null；否則回 { ok:false, error } 可直接 return 給 client。 */
export async function ensureServiceReport(): Promise<{
  ok: false;
  error: string;
} | null> {
  return (await hasModule("service_report"))
    ? null
    : { ok: false, error: SR_FORBIDDEN_MESSAGE };
}
