"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase-server";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "請輸入帳號與密碼" };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "登入失敗：帳號或密碼錯誤" };
  }

  // 驗證為後台人員（admin / seo_manager / office）；否則立即登出，不給進後台。
  // 註：is_admin() 自 0005 起收斂為 role='admin'，故不能只查 is_admin，否則
  // seo_manager 與 office 會被擋在登入頁（與 (protected) layout 的 requireRole 一致）。
  // 讀自己的 admin_profiles 列（0002「admin reads own profile」policy 為 role 無關）。
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const role = profile?.role;
  if (role !== "admin" && role !== "seo_manager" && role !== "office") {
    await supabase.auth.signOut();
    return { error: "此帳號沒有後台權限" };
  }

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
