"use server";

// ERP 倉庫 server actions。開頭一律 ensureErp()，錯誤回 { ok:false, error }。
// 預設倉唯一（partial unique index）：設為預設前先取消其他倉的預設。
// 刪除：有庫存或異動者只能停用。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import {
  masterWriteError,
  normalizeWarehouseInput,
  warehouseInUse,
  type WarehouseInput,
} from "@/lib/erp/queries/master-data";

export type WarehouseActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

function revalidateWarehouses() {
  revalidatePath("/admin/erp/warehouses");
}

/** 取消「其他」倉庫的預設旗標（非交易；失敗時回錯誤，不寫入本筆）。 */
async function clearOtherDefaults(
  supabase: Supabase,
  exceptId: string | null,
): Promise<string | null> {
  let query = supabase
    .from("erp_warehouses")
    .update({ is_default: false })
    .eq("is_default", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  return error ? masterWriteError(error) : null;
}

export async function createWarehouseAction(
  input: WarehouseInput,
): Promise<WarehouseActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeWarehouseInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    if (norm.row.is_default) {
      const err = await clearOtherDefaults(supabase, null);
      if (err) return { ok: false, error: err };
    }
    const { data, error } = await supabase
      .from("erp_warehouses")
      .insert(norm.row)
      .select("id")
      .single();
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateWarehouses();
    return { ok: true, id: (data as { id: string }).id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function updateWarehouseAction(
  id: string,
  input: WarehouseInput,
): Promise<WarehouseActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeWarehouseInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    if (norm.row.is_default) {
      const err = await clearOtherDefaults(supabase, id);
      if (err) return { ok: false, error: err };
    }
    const { error } = await supabase
      .from("erp_warehouses")
      .update(norm.row)
      .eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateWarehouses();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function deleteWarehouseAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const supabase = await getServerSupabase();
    const { data: wh, error: readErr } = await supabase
      .from("erp_warehouses")
      .select("is_default")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { ok: false, error: masterWriteError(readErr) };
    if (!wh) return { ok: false, error: "找不到此倉庫。" };
    if ((wh as { is_default: boolean }).is_default) {
      return { ok: false, error: "預設倉不可刪除。" };
    }
    if (await warehouseInUse(supabase, id)) {
      return {
        ok: false,
        error: "此倉庫已有庫存或異動，不能刪除，只能停用。",
      };
    }
    // 草稿單據引用時 FK 會擋下（23503）→ masterWriteError 提示改停用。
    const { error } = await supabase
      .from("erp_warehouses")
      .delete()
      .eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateWarehouses();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "刪除失敗。" };
  }
}
