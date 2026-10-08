"use server";

// ERP 客戶 server actions（共用 mx_customers）。開頭一律 ensureErp()，錯誤回 { ok:false, error }。
// ERP 的 mx_customers policy 只有 select / insert / update，不提供刪除（改用 erp_active 停用）。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import { CUSTOMER_OPTION_COLUMNS } from "@/lib/erp/queries/pickers";
import type { CustomerOption } from "@/lib/erp/types";
import {
  masterWriteError,
  normalizeCustomerInput,
  type CustomerInput,
} from "@/lib/erp/queries/master-data";

export type CustomerActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** 建立結果另帶 Picker 選項（建單時就地新增 #218：存檔後直接選取並加入選單）。 */
export type CreateCustomerResult =
  | { ok: true; id: string; option: CustomerOption }
  | { ok: false; error: string };

function revalidateCustomers(id?: string) {
  revalidatePath("/admin/erp/customers");
  if (id) revalidatePath(`/admin/erp/customers/${id}`);
  // 客戶名稱／編號也出現在保養卡列表與卡詳情。
  revalidatePath("/admin/maintenance", "layout");
}

export async function createCustomerAction(
  input: CustomerInput,
): Promise<CreateCustomerResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeCustomerInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("mx_customers")
      .insert(norm.row)
      .select(CUSTOMER_OPTION_COLUMNS)
      .single();
    if (error) return { ok: false, error: masterWriteError(error) };
    const option = data as CustomerOption;
    revalidateCustomers(option.id);
    return { ok: true, id: option.id, option };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function updateCustomerAction(
  id: string,
  input: CustomerInput,
): Promise<CustomerActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeCustomerInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("mx_customers")
      .update({ ...norm.row, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateCustomers(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}
