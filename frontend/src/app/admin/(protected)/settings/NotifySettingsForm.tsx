"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import {
  saveContactNotifyConfig,
  sendTestNotify,
  type SettingsState,
  type TestNotifyState,
} from "./actions";
import type { ContactNotifyPublic } from "@/lib/notify/config";

const inputClass =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

function ChannelStatus({
  label,
  result,
}: {
  label: string;
  result: { ok: boolean; error?: string; skipped?: boolean };
}) {
  const text = result.skipped
    ? "未設定（略過）"
    : result.ok
      ? "成功 ✓"
      : `失敗：${result.error ?? "未知錯誤"}`;
  const cls = result.skipped
    ? "text-text-muted"
    : result.ok
      ? "text-primary-deep"
      : "text-red-600";
  return (
    <li className={`text-[14px] ${cls}`}>
      {label}：{text}
    </li>
  );
}

export function NotifySettingsForm({
  config,
}: {
  config: ContactNotifyPublic;
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveContactNotifyConfig,
    {},
  );
  const [testState, testAction] = useActionState<TestNotifyState, FormData>(
    sendTestNotify,
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex max-w-[560px] flex-col gap-4">
        {/* 收件人清單 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email_recipients"
            className="text-ink text-[14px] font-medium"
          >
            Email 收件人（可多筆，以逗號或換行分隔）
          </label>
          <textarea
            id="email_recipients"
            name="email_recipients"
            rows={3}
            defaultValue={config.emailRecipients.join("\n")}
            placeholder="sales@airexpert.com.tw&#10;manager@airexpert.com.tw"
            className="border-border focus:border-primary rounded-lg border px-3 py-2 text-[15px] outline-none"
          />
        </div>

        {/* 寄件人 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="from_email"
            className="text-ink text-[14px] font-medium"
          >
            寄件人 Email（from）
          </label>
          <input
            id="from_email"
            name="from_email"
            type="email"
            autoComplete="off"
            defaultValue={config.fromEmail}
            placeholder="no-reply@airexpert.com.tw"
            className={inputClass}
          />
        </div>

        {/* SMTP 主機 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="smtp_host"
            className="text-ink text-[14px] font-medium"
          >
            SMTP 主機（host）
          </label>
          <input
            id="smtp_host"
            name="smtp_host"
            autoComplete="off"
            defaultValue={config.smtpHost}
            placeholder="smtp.gmail.com"
            className={inputClass}
          />
        </div>

        {/* SMTP 連接埠 + 加密方式 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="smtp_port"
            className="text-ink text-[14px] font-medium"
          >
            SMTP 連接埠（port）
          </label>
          <input
            id="smtp_port"
            name="smtp_port"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={config.smtpPort}
            placeholder="587"
            className={inputClass}
          />
          <label className="text-ink flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              name="smtp_secure"
              value="1"
              defaultChecked={config.smtpSecure}
              className="h-4 w-4"
            />
            使用 SSL（勾選＝465/SSL；取消＝587/STARTTLS）
          </label>
        </div>

        {/* SMTP 帳號 */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="smtp_user"
            className="text-ink text-[14px] font-medium"
          >
            SMTP 帳號（user）
          </label>
          <input
            id="smtp_user"
            name="smtp_user"
            autoComplete="off"
            defaultValue={config.smtpUser}
            placeholder="no-reply@airexpert.com.tw"
            className={inputClass}
          />
        </div>

        {/* SMTP 密碼（遮罩，留空沿用） */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="smtp_pass"
            className="text-ink text-[14px] font-medium"
          >
            SMTP 密碼
          </label>
          <input
            id="smtp_pass"
            name="smtp_pass"
            type="password"
            autoComplete="off"
            placeholder={
              config.hasSmtpPass
                ? "已設定（••••）— 留空則沿用現有"
                : "貼上 SMTP 密碼 / 應用程式密碼"
            }
            className={inputClass}
          />
          <p className="text-text-muted text-[12px]">
            Email 通知透過 SMTP 寄送；密碼加密儲存，只在 server 端使用。
          </p>
        </div>

        {/* LINE channel token（遮罩，留空沿用） */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="line_token"
            className="text-ink text-[14px] font-medium"
          >
            LINE channel access token
          </label>
          <input
            id="line_token"
            name="line_token"
            type="password"
            autoComplete="off"
            placeholder={
              config.hasLineToken
                ? "已設定（••••）— 留空則沿用現有"
                : "貼上 LINE Messaging API channel access token"
            }
            className={inputClass}
          />
          <p className="text-text-muted text-[12px]">
            使用 LINE Messaging API（LINE Notify 已於 2025 停止）；需 LINE
            官方帳號。
          </p>
        </div>

        {/* LINE 目標 id */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="line_target_id"
            className="text-ink text-[14px] font-medium"
          >
            LINE 推播目標 ID（user / group / room id）
          </label>
          <input
            id="line_target_id"
            name="line_target_id"
            autoComplete="off"
            defaultValue={config.lineTargetId}
            placeholder="Uxxxxxxxx... 或 Cxxxxxxxx..."
            className={inputClass}
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-[14px] text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-primary-deep text-[14px]">已儲存 ✓</p>
        ) : null}

        <div>
          <SubmitButton>儲存通知設定</SubmitButton>
        </div>
      </form>

      {/* 測試通知（獨立 form，不影響上方設定） */}
      <form
        action={testAction}
        className="border-border flex flex-col gap-3 border-t pt-5"
      >
        <p className="text-text-muted text-[13px]">
          以一筆測試資料實際發送 Email +
          LINE，確認設定是否正常（不會寫入來信紀錄）。
        </p>
        <div>
          <SubmitButton variant="primary" pendingText="發送中…">
            發送測試通知
          </SubmitButton>
        </div>
        {testState.error ? (
          <p role="alert" className="text-[14px] text-red-600">
            {testState.error}
          </p>
        ) : null}
        {testState.ok && testState.result ? (
          <ul className="flex flex-col gap-1">
            <ChannelStatus label="Email" result={testState.result.email} />
            <ChannelStatus label="LINE" result={testState.result.line} />
          </ul>
        ) : null}
      </form>
    </div>
  );
}
