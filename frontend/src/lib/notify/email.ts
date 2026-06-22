// Email 通知 — 透過 SMTP（nodemailer）寄送。SERVER ONLY（觸網 + 用密碼）。
//
// 採 SMTP 取代原先的 Resend HTTP API：可搭配任一 SMTP 供應商（Gmail、企業信箱、
// Mailgun SMTP 等），帳密加密存 site_settings.contact_notify。
//
// Vercel serverless 註記：SMTP 在 Vercel functions 可正常運作；連 587（STARTTLS，
// secure=false）或 465（SSL，secure=true）。為避免壞主機卡住 serverless function，
// 已設定 connection/greeting/socket timeouts（~10s）。
//
// 訊息組裝（buildEmailPayload）刻意抽成純函式，方便測試而不觸網。
import "server-only";

import nodemailer from "nodemailer";

import type { ContactNotifyPayload } from "./types";

/** 寄送 email 所需的 SMTP 設定（密碼為已解密明文，僅 server 端存在）。 */
export interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  /** true=465/SSL；false=587/STARTTLS。 */
  smtp_secure: boolean;
  smtp_user: string;
  /** 已解密的明文密碼，絕不外流 / 絕不入錯誤訊息 / 絕不記 log。 */
  smtp_pass: string;
  from_email: string;
  to: string[];
}

/** buildEmailPayload 輸出的訊息內容（純函式產物，可測）。 */
export interface EmailPayload {
  subject: string;
  text: string;
  html?: string;
}

/** SMTP 連線逾時（毫秒）— 避免壞主機卡住 serverless function。 */
const SMTP_TIMEOUT_MS = 10_000;

/** 把一個欄位顯示成「標籤：值」；值為空時顯示「—」。 */
function line(label: string, value: string | null): string {
  const v = (value ?? "").trim();
  return `${label}：${v || "—"}`;
}

/**
 * 由聯絡來信組出 email 訊息內容（純函式，可測）。
 * 內容含 姓名/公司/電話/Email/留言/來源頁。
 */
export function buildEmailPayload(
  submission: ContactNotifyPayload,
): EmailPayload {
  // 去除 CR/LF 再放進 subject（縱深防禦：不依賴 nodemailer 內部對 header 的處理，杜絕標頭注入）。
  const who = (submission.name ?? "").replace(/[\r\n]+/g, " ").trim() || "訪客";
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

  return { subject, text };
}

/**
 * 實際寄送 email（透過 SMTP）。失敗丟錯（由 contact-notify 包覆吞掉）。
 * 錯誤訊息中絕不夾帶密碼。
 */
export async function sendEmail(
  config: SmtpConfig,
  submission: ContactNotifyPayload,
): Promise<void> {
  const payload = buildEmailPayload(submission);

  const transport = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure,
    auth: { user: config.smtp_user, pass: config.smtp_pass },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  try {
    await transport.sendMail({
      from: config.from_email,
      to: config.to,
      subject: payload.subject,
      text: payload.text,
      ...(payload.html ? { html: payload.html } : {}),
    });
  } catch (e) {
    // 重新包成不含密碼的錯誤；nodemailer 的錯誤訊息不含密碼，但仍只取 message 並截斷。
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`SMTP 寄送失敗：${detail.slice(0, 200)}`);
  }
}
