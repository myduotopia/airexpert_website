"use server";

// 人員管理 server actions（admin only）。建立 / 移除 SEO 代管帳號。
//
// 流程（建立 seo_manager）：
//   1. requireAdmin() 驗證身分（非 admin 一律導回登入）。
//   2. getAdminSupabase().auth.admin.createUser({ email, password, email_confirm:true })
//      —— service_role 才能呼叫 Auth admin API；email_confirm 直接標記已驗證，免寄信。
//   3. 以回傳的 user.id 寫入 admin_profiles 列 { id, email, role:'seo_manager' }。
//      （admin_profiles 無 insert policy；service_role 繞過 RLS。）
//   若步驟 3 失敗，回滾刪除步驟 2 建立的 auth 使用者，避免孤兒帳號。
//
// 移除：刪 admin_profiles 列 + deleteUser（auth.users）。刻意不允許刪除 admin 列
// （第一位 admin 由 SQL 佈建，避免後台誤把自己/唯一管理員刪掉）。

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import type { ActionResult } from "@/lib/admin/crud";

export type StaffFormState = { ok?: boolean; error?: string };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 建立一個 SEO 代管（seo_manager）帳號。useActionState 簽章。 */
export async function createSeoManager(
  _prev: StaffFormState,
  fd: FormData,
): Promise<StaffFormState> {
  await requireAdmin();

  const email = String(fd.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(fd.get("password") ?? "");

  if (!isValidEmail(email)) {
    return { error: "請輸入有效的 Email。" };
  }
  if (password.length < 8) {
    return { error: "密碼至少需 8 個字元。" };
  }

  const admin = getAdminSupabase();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return { error: `建立帳號失敗：${createErr?.message ?? "未知錯誤"}` };
  }

  const { error: profileErr } = await admin
    .from("admin_profiles")
    .insert({ id: created.user.id, email, role: "seo_manager" });
  if (profileErr) {
    // 回滾：admin_profiles 寫入失敗 → 刪掉剛建立的 auth 使用者，避免孤兒帳號。
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: `建立角色資料失敗：${profileErr.message}` };
  }

  revalidatePath("/admin/staff");
  return { ok: true };
}

/**
 * 移除一個 SEO 代管帳號（DeleteButton 以 bind 帶入 id）。
 * 安全：先確認該列確為 seo_manager，避免誤刪 admin。
 */
export async function removeSeoManager(id: string): Promise<ActionResult> {
  await requireAdmin();

  const admin = getAdminSupabase();

  const { data: target, error: readErr } = await admin
    .from("admin_profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!target) return { ok: false, error: "找不到該帳號。" };
  if (target.role !== "seo_manager") {
    return { ok: false, error: "只能移除 SEO 代管帳號。" };
  }

  const { error: delProfileErr } = await admin
    .from("admin_profiles")
    .delete()
    .eq("id", id);
  if (delProfileErr) return { ok: false, error: delProfileErr.message };

  // 一併刪除 auth 使用者，使其無法再登入。
  const { error: delUserErr } = await admin.auth.admin.deleteUser(id);
  if (delUserErr) return { ok: false, error: delUserErr.message };

  revalidatePath("/admin/staff");
  return { ok: true };
}
