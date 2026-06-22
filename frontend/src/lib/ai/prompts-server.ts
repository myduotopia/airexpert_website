// 讀取後台 AI Prompt 設定 — SERVER ONLY（以 service_role 讀 is_public=false 的 ai_prompts）。
// 與 getAiConfig() 同套路；解析規則見 prompts.ts 的 resolveAiPrompts。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import { AI_PROMPTS_KEY, resolveAiPrompts, type AiPrompts } from "./prompts";

/** 讀取後台 ai_prompts 原始值（含各欄位來源），SERVER ONLY。供設定頁顯示。 */
export async function getAiPromptsWithSource(): Promise<
  ReturnType<typeof resolveAiPrompts>
> {
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("value")
    .eq("key", AI_PROMPTS_KEY)
    .maybeSingle();
  return resolveAiPrompts(data?.value as Record<string, unknown> | null);
}

/**
 * 取得「有效」AI prompt（後台自訂優先，缺/空白則退回內建第一版）。
 * SERVER ONLY。
 */
export async function getAiPrompts(): Promise<AiPrompts> {
  const { effective } = await getAiPromptsWithSource();
  return effective;
}
