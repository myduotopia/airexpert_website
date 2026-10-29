"use server";

// ERP 廠商 server actions。開頭一律 ensureErp()，錯誤回 { ok:false, error }。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import { VENDOR_OPTION_COLUMNS } from "@/lib/erp/queries/pickers";
import type { VendorOption } from "@/lib/erp/types";
import { syncVendorReminders } from "@/lib/erp/queries/reminders";
import {
  masterWriteError,
  normalizeVendorInput,
  type VendorInput,
} from "@/lib/erp/queries/master-data";

export type VendorActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: keyof VendorInput };

/** 建立結果另帶 Picker 選項（建單時就地新增 #218：存檔後直接選取並加入選單）。 */
export type CreateVendorResult =
  | { ok: true; id: string; option: VendorOption }
  | { ok: false; error: string; field?: keyof VendorInput };

function revalidateVendors(id?: string) {
  revalidatePath("/admin/erp/vendors");
  if (id) revalidatePath(`/admin/erp/vendors/${id}`);
}

/**
 * 提醒事項（#274）：廠商存檔後重新解析備註／付款條件，同步該廠商的 auto 提醒規則（不動手動規則）。
 * 廠商已存檔成功，同步失敗不回滾也不擋存檔（只記 log）；可到「提醒事項 › 全部規則」按「從廠商備註重新解析」補做。
 */
async function syncReminders(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  vendorId: string,
) {
  try {
    await syncVendorReminders(supabase, [vendorId]);
    revalidatePath("/admin/erp/reminders");
    revalidatePath("/admin", "layout");
  } catch (e) {
    console.error("[erp] 廠商提醒規則同步失敗", (e as Error)?.message);
  }
}

export async function createVendorAction(
  input: VendorInput,
): Promise<CreateVendorResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeVendorInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("erp_vendors")
      .insert(norm.row)
      .select(VENDOR_OPTION_COLUMNS)
      .single();
    if (error) return { ok: false, error: masterWriteError(error) };
    const option = data as VendorOption;
    await syncReminders(supabase, option.id);
    revalidateVendors(option.id);
    return { ok: true, id: option.id, option };
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
    await syncReminders(supabase, id);
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
