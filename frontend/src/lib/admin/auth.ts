// 後台授權 DAL（Data Access Layer）— SERVER ONLY。
// 集中「目前使用者是否為 admin」的判斷，貼近資料源做 secure check。
import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getServerSupabase } from "../supabase-server";

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

/** 保護 server component / layout：非 admin 一律導向登入頁。 */
export async function requireAdmin(): Promise<User> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}
