// Cookie 綁定的 Supabase client（anon key）— SERVER ONLY。
//
// 用途：在 server component / server action / route handler 讀取「目前登入的 admin」
// 的 session（`supabase.auth.getUser()`），以判斷權限。寫入內容請改用 `./supabase-admin`
// （service_role，繞過 RLS）。公開（未登入）讀取請用 `./supabase`（anon, 無 cookie）。
//
// Next.js 16：`cookies()` 為 async，需 await。

import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getServerSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（請填入 frontend/.env.local）",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // 在 server component 中 set 會丟錯（無法寫 response）；session 刷新交給 middleware，
        // 故此處吞掉錯誤即可。
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // called from a Server Component — ignore
        }
      },
    },
  });
}
