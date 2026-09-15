// ERP 權限檢查（server action / 異動 helper 用）— SERVER ONLY。
// layout 以 requireModule("erp") 守頁面（redirect）；server action 不受 layout 保護，
// 且在 action 裡 redirect 會讓 client 失去表單輸入，故一律改回 { ok:false, error }。
import "server-only";

import { hasModule } from "@/lib/admin/auth";
import { ERP_FORBIDDEN_MESSAGE } from "./errors";

/** 有 erp 授權回 null；否則回 { ok:false, error } 可直接 return 給 client。 */
export async function ensureErp(): Promise<{
  ok: false;
  error: string;
} | null> {
  return (await hasModule("erp"))
    ? null
    : { ok: false, error: ERP_FORBIDDEN_MESSAGE };
}
