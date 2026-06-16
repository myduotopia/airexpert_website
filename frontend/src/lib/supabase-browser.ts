// 瀏覽器端 Supabase client（anon key）— CLIENT 用。
//
// 用途：後台登入頁（client component）呼叫 `supabase.auth.signInWithPassword(...)`，
// 並把 session 寫進 cookie（由 @supabase/ssr 處理），讓 server 端 / middleware 讀得到。
//
// 只用 anon key（NEXT_PUBLIC_*），可安全打包進 client bundle。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（請填入 frontend/.env.local）",
    );
  }

  client = createBrowserClient(url, anonKey);
  return client;
}
