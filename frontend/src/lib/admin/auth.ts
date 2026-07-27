// 後台授權 DAL（Data Access Layer）— SERVER ONLY。
// 集中「目前使用者是否為 admin / seo_manager」的判斷，貼近資料源做 secure check。
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "../supabase-server";

/** 後台角色。null = 未登入或非後台人員。 */
export type AdminRole = "admin" | "seo_manager" | "office";

/**
 * 取得目前登入且為 admin 的使用者；否則回 null。
 * 以 React cache 在單次 render 內去重（layout 與 page 都呼叫時只查一次）。
 * is_admin() 已 grant 給 authenticated；登入者的 session 以 authenticated 角色執行 rpc。
 */
export const getCurrentAdmin = cache(async (): Promise<User | null> => {
  const supabase = await getServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || !isAdmin) return null;

  return user;
});

/**
 * 取得目前登入的 session 使用者（不論角色），未登入回 null。
 * 以 React cache 在單次 render 內去重（layout 顯示 email 與 getCurrentUserRole 共用）。
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/**
 * 取得目前登入者的後台角色（'admin' | 'seo_manager' | 'office'），非後台人員回 null。
 * 走 admin_profiles.role（以登入者 session 讀；0002「admin reads own profile」policy
 * 允許讀自己的列）。以 React cache 在單次 render 內去重。
 */
export const getCurrentUserRole = cache(async (): Promise<AdminRole | null> => {
  const supabase = await getServerSupabase();
  const user = await getSessionUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return null;

  const role = data.role as string;
  return role === "admin" || role === "seo_manager" || role === "office"
    ? (role as AdminRole)
    : null;
});

/** 保護 server component / layout：非 admin 一律導向登入頁。 */
export async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * 保護 server component / layout：角色不在 allowed 內一律導向登入頁。
 * 回傳目前登入者的角色。例：requireRole(['admin','seo_manager'])。
 */
export async function requireRole(allowed: AdminRole[]): Promise<AdminRole> {
  const role = await getCurrentUserRole();
  if (!role || !allowed.includes(role)) redirect("/admin/login");
  return role;
}
