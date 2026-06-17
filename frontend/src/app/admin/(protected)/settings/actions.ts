"use server";

import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { encryptSecret } from "@/lib/crypto";
import { AI_CONFIG_KEY } from "@/lib/ai/gemini";

export type SettingsState = { ok?: boolean; error?: string };

type AiConfigValue = { gemini_key_enc?: string; model?: string };

export async function saveAiConfig(
  _prev: SettingsState,
  fd: FormData,
): Promise<SettingsState> {
  await requireAdmin();
  const newKey = String(fd.get("gemini_key") ?? "").trim();
  const model = String(fd.get("model") ?? "").trim() || "gemini-2.0-flash";

  const admin = getAdminSupabase();
  const { data } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", AI_CONFIG_KEY)
    .maybeSingle();
  const cur = (data?.value ?? {}) as AiConfigValue;

  const value: AiConfigValue = { model };
  if (newKey) {
    try {
      value.gemini_key_enc = encryptSecret(newKey);
    } catch (e) {
      return { error: `加密失敗：${(e as Error).message}` };
    }
  } else if (cur.gemini_key_enc) {
    // 沒重新輸入 key → 保留既有（只改 model）
    value.gemini_key_enc = cur.gemini_key_enc;
  }

  const { error } = await admin
    .from("site_settings")
    .upsert(
      { key: AI_CONFIG_KEY, value, is_public: false },
      { onConflict: "key" },
    );
  if (error) return { error: error.message };

  revalidateTag("site_settings", "max");
  return { ok: true };
}
