"use server";

import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { encryptSecret } from "@/lib/crypto";
import { AI_CONFIG_KEY } from "@/lib/ai/gemini";
import {
  CONTACT_NOTIFY_KEY,
  notifyContactSubmission,
} from "@/lib/notify/contact-notify";
import {
  parseRecipients,
  type ContactNotifyValue,
} from "@/lib/notify/config";
import type { NotifyResult } from "@/lib/notify/types";

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

// ---------- 聯絡通知設定（contact_notify） ----------

/**
 * 儲存聯絡通知設定。機密（Resend key / LINE token）採「留空沿用」語意，
 * 與 saveAiConfig 一致：只有重新輸入才覆寫，否則保留既有加密值。
 */
export async function saveContactNotifyConfig(
  _prev: SettingsState,
  fd: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  const emailRecipients = parseRecipients(
    String(fd.get("email_recipients") ?? ""),
  );
  const fromEmail = String(fd.get("from_email") ?? "").trim();
  const lineTargetId = String(fd.get("line_target_id") ?? "").trim();
  const newResendKey = String(fd.get("resend_key") ?? "").trim();
  const newLineToken = String(fd.get("line_token") ?? "").trim();

  const admin = getAdminSupabase();
  const { data } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", CONTACT_NOTIFY_KEY)
    .maybeSingle();
  const cur = (data?.value ?? {}) as ContactNotifyValue;

  const value: ContactNotifyValue = {
    email_recipients: emailRecipients,
    from_email: fromEmail || undefined,
    line_target_id: lineTargetId || undefined,
  };

  try {
    if (newResendKey) {
      value.resend_key_enc = encryptSecret(newResendKey);
    } else if (cur.resend_key_enc) {
      value.resend_key_enc = cur.resend_key_enc;
    }
    if (newLineToken) {
      value.line_token_enc = encryptSecret(newLineToken);
    } else if (cur.line_token_enc) {
      value.line_token_enc = cur.line_token_enc;
    }
  } catch (e) {
    return { error: `加密失敗：${(e as Error).message}` };
  }

  const { error } = await admin
    .from("site_settings")
    .upsert(
      { key: CONTACT_NOTIFY_KEY, value, is_public: false },
      { onConflict: "key" },
    );
  if (error) return { error: error.message };

  revalidateTag("site_settings", "max");
  return { ok: true };
}

export type TestNotifyState = {
  ok?: boolean;
  error?: string;
  result?: NotifyResult;
};

/**
 * 發送測試通知：用一筆 dummy 來信呼叫 notifyContactSubmission，回傳每管道結果。
 * 不寫入 DB；僅驗證 Email / LINE 設定是否可用。
 */
export async function sendTestNotify(): Promise<TestNotifyState> {
  await requireAdmin();
  const result = await notifyContactSubmission({
    name: "測試通知",
    company: "超勁賀空壓科技",
    phone: "0000-000-000",
    email: "test@example.com",
    message: "這是一封來自後台的測試通知，用於確認 Email / LINE 設定是否正常。",
    source_page: "/admin/settings",
  });
  return { ok: true, result };
}
