"use client";

import { useState, useTransition } from "react";
import { refineBodyHtmlAction, type AiTargetType } from "@/lib/ai/actions";

// 「AI 修文」按鈕：讀取同表單內 name="body_html" 的 textarea 現值，
// 呼叫 refineBodyHtmlAction（admin-only）取得消毒後 HTML，預覽後由編輯者「採用」寫回欄位。
//
// 內文欄位在各表單為非受控 textarea；故以 DOM 取值 / 寫值，並派發 input 事件
// 讓受控（若有）/ React 狀態同步。此操作屬「編輯內文」→ 僅 admin 可用。

function findBodyField(el: HTMLElement | null): HTMLTextAreaElement | null {
  const form = el?.closest("form");
  return (
    (form?.querySelector(
      'textarea[name="body_html"]',
    ) as HTMLTextAreaElement | null) ?? null
  );
}

/** 以原生 setter 寫值並派發 input 事件，確保受控元件也能同步。 */
function setFieldValue(field: HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AiRefineButton({
  targetType,
  targetId,
}: {
  targetType: AiTargetType;
  targetId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function onRefine(e: React.MouseEvent<HTMLButtonElement>) {
    setError(null);
    setPreview(null);
    const field = findBodyField(e.currentTarget);
    const current = field?.value ?? "";
    if (!current.trim()) {
      setError("請先輸入內文，再使用 AI 修文。");
      return;
    }
    startTransition(async () => {
      const res = await refineBodyHtmlAction(current, { targetType, targetId });
      if (res.ok) setPreview(res.html);
      else setError(res.error);
    });
  }

  function onAccept() {
    const btn = document.activeElement as HTMLElement | null;
    const field = findBodyField(btn);
    if (field && preview != null) setFieldValue(field, preview);
    setPreview(null);
  }

  return (
    <div className="border-border bg-surface-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRefine}
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "修潤中…" : "✨ AI 修文"}
        </button>
        <span className="text-text-muted text-[12px]">
          修正錯字 / 語法並補完內容，輸出乾淨 HTML 供你審核後採用。
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      {preview != null ? (
        <div className="flex flex-col gap-2">
          <span className="text-ink text-[12px] font-medium">修潤結果預覽</span>
          <textarea
            readOnly
            value={preview}
            rows={8}
            className="border-border w-full rounded-lg border bg-white px-3 py-2 font-mono text-[12px] outline-none"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onAccept}
              className="bg-primary hover:bg-primary-deep inline-flex h-8 items-center rounded-lg px-3 text-[12px] font-semibold text-white transition-colors"
            >
              採用並填入內文
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-text-muted hover:text-ink text-[12px]"
            >
              捨棄
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
