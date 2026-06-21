// Email 通知 — 透過 Resend HTTP API 寄送。SERVER ONLY（觸網 + 用 API key）。
//
// 選用 Resend 作為 email provider：純 HTTP（POST https://api.resend.com/emails），
// 無需 SDK，與 gemini.ts 的 fetch 模式一致；API key 加密存 site_settings.contact_notify。
//
// 訊息組裝（buildEmailPayload）刻意抽成純函式，方便測試而不觸網。
import "server-only";

import type { ContactNotifyPayload } from "./types";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend /emails 的請求 body 形狀（僅用到的欄位）。 */
export interface ResendEmailBody {
  from: string;
  to: string[];
  subject: string;
  text: string;
}

export interface SendEmailOptions {
  apiKey: string;
  from: string;
  to: string[];
}

/** 把一個欄位顯示成「標籤：值」；值為空時顯示「—」。 */
function line(label: string, value: string | null): string {
  const v = (value ?? "").trim();
  return `${label}：${v || "—"}`;
}

/**
 * 由聯絡來信組出 Resend email body（純函式，可測）。
 * 內容含 姓名/公司/電話/Email/留言/來源頁。
 */
export function buildEmailPayload(
  submission: ContactNotifyPayload,
  opts: { from: string; to: string[] },
): ResendEmailBody {
  const who = (submission.name ?? "").trim() || "訪客";
  const subject = `【官網來信】${who}`;
  const text = [
    "您有一封來自官網聯絡表單的新訊息：",
    "",
    line("姓名", submission.name),
    line("公司", submission.company),
    line("電話", submission.phone),
    line("Email", submission.email),
    line("來源頁", submission.source_page),
    "",
    "需求留言：",
    (submission.message ?? "").trim() || "—",
  ].join("\n");

  return { from: opts.from, to: opts.to, subject, text };
}

/**
 * 實際寄送 email。失敗丟錯（由 contact-notify 包覆吞掉）。
 * 不在錯誤訊息中夾帶 API key。
 */
export async function sendEmail(
  submission: ContactNotifyPayload,
  opts: SendEmailOptions,
): Promise<void> {
  const body = buildEmailPayload(submission, { from: opts.from, to: opts.to });
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Resend 寄送失敗（${res.status}）：${detail.slice(0, 200)}`,
    );
  }
}
