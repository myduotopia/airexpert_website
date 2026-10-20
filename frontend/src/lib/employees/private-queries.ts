// 員工敏感資料查詢 — SERVER ONLY。
// 呼叫端必須先確認目前使用者有 hr 模組（頁面只對 hr 呼叫，非 hr 的 server 回應不會含任何敏感值）；
// DB 端 hr_* RPC 另以 has_module('hr') 把關。這裡只回遮罩值與存取紀錄，明文只經 reveal action。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import {
  hrRpcError,
  toPrivateView,
  type PrivateAccessLog,
  type PrivateView,
} from "./private";

export async function getEmployeePrivate(
  employeeId: string,
): Promise<{ ok: true; view: PrivateView } | { ok: false; error: string }> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("hr_get_employee_private", {
    p_employee_id: employeeId,
  });
  if (error) return { ok: false, error: hrRpcError(error) };
  const view = toPrivateView(data);
  return view ? { ok: true, view } : { ok: false, error: "讀取敏感資料失敗。" };
}

/** 最近的存取紀錄（RLS：只有 hr 讀得到）。 */
export async function listPrivateAccessLog(
  employeeId: string,
  limit = 20,
): Promise<PrivateAccessLog[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("employee_private_access_log")
    .select("id, actor_email, actor_role, field, action, at")
    .eq("employee_id", employeeId)
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as PrivateAccessLog[];
}
