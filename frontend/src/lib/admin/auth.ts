// 後台授權 DAL（Data Access Layer）— SERVER ONLY。
// 集中「目前使用者的後台角色 / 模組授權」的判斷，貼近資料源做 secure check。
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "../supabase-server";

// 角色清單（ADMIN_ROLES / AdminRole / isAdminRole / CONTENT_ROLES）放在純資料模組 ./roles，
// 側欄（client）也能引用；這裡 re-export，既有 `from "@/lib/admin/auth"` 不必改。
import { isAdminRole, type AdminRole } from "./roles";
import { ACCOUNT_SETTINGS_PATH } from "./staff-accounts";
export {
  ADMIN_ROLES,
  CONTENT_ROLES,
  isAdminRole,
  type AdminRole,
} from "./roles";

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

export interface AdminProfile {
  role: AdminRole;
  /** 首次登入／重設密碼後必須先改密碼（#261，只有 staff 會是 true）。 */
  mustChangePassword: boolean;
}

/**
 * 取得目前登入者的後台帳號資料（角色 + 是否必改密碼），非後台人員回 null。
 * 走 admin_profiles（以登入者 session 讀；0002「admin reads own profile」policy 允許讀自己的列）。
 * 以 React cache 在單次 render 內去重。
 */
export const getCurrentProfile = cache(
  async (): Promise<AdminProfile | null> => {
    const supabase = await getServerSupabase();
    const user = await getSessionUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("admin_profiles")
      .select("role, must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data) return null;
    if (!isAdminRole(data.role)) return null;
    return {
      role: data.role,
      // DB 約束（admin_profiles_must_change_staff_check）只允許 staff 為 true；這裡再收斂一次，
      // 避免非 staff 帳號被導到自己進不去的帳號設定頁而互導。
      mustChangePassword:
        data.role === "staff" && data.must_change_password === true,
    };
  },
);

/** 取得目前登入者的後台角色（見 ADMIN_ROLES），非後台人員回 null。 */
export const getCurrentUserRole = cache(async (): Promise<AdminRole | null> => {
  return (await getCurrentProfile())?.role ?? null;
});

/** 目前登入者是否必須先改密碼（員工帳號以預設密碼登入時）。 */
export async function mustChangePassword(): Promise<boolean> {
  return (await getCurrentProfile())?.mustChangePassword === true;
}

/**
 * 後台殼層（(protected)／(print) 根 layout）用：必須先改密碼的帳號一律導到帳號設定頁。
 * 帳號設定頁在獨立的 (account) route group，不經過這兩個 layout，故不會互導。
 * 註：layout 不保護 server action；必改密碼時 has_module()（DB）與 getCurrentModules()（前端）皆回空，
 * 所有以模組守門的 action 與 RLS 都會拒絕；以角色守門的 action 不含 staff（帳號設定頁的改密碼 action 除外）。
 */
export async function redirectIfMustChangePassword(): Promise<void> {
  if (await mustChangePassword()) redirect(ACCOUNT_SETTINGS_PATH);
}

/**
 * 後台模組授權（與角色正交；見 admin_module_grants / position_permissions / has_module()）。
 *   erp            — ERP
 *   service_report — 機台維護報告單
 *   hr             — 人事：員工敏感資料（身份證號、地址…，0031），也可維護員工主檔與權限管理（只能直接授權）
 *   maintenance    — 保養記錄卡（#261；只能經職位授予。office 角色不需此模組）
 *   employees      — 員工清單（#261；非敏感資料，只能經職位授予）
 */
export type AdminModule =
  | "erp"
  | "service_report"
  | "hr"
  | "maintenance"
  | "employees";

export const KNOWN_MODULES: readonly AdminModule[] = [
  "erp",
  "service_report",
  "hr",
  "maintenance",
  "employees",
];

/**
 * 取得目前登入者的有效模組（未登入 / 查詢失敗回空陣列）。
 * 呼叫 current_admin_modules()（0032）：與 RLS 的 has_module() 同一份邏輯 ——
 * 直接授權（admin_module_grants）∪ 所連結在職員工的職位權限；必改密碼時一律為空。
 * 以 React cache 在單次 render 內去重（layout、erp/layout、page 都呼叫時只查一次）。
 */
export const getCurrentModules = cache(async (): Promise<AdminModule[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("current_admin_modules");
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).filter((m): m is AdminModule =>
    (KNOWN_MODULES as readonly string[]).includes(m as string),
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
 * 保護 server component / layout：擁有 modules 中任一模組即可，否則導向 /admin。
 * 例：員工主檔（ERP、機台維護報告單與人事共用）requireAnyModule(EMPLOYEE_MODULES)。
 * 回傳目前登入者的模組清單（頁面可再依此決定顯示哪些入口）。
 */
export async function requireAnyModule(
  modules: readonly AdminModule[],
): Promise<AdminModule[]> {
  const mine = await getCurrentModules();
  if (!modules.some((m) => mine.includes(m))) redirect("/admin");
  return mine;
}

/** 保養記錄卡的角色（office 共用帳號；其他人需 maintenance 模組）。 */
export const MAINTENANCE_ROLES: readonly AdminRole[] = ["office"];

/**
 * 目前登入者可否使用保養記錄卡：角色 office 或擁有 maintenance 模組（與 0032 的 mx_has_access() 一致）。
 * server action 用：回 false 時自行處理。
 */
export async function hasMaintenanceAccess(): Promise<boolean> {
  const role = await getCurrentUserRole();
  if (!role) return false;
  if (MAINTENANCE_ROLES.includes(role)) return true;
  return hasModule("maintenance");
}

/**
 * 保護保養記錄卡的 server component / server action：角色 office 或 maintenance 模組，否則導離
 * （未登入／非後台人員 → /admin/login；其他後台人員 → /admin，與 requireRole 一致）。
 */
export async function requireMaintenanceAccess(): Promise<AdminRole> {
  const role = await getCurrentUserRole();
  if (!role) redirect("/admin/login");
  if (!(await hasMaintenanceAccess())) redirect("/admin");
  return role;
}

/**
 * 保護 server component / layout：非 admin 導離。
 * 已是後台人員但非 admin（seo_manager / office / erp / hr / staff）→ 總覽 /admin（他已登入，
 * 丟回登入頁會讓人以為 session 過期）；非後台人員 / 未登入 → 登入頁。
 */
export async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (admin) return admin;
  redirect((await getCurrentUserRole()) ? "/admin" : "/admin/login");
}

/**
 * 保護 server component / layout：角色不在 allowed 內一律導離。
 * 回傳目前登入者的角色。例：requireRole(['admin','seo_manager'])、requireRole(CONTENT_ROLES)。
 *
 * 導向規則（與 requireModule 一致）：
 *   未登入 / 無 admin_profiles 列（非後台人員）→ /admin/login
 *   已登入的後台人員但角色不符 → /admin（總覽頁會再依角色轉到他該去的區段；
 *   例：erp 角色進 /admin/maintenance → /admin → /admin/erp）
 * 注意「非後台人員」必須導登入頁而非 /admin：/admin 自己也在 requireRole 底下，
 * 導過去會無限轉址。
 */
export async function requireRole(
  allowed: readonly AdminRole[],
): Promise<AdminRole> {
  const role = await getCurrentUserRole();
  if (!role) redirect("/admin/login");
  if (!allowed.includes(role)) redirect("/admin");
  return role;
}
