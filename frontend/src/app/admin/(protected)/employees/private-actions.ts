"use server";

// 員工敏感資料 server actions（#257）。只有 hr 模組使用者可用：開頭一律 ensureHrAccess()，
// DB 端 hr_* RPC（security definer）另以 has_module('hr') 把關；錯誤回 { ok:false, error }，不 throw。
// reveal 每次呼叫都會在 DB 寫入存取紀錄（employee_private_access_log）。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureHrAccess } from "@/lib/employees/guard";
import { isEmployeeId } from "@/lib/employees/normalize";
import {
  buildPrivatePatch,
  hrRpcError,
  isPrivateField,
  privatePatchError,
  toPrivateView,
  type PrivateField,
  type PrivateValues,
  type PrivateView,
} from "@/lib/employees/private";

const NOT_FOUND = "找不到此員工，請重新整理後再試。";

/** 顯示單一欄位明文（寫入存取紀錄）。 */
export async function revealEmployeePrivateAction(
  employeeId: string,
  field: PrivateField,
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  if (!isPrivateField(field)) return { ok: false, error: "未知的欄位。" };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc("hr_reveal_employee_private", {
      p_employee_id: employeeId,
      p_field: field,
    });
    if (error) return { ok: false, error: hrRpcError(error) };
    revalidatePath(`/admin/employees/${employeeId}`);
    return { ok: true, value: typeof data === "string" ? data : null };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "讀取失敗。" };
  }
}

/**
 * 修改敏感資料：values 留白 = 不變；clear 內的欄位 = 清除；其他 = 加密寫入（見 buildPrivatePatch）。
 * 回傳寫入後的遮罩值。
 */
export async function updateEmployeePrivateAction(
  employeeId: string,
  values: PrivateValues,
  clear: PrivateField[],
): Promise<{ ok: true; view: PrivateView } | { ok: false; error: string }> {
  const denied = await ensureHrAccess();
  if (denied) return denied;
  if (!isEmployeeId(employeeId)) return { ok: false, error: NOT_FOUND };
  const safeValues: PrivateValues = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (isPrivateField(k) && typeof v === "string") safeValues[k] = v;
  }
  const safeClear = (Array.isArray(clear) ? clear : []).filter(isPrivateField);
  const patch = buildPrivatePatch(safeValues, safeClear);
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "沒有要修改的欄位。" };
  }
  const tooLong = privatePatchError(patch);
  if (tooLong) return { ok: false, error: tooLong };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc("hr_upsert_employee_private", {
      p_employee_id: employeeId,
      p_fields: patch,
    });
    if (error) return { ok: false, error: hrRpcError(error) };
    const view = toPrivateView(data);
    if (!view) return { ok: false, error: "儲存失敗，請稍後再試。" };
    revalidatePath(`/admin/employees/${employeeId}`);
    return { ok: true, view };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}
