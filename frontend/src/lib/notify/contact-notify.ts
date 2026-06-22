// 聯絡通知協調器 — SERVER ONLY。讀 + 解密 site_settings.contact_notify，
// 並行觸發 Email（SMTP / nodemailer）+ LINE（Messaging API）通知。
//
// 設計重點：
// - 任一管道失敗都「不得」中斷另一管道、也不得讓呼叫端（表單送出）失敗 → 各自 try/catch。
// - 未設定的管道視為 skipped（非錯誤）。
// - 回傳 per-channel 結果，供後台「發送測試通知」顯示。
// - 機密只在 server 端解密使用，絕不外流；getContactNotifyConfig 回傳遮罩後的公開設定。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import { decryptSecret } from "../crypto";
import { sendEmail } from "./email";
import { sendLine } from "./line";
import {
  toPublicConfig,
  type ContactNotifyValue,
  type ContactNotifyPublic,
} from "./config";
import type {
  ContactNotifyPayload,
  ChannelResult,
  NotifyResult,
} from "./types";

export const CONTACT_NOTIFY_KEY = "contact_notify";

/** 讀取（含解密）原始設定。SERVER ONLY；以 service_role 讀 is_public=false。 */
async function readValue(): Promise<ContactNotifyValue> {
  const { data } = await getAdminSupabase()
    .from("site_settings")
    .select("value")
    .eq("key", CONTACT_NOTIFY_KEY)
    .maybeSingle();
  return (data?.value ?? {}) as ContactNotifyValue;
}

/**
 * 後台設定頁用：回傳「遮罩後」的公開設定（不含明文機密）。
 */
export async function getContactNotifyConfig(): Promise<ContactNotifyPublic> {
  const value = await readValue();
  return toPublicConfig(value);
}

function ok(): ChannelResult {
  return { ok: true };
}
function skipped(): ChannelResult {
  return { ok: true, skipped: true };
}
function fail(e: unknown): ChannelResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** 解密一個機密欄位；失敗回 null（例如換過 SETTINGS_ENC_KEY）。 */
function tryDecrypt(blob: string | undefined): string | null {
  if (!blob) return null;
  try {
    return decryptSecret(blob);
  } catch {
    return null;
  }
}

async function runEmail(
  value: ContactNotifyValue,
  submission: ContactNotifyPayload,
): Promise<ChannelResult> {
  const recipients = Array.isArray(value.email_recipients)
    ? value.email_recipients
    : [];
  const host = (value.smtp_host ?? "").trim();
  const user = (value.smtp_user ?? "").trim();
  const pass = tryDecrypt(value.smtp_pass_enc);
  const from = (value.from_email ?? "").trim();
  // SMTP 未完整設定（缺 host/user/pass）或無收件人 → 視為略過（非錯誤）。
  if (recipients.length === 0 || !host || !user || !pass || !from) {
    return skipped();
  }
  try {
    await sendEmail(
      {
        smtp_host: host,
        smtp_port: typeof value.smtp_port === "number" ? value.smtp_port : 587,
        smtp_secure: Boolean(value.smtp_secure),
        smtp_user: user,
        smtp_pass: pass,
        from_email: from,
        to: recipients,
      },
      submission,
    );
    return ok();
  } catch (e) {
    return fail(e);
  }
}

async function runLine(
  value: ContactNotifyValue,
  submission: ContactNotifyPayload,
): Promise<ChannelResult> {
  const channelToken = tryDecrypt(value.line_token_enc);
  const targetId = (value.line_target_id ?? "").trim();
  if (!channelToken || !targetId) return skipped();
  try {
    await sendLine(submission, { channelToken, targetId });
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/**
 * 並行寄送 Email + LINE 通知。每管道獨立 try/catch：
 * 一個失敗不影響另一個，也不向呼叫端丟錯（回傳結果即可）。
 */
export async function notifyContactSubmission(
  submission: ContactNotifyPayload,
): Promise<NotifyResult> {
  let value: ContactNotifyValue;
  try {
    value = await readValue();
  } catch (e) {
    // 連設定都讀不到 → 兩管道皆記為失敗，但仍不丟錯。
    const r = fail(e);
    return { email: r, line: r };
  }

  const [email, line] = await Promise.all([
    runEmail(value, submission),
    runLine(value, submission),
  ]);
  return { email, line };
}
