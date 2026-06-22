"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { AiPrompts } from "@/lib/ai/prompts";
import { saveAiPrompts, type SettingsState } from "./actions";

const areaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 font-mono text-[13px] outline-none";

export function AiPromptsForm({
  effective,
  source,
}: {
  /** 目前生效中的 prompt 內容（自訂或預設）。 */
  effective: AiPrompts;
  /** 各欄位來源：default = 使用內建預設；custom = 後台自訂。 */
  source: { fix_article: "default" | "custom"; fill_seo: "default" | "custom" };
}) {
  const [state, formAction] = useActionState<SettingsState, FormData>(
    saveAiPrompts,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="text-text-muted text-[13px]">
        實際內容（HTML / 標題 / 內文）會在送出時自動附加於 prompt
        之後，這裡只需描述「指示」。將欄位清空後儲存，即可還原為內建預設
        prompt。
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="fix_article"
          className="text-ink text-[14px] font-medium"
        >
          AI 修文 prompt（fix_article）
          <span className="text-text-muted ml-2 text-[12px] font-normal">
            目前：{source.fix_article === "custom" ? "自訂" : "內建預設"}
          </span>
        </label>
        <textarea
          id="fix_article"
          name="fix_article"
          rows={10}
          defaultValue={effective.fix_article}
          className={areaCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fill_seo" className="text-ink text-[14px] font-medium">
          一鍵填 SEO prompt（fill_seo）
          <span className="text-text-muted ml-2 text-[12px] font-normal">
            目前：{source.fill_seo === "custom" ? "自訂" : "內建預設"}
          </span>
        </label>
        <textarea
          id="fill_seo"
          name="fill_seo"
          rows={10}
          defaultValue={effective.fill_seo}
          className={areaCls}
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
        <SubmitButton>儲存 Prompt</SubmitButton>
      </div>
    </form>
  );
}
