"use server";

// ERP 廠商 server actions。開頭一律 ensureErp()，錯誤回 { ok:false, error }。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import {
  masterWriteError,
  normalizeVendorInput,
  type VendorInput,
} from "@/lib/erp/queries/master-data";

export type VendorActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function revalidateVendors(id?: string) {
  revalidatePath("/admin/erp/vendors");
  if (id) revalidatePath(`/admin/erp/vendors/${id}`);
}

export async function createVendorAction(
  input: VendorInput,
): Promise<VendorActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeVendorInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("erp_vendors")
      .insert(norm.row)
      .select("id")
      .single();
    if (error) return { ok: false, error: masterWriteError(error) };
    const id = (data as { id: string }).id;
    revalidateVendors(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function updateVendorAction(
  id: string,
  input: VendorInput,
): Promise<VendorActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeVendorInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase
      .from("erp_vendors")
      .update(norm.row)
      .eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateVendors(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

/** 刪除廠商：被單據或品項（預設廠商）引用時 FK 擋下 → 提示改停用。 */
export async function deleteVendorAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await ensureErp();
  if (denied) return denied;
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase.from("erp_vendors").delete().eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateVendors();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "刪除失敗。" };
  }
}
