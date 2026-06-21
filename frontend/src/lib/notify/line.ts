// LINE 通知 — 透過 LINE Messaging API push 推播。SERVER ONLY。
//
// 注意：LINE Notify 已於 2025 停止服務，改用 Messaging API：
//   POST https://api.line.me/v2/bot/message/push
//   Authorization: Bearer <channel access token>
//   body: { to: <user/group/room id>, messages: [{ type: "text", text }] }
//
// 文字組裝（buildLineText / buildLineBody）抽成純函式，方便測試而不觸網。
import "server-only";

import type { ContactNotifyPayload } from "./types";

export const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

/** LINE push 的請求 body 形狀。 */
export interface LinePushBody {
  to: string;
  messages: { type: "text"; text: string }[];
}

export interface SendLineOptions {
  channelToken: string;
  targetId: string;
}

function row(label: string, value: string | null): string {
  const v = (value ?? "").trim();
  return `${label}：${v || "—"}`;
}

/** 由聯絡來信組出 LINE 文字（純函式，可測）。 */
export function buildLineText(submission: ContactNotifyPayload): string {
  const who = (submission.name ?? "").trim() || "訪客";
  return [
    `📩 官網新來信（${who}）`,
    row("公司", submission.company),
    row("電話", submission.phone),
    row("Email", submission.email),
    row("來源頁", submission.source_page),
    "",
    "留言：",
    (submission.message ?? "").trim() || "—",
  ].join("\n");
}

/** 組出 push body（純函式，可測）。 */
export function buildLineBody(
  submission: ContactNotifyPayload,
  targetId: string,
): LinePushBody {
  return {
    to: targetId,
    messages: [{ type: "text", text: buildLineText(submission) }],
  };
}

/**
 * 實際推播 LINE 訊息。失敗丟錯（由 contact-notify 包覆吞掉）。
 * 不在錯誤訊息中夾帶 channel token。
 */
export async function sendLine(
  submission: ContactNotifyPayload,
  opts: SendLineOptions,
): Promise<void> {
  const body = buildLineBody(submission, opts.targetId);
  const res = await fetch(LINE_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.channelToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`LINE 推播失敗（${res.status}）：${detail.slice(0, 200)}`);
  }
}
