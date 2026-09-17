// 後台授權 DAL（Data Access Layer）— SERVER ONLY。
// 集中「目前使用者是否為 admin / seo_manager」的判斷，貼近資料源做 secure check。
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "../supabase-server";

/**
 * 後台角色的單一事實來源。新增角色只需改這一行，
 * getCurrentUserRole()、登入檢查（app/admin/actions.ts）等皆走 isAdminRole()。
 *   admin       — 管理員（全站）
 *   seo_manager — SEO 代管（只編各內容的 SEO meta）
 *   office      — 行政（保養記錄卡）
 *   erp         — ERP 行政（只用 ERP 模組；實際可見性另由 admin_module_grants 決定）
 */
export const ADMIN_ROLES = ["admin", "seo_manager", "office", "erp"] as const;

/** 後台角色。null = 未登入或非後台人員。 */
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** 字串是否為合法後台角色（admin_profiles.role 為自由文字，讀出後一律先過此檢查）。 */
export function isAdminRole(value: unknown): value is AdminRole {
  return (
    typeof value === "string" &&
    (ADMIN_ROLES as readonly string[]).includes(value)
  );
}

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
 * 取得目前登入者的後台角色（見 ADMIN_ROLES），非後台人員回 null。
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

  return isAdminRole(data.role) ? data.role : null;
});

/** 後台模組授權（與角色正交；見 admin_module_grants / has_module()，spec §3）。 */
export type AdminModule = "erp" | "service_report";

const KNOWN_MODULES: readonly AdminModule[] = ["erp", "service_report"];

/**
 * 取得目前登入者被授權的模組清單（未登入 / 查詢失敗回空陣列）。
 * 讀 admin_module_grants（以登入者 session 讀；RLS「read own grants」只回自己的列）。
 * 以 React cache 在單次 render 內去重（layout、erp/layout、page 都呼叫時只查一次）。
 */
export const getCurrentModules = cache(async (): Promise<AdminModule[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("admin_module_grants")
    .select("module")
    .eq("user_id", user.id);
  if (error || !data) return [];
  return (data as { module: string }[])
    .map((r) => r.module)
    .filter((m): m is AdminModule =>
      (KNOWN_MODULES as readonly string[]).includes(m),
    );
});

/** 目前登入者是否擁有指定模組（server action 用：回 false 時自行回 { ok:false }，不 redirect）。 */
export async function hasModule(module: AdminModule): Promise<boolean> {
  const modules = await getCurrentModules();
  return modules.includes(module);
}

/**
 * 保護 server component / layout：無該模組授權一律導向 /admin
 * （已登入後台者回總覽，不是登入頁；office 在總覽會再被導向保養卡）。
 */
export async function requireModule(module: AdminModule): Promise<void> {
  if (!(await hasModule(module))) redirect("/admin");
}

/**
 * 保護 server component / layout：非 admin 導離。
 * 已是後台人員但非 admin（seo_manager / office / erp）→ 總覽 /admin（他已登入，
 * 丟回登入頁會讓人以為 session 過期）；非後台人員 / 未登入 → 登入頁。
 */
export async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (admin) return admin;
  redirect((await getCurrentUserRole()) ? "/admin" : "/admin/login");
}

/**
 * 保護 server component / layout：角色不在 allowed 內一律導離。
 * 回傳目前登入者的角色。例：requireRole(['admin','seo_manager'])。
 *
 * 導向規則（與 requireModule 一致）：
 *   未登入 / 無 admin_profiles 列（非後台人員）→ /admin/login
 *   已登入的後台人員但角色不符 → /admin（總覽頁會再依角色轉到他該去的區段；
 *   例：erp 角色進 /admin/maintenance → /admin → /admin/erp）
 * 注意「非後台人員」必須導登入頁而非 /admin：/admin 自己也在 requireRole 底下，
 * 導過去會無限轉址。
 */
export async function requireRole(allowed: AdminRole[]): Promise<AdminRole> {
  const role = await getCurrentUserRole();
  if (!role) redirect("/admin/login");
  if (!allowed.includes(role)) redirect("/admin");
  return role;
}
