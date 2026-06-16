// service_role Supabase client — SERVER ONLY、繞過 RLS。
//
// 用途：後台寫入內容（CRUD）、讀取聯絡來信等需要管理員權限的操作。
// 呼叫端必須「先」用 `./supabase-server` 的 getServerSupabase().auth.getUser() 驗證
// 目前使用者為 admin，再用本 client 執行寫入 —— 本 client 本身不檢查身分。
//
// 絕對不可從 client component 匯入：`server-only` 會在誤用時直接讓 build 失敗。

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（後台寫入需要 service_role key，請填入 frontend/.env.local，切勿外流或加 NEXT_PUBLIC_ 前綴）",
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
