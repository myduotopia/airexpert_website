"use server";

// 共用後台 CRUD server actions（以 service_role 寫入，繞過 RLS）。
// 安全邊界：每個 action 先 requireAdmin() 驗證身分，再操作；非 admin 會被導回登入。
// 各 tab 以 bind 包成自己的具型別 action，例如：
//   const create = createRow.bind(null, "products");
import { revalidateTag } from "next/cache";
import { getAdminSupabase } from "../supabase-admin";
import { requireAdmin } from "./auth";
import type { ContentStatus } from "../types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createRow(
  table: string,
  values: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase().from(table).insert(values);
  if (error) return { ok: false, error: error.message };
  // Next 16：revalidateTag 需第二參數；"max" = stale-while-revalidate。
  for (const tag of revalidate) revalidateTag(tag, "max");
  return { ok: true };
}

export async function updateRow(
  table: string,
  id: string,
  values: Record<string, unknown>,
  revalidate: string[] = [],
): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase()
    .from(table)
    .update(values)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Next 16：revalidateTag 需第二參數；"max" = stale-while-revalidate。
  for (const tag of revalidate) revalidateTag(tag, "max");
  return { ok: true };
}

export async function deleteRow(
  table: string,
  id: string,
  revalidate: string[] = [],
): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase().from(table).delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Next 16：revalidateTag 需第二參數；"max" = stale-while-revalidate。
  for (const tag of revalidate) revalidateTag(tag, "max");
  return { ok: true };
}

/**
 * 依新順序把 sort_order 重設為 0,1,2…（序列、不重複、由小到大）。
 * 供後台列表拖移排序使用。orderedIds 為列表的完整新順序 id 陣列。
 */
export async function reorderRows(
  table: string,
  orderedIds: string[],
  revalidate: string[] = [],
): Promise<ActionResult> {
  await requireAdmin();
  const admin = getAdminSupabase();
  const results = await Promise.all(
    orderedIds.map((id, i) =>
      admin.from(table).update({ sort_order: i }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  for (const tag of revalidate) revalidateTag(tag, "max");
  return { ok: true };
}

export async function setStatus(
  table: string,
  id: string,
  status: ContentStatus,
  revalidate: string[] = [],
): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase()
    .from(table)
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  // Next 16：revalidateTag 需第二參數；"max" = stale-while-revalidate。
  for (const tag of revalidate) revalidateTag(tag, "max");
  return { ok: true };
}
