"use server";

// 帳號設定頁（#261）：員工帳號（staff）變更自己的密碼。
// 流程：
//   1. requireRole(['staff'])：只有員工帳號能用（共用／管理帳號的密碼由管理員處理）。必改密碼時也要能進來。
//   2. validatePasswordChange：新密碼 ≥ 8 碼、不得為預設密碼 00000000、兩次一致、不得與目前相同。
//   3. 以目前密碼重新驗證（server 端獨立 client signInWithPassword；session 被偷用時無法直接改密碼），
//      並確認驗證到的是同一個帳號。
//   4. service_role 更新密碼（auth.admin.updateUserById），再以 service_role 呼叫
//      staff_complete_password_change（0032，只給 service_role）清除 must_change_password 並寫稽核。
//      使用者自己的 session 無法寫 admin_profiles，也無法呼叫該 RPC，故不能跳過改密碼直接解鎖。
import { revalidatePath } from "next/cache";
import { getSessionUser, requireRole } from "@/lib/admin/auth";
import { verifyPassword } from "@/lib/admin/password-verify";
import { validatePasswordChange } from "@/lib/admin/staff-accounts";
import { getAdminSupabase } from "@/lib/supabase-admin";

export type ChangePasswordState = { ok?: boolean; error?: string };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  fd: FormData,
): Promise<ChangePasswordState> {
  await requireRole(["staff"]);
  const user = await getSessionUser();
  if (!user?.email) return { error: "登入狀態已失效，請重新登入。" };

  const current = String(fd.get("current_password") ?? "");
  const next = String(fd.get("new_password") ?? "");
  const confirm = String(fd.get("confirm_password") ?? "");
  const invalid = validatePasswordChange({ current, next, confirm });
  if (invalid) return { error: invalid };

  const verified = await verifyPassword(user.email, current);
  if (!verified.ok || verified.userId !== user.id) {
    return { error: "目前密碼不正確。" };
  }

  const admin = getAdminSupabase();
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    password: next,
  });
  if (updateErr) {
    return { error: `變更密碼失敗：${updateErr.message}` };
  }

  const { error: unlockErr } = await admin.rpc(
    "staff_complete_password_change",
    { p_user_id: user.id },
  );
  if (unlockErr) {
    return {
      error:
        "密碼已變更，但解除「必須改密碼」失敗，請重新整理後再試一次（目前密碼請輸入剛設定的新密碼）。",
    };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
