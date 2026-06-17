"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveContactInfo, type SaveResult } from "./actions";

// 聯絡資訊（site_settings key=contact_info）的編輯表單。
// value 以 JSON textarea 編輯（支援巢狀 centers 結構），送出後由 saveContactInfo 解析並 upsert。
// useActionState 顯示成功 / 錯誤訊息。
export function ContactInfoForm({ initialJson }: { initialJson: string }) {
  const [state, formAction] = useActionState<SaveResult | null, FormData>(
    saveContactInfo,
    null,
  );

  return (
    <form
      action={formAction}
      className="border-border rounded-xl border bg-white p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink text-[16px] font-semibold">聯絡資訊</h2>
        <code className="text-text-muted text-[12px]">contact_info</code>
      </div>
      <p className="text-text-muted mt-1 text-[13px]">
        編輯聯絡頁右側的服務中心資訊。eyebrow / title / subtitle
        為表單上方文案； centers 為服務中心陣列，每個 center 含 name 與
        lines（label / value / href，href 可為 null）。儲存後即更新公開聯絡頁。
      </p>

      <textarea
        name="value"
        defaultValue={initialJson}
        spellCheck={false}
        rows={Math.min(40, initialJson.split("\n").length + 1)}
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
