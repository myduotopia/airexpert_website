"use server";

// 員工主檔 server actions（#223）。ERP 與機台維護報告單共用：開頭一律 ensureEmployeeAccess()
// （有 erp 或 service_report 任一模組），錯誤回 { ok:false, error }（中文），不 throw、不 redirect。
// 寫入走登入者 session（RLS 同上）。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureEmployeeAccess } from "@/lib/employees/guard";
import {
  employeeWriteError,
  isEmployeeId,
  normalizeEmployeeInput,
} from "@/lib/employees/normalize";
import { EMPLOYEE_OPTION_COLUMNS } from "@/lib/employees/queries";
import type { EmployeeInput, EmployeeOption } from "@/lib/employees/types";

export type EmployeeActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** 建立結果另帶選取器選項（就地新增：存檔後直接選取並加入選單）。 */
export type CreateEmployeeResult =
  | { ok: true; id: string; option: EmployeeOption }
  | { ok: false; error: string };

const NOT_FOUND = "找不到此員工，請重新整理後再試。";

function revalidateEmployees(id?: string) {
  revalidatePath("/admin/employees");
  if (id) revalidatePath(`/admin/employees/${id}/edit`);
}

export async function createEmployeeAction(
  input: EmployeeInput,
): Promise<CreateEmployeeResult> {
  const denied = await ensureEmployeeAccess();
  if (denied) return denied;
  const norm = normalizeEmployeeInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("employees")
      .insert(norm.row)
      .select(EMPLOYEE_OPTION_COLUMNS)
      .single();
    if (error) return { ok: false, error: employeeWriteError(error) };
    const option = data as EmployeeOption;
    revalidateEmployees(option.id);
    return { ok: true, id: option.id, option };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function updateEmployeeAction(
  id: string,
  input: EmployeeInput,
): Promise<EmployeeActionResult> {
  const denied = await ensureEmployeeAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: NOT_FOUND };
  const norm = normalizeEmployeeInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("employees")
      .update(norm.row)
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: employeeWriteError(error) };
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false, error: NOT_FOUND };
    }
    revalidateEmployees(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

/** 刪除員工：被客戶、單據或維護報告單引用時外鍵擋下（23503）→ 提示改為停用。 */
export async function deleteEmployeeAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await ensureEmployeeAccess();
  if (denied) return denied;
  if (!isEmployeeId(id)) return { ok: false, error: NOT_FOUND };
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("employees")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: employeeWriteError(error) };
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false, error: NOT_FOUND };
    }
    revalidateEmployees();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "刪除失敗。" };
  }
}
