"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { encryptSecret } from "@/lib/crypto";
import { AI_CONFIG_KEY } from "@/lib/ai/gemini";
import { AI_PROMPTS_KEY } from "@/lib/ai/prompts";
import {
  CONTACT_NOTIFY_KEY,
  notifyContactSubmission,
} from "@/lib/notify/contact-notify";
import { parseRecipients, type ContactNotifyValue } from "@/lib/notify/config";
import type { NotifyResult } from "@/lib/notify/types";
import { ANALYTICS_KEY } from "@/lib/data/site";
import {
  parseAnalyticsConfig,
  isLikelyGa4Id,
  type AnalyticsValue,
} from "@/lib/analytics/config";
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL } from "./ai-models";

export type SettingsState = { ok?: boolean; error?: string };

type AiConfigValue = { gemini_key_enc?: string; model?: string };

export async function saveAiConfig(
  _prev: SettingsState,
  fd: FormData,
): Promise<SettingsState> {
  await requireAdmin();
  const newKey = String(fd.get("gemini_key") ?? "").trim();
  // 只接受白名單內的模型；其餘（含空值）一律退回預設。
  const rawModel = String(fd.get("model") ?? "").trim();
  const model = (AI_MODEL_OPTIONS as readonly string[]).includes(rawModel)
    ? rawModel
    : DEFAULT_AI_MODEL;

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

  updateTag("site_settings");
  return { ok: true };
}

// ---------- AI Prompt 設定（ai_prompts） ----------

/**
 * 儲存 AI Prompt（fix_article / fill_seo / gen_body）。
 * 語意：欄位留空 → 存空字串，等同「還原預設」（resolveAiPrompts 會退回 DEFAULT_AI_PROMPTS）。
 * is_public=false；admin only。
 */
export async function saveAiPrompts(
  _prev: SettingsState,
  fd: FormData,
): Promise<SettingsState> {
  await requireAdmin();
  const fixArticle = String(fd.get("fix_article") ?? "").trim();
  const fillSeo = String(fd.get("fill_seo") ?? "").trim();
  const genBody = String(fd.get("gen_body") ?? "").trim();

  const { error } = await getAdminSupabase()
    .from("site_settings")
    .upsert(
      {
        key: AI_PROMPTS_KEY,
        value: {
          fix_article: fixArticle,
          fill_seo: fillSeo,
          gen_body: genBody,
        },
        is_public: false,
      },
      { onConflict: "key" },
    );
  if (error) return { error: error.message };

  updateTag("site_settings");
  return { ok: true };
}

// ---------- 聯絡通知設定（contact_notify） ----------

/**
 * 儲存聯絡通知設定。機密（SMTP 密碼 / LINE token）採「留空沿用」語意，
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
  const smtpHost = String(fd.get("smtp_host") ?? "").trim();
  const smtpPortRaw = String(fd.get("smtp_port") ?? "").trim();
  const smtpPort = Number.parseInt(smtpPortRaw, 10);
  const smtpSecure = fd.get("smtp_secure") != null;
  const smtpUser = String(fd.get("smtp_user") ?? "").trim();
  const newSmtpPass = String(fd.get("smtp_pass") ?? "").trim();
  const lineTargetId = String(fd.get("line_target_id") ?? "").trim();
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
    smtp_host: smtpHost || undefined,
    smtp_port: Number.isFinite(smtpPort) ? smtpPort : undefined,
    smtp_secure: smtpSecure,
    smtp_user: smtpUser || undefined,
    line_target_id: lineTargetId || undefined,
  };

  try {
    if (newSmtpPass) {
      value.smtp_pass_enc = encryptSecret(newSmtpPass);
    } else if (cur.smtp_pass_enc) {
      value.smtp_pass_enc = cur.smtp_pass_enc;
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

  updateTag("site_settings");
  return { ok: true };
}

// ---------- 分析與索引設定（analytics：GA4 / GSC） ----------

/**
 * 儲存 GA4 measurement id 與 GSC 驗證碼。皆為公開值（is_public=true），
 * 不加密。留空 → 視為未設定（前台不注入對應功能）。
 */
export async function saveAnalyticsConfig(
  _prev: SettingsState,
  fd: FormData,
): Promise<SettingsState> {
  await requireAdmin();

  // 經純解析正規化（trim + 空值→null），再寫回為字串或省略。
  const parsed = parseAnalyticsConfig({
    ga4_id: String(fd.get("ga4_id") ?? ""),
    gsc_verification: String(fd.get("gsc_verification") ?? ""),
  });

  // 強制 GA4 id 格式（G-XXXX…）：ga4_id 會以原樣插入 layout 的 inline gtag script，
  // 嚴格限制字元集即可杜絕字串跳脫 / inline-script 注入。
  if (parsed.ga4Id && !isLikelyGa4Id(parsed.ga4Id)) {
    return { error: "GA4 測量 ID 格式不正確（應為 G- 開頭的英數字）。" };
  }

  const value: AnalyticsValue = {};
  if (parsed.ga4Id) value.ga4_id = parsed.ga4Id;
  if (parsed.gscVerification) value.gsc_verification = parsed.gscVerification;

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("site_settings")
    .upsert(
      { key: ANALYTICS_KEY, value, is_public: true },
      { onConflict: "key" },
    );
  if (error) return { error: error.message };

  updateTag("site_settings");
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
