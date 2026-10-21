// 以「目前密碼」重新驗證登入者 — SERVER ONLY（#261 帳號設定頁改密碼用）。
// 用一個不寫 cookie、不保存 session 的獨立 anon client 呼叫 signInWithPassword，
// 不影響登入者瀏覽器上的 session；驗證完立即以 scope 'local' 登出這個暫時 session（只撤銷它自己）。
import "server-only";

import { createClient } from "@supabase/supabase-js";

export type VerifyPasswordResult = { ok: true; userId: string } | { ok: false };

export async function verifyPassword(
  email: string,
  password: string,
): Promise<VerifyPasswordResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（請填入 frontend/.env.local）",
    );
  }
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) return { ok: false };
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return { ok: true, userId: data.user.id };
}
