"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveHomeSetting, type SaveResult } from "./actions";

// 單一 site_settings key 的編輯表單。value 以 JSON textarea 編輯（支援巢狀結構），
// 送出後由 saveHomeSetting 解析並 upsert。useActionState 顯示成功 / 錯誤訊息。
export function SettingForm({
  settingKey,
  label,
  description,
  initialJson,
}: {
  settingKey: string;
  label: string;
  description: string;
  initialJson: string;
}) {
  const [state, formAction] = useActionState<SaveResult | null, FormData>(
    saveHomeSetting,
    null,
  );

  return (
    <form
      action={formAction}
      className="border-border rounded-xl border bg-white p-5"
    >
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink text-[16px] font-semibold">{label}</h2>
        <code className="text-text-muted text-[12px]">{settingKey}</code>
      </div>
      <p className="text-text-muted mt-1 text-[13px]">{description}</p>

      <textarea
        name="value"
        defaultValue={initialJson}
        spellCheck={false}
        rows={Math.min(24, initialJson.split("\n").length + 1)}
        className="border-border text-ink focus:border-primary mt-3 w-full rounded-lg border bg-white p-3 font-mono text-[13px] leading-[1.5] outline-none"
      />

      <div className="mt-3 flex items-center gap-3">
        <SubmitButton>儲存</SubmitButton>
        {state?.ok === true && (
          <span className="text-primary-deep text-[13px]">已儲存 ✓</span>
        )}
        {state?.ok === false && (
          <span className="text-[13px] text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  );
}
