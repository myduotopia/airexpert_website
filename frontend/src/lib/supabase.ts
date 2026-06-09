import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// 前端用 anon key，受 RLS 保護（僅能讀已發佈內容 / 送出聯絡表單）。
// 採惰性初始化：import 時不會丟錯，實際呼叫時才檢查環境變數。
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY（請填入 frontend/.env.local）",
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
