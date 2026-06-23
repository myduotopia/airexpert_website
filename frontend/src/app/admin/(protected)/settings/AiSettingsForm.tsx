"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveAiConfig, type SettingsState } from "./actions";
import { AI_MODEL_OPTIONS, DEFAULT_AI_MODEL } from "./ai-models";

export function AiSettingsForm({
  hasKey,
  model,
  source,
}: {
  hasKey: boolean;
  model: string;
  source: "db" | "env" | "none";
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveAiConfig,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-[560px] flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="gemini_key"
          className="text-ink text-[14px] font-medium"
        >
          Gemini API key
        </label>
        <input
          id="gemini_key"
          name="gemini_key"
          type="password"
          autoComplete="off"
          placeholder={
            hasKey
              ? "已設定（••••）— 留空則沿用現有"
              : "貼上你的 Gemini API key"
          }
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          目前金鑰來源：
          {source === "db"
            ? "後台設定（已加密儲存）"
            : source === "env"
              ? "環境變數 GEMINI_API_KEY"
              : "尚未設定"}
          。可至 Google AI Studio 免費取得 key；只在 server
          端使用，不會外送瀏覽器。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="model" className="text-ink text-[14px] font-medium">
          模型
        </label>
        <select
          id="model"
          name="model"
          defaultValue={
            AI_MODEL_OPTIONS.includes(
              model as (typeof AI_MODEL_OPTIONS)[number],
            )
              ? model
              : DEFAULT_AI_MODEL
          }
          className="border-border focus:border-primary h-11 rounded-lg border bg-white px-3 text-[15px] outline-none"
        >
          {AI_MODEL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <p className="text-text-muted text-[12px]">
          gemini-2.5-flash：品質較佳；gemini-2.5-flash-lite：較省、較不易遇到尖峰過載。
        </p>
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
        <SubmitButton>儲存設定</SubmitButton>
      </div>
    </form>
  );
}
