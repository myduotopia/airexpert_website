"use server";

// ERP 品項 server actions。開頭一律 ensureErp()（layout 不保護 action），錯誤回 { ok:false, error }。
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase-server";
import { ensureErp } from "@/lib/erp/guard";
import {
  itemHasStockActivity,
  masterWriteError,
} from "@/lib/erp/queries/master-data";
import { normalizeItemInput, type ItemInput } from "./_lib/rules";

export type ItemActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function revalidateItems(id?: string) {
  revalidatePath("/admin/erp/items");
  if (id) revalidatePath(`/admin/erp/items/${id}`);
}

export async function createItemAction(
  input: ItemInput,
): Promise<ItemActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeItemInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("erp_items")
      .insert(norm.row)
      .select("id")
      .single();
    if (error) return { ok: false, error: masterWriteError(error) };
    const id = (data as { id: string }).id;
    revalidateItems(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}

export async function updateItemAction(
  id: string,
  input: ItemInput,
): Promise<ItemActionResult> {
  const denied = await ensureErp();
  if (denied) return denied;
  const norm = normalizeItemInput(input);
  if (!norm.ok) return norm;
  try {
    const supabase = await getServerSupabase();
    const { data: current, error: readErr } = await supabase
      .from("erp_items")
      .select("track_stock, track_serial")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { ok: false, error: masterWriteError(readErr) };
    if (!current) return { ok: false, error: "找不到此品項。" };

    // 已有庫存異動時，變更庫存／機號追蹤會讓既有存量與機號失去對應，擋下。
    const prev = current as { track_stock: boolean; track_serial: boolean };
    const trackingChanged =
      prev.track_stock !== norm.row.track_stock ||
      prev.track_serial !== norm.row.track_serial;
    if (trackingChanged && (await itemHasStockActivity(supabase, id))) {
      return {
        ok: false,
        error:
          "此品項已有庫存異動，無法變更「追蹤庫存／追蹤機號」設定（類別切換為服務／費用也會關閉追蹤）。",
      };
    }

    const { error } = await supabase
      .from("erp_items")
      .update(norm.row)
      .eq("id", id);
    if (error) return { ok: false, error: masterWriteError(error) };
    revalidateItems(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "儲存失敗。" };
  }
}
