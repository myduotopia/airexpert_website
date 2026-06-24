"use client";

import { useRef, useState, useTransition } from "react";
import {
  generateBodyFromExcerptAction,
  type AiTargetType,
} from "@/lib/ai/actions";

// 「依摘要生成內文」按鈕：讀同表單 name="excerpt"（摘要）與 name="title"（標題）現值，
// 呼叫 generateBodyFromExcerptAction（admin-only）生成內文 HTML，預覽後由編輯者「採用」寫回 body_html。
//
// 內文 / 摘要 / 標題欄位在各表單為非受控；故以 DOM 取值 / 寫值，並派發 input 事件
// 讓受控（若有）/ React 狀態同步。此操作屬「編輯內文」→ 僅 admin 可用。

type FormField = HTMLTextAreaElement | HTMLInputElement;

function findField(root: HTMLElement | null, name: string): FormField | null {
  const form = root?.closest("form");
  // 只取表單控制項（與 AiRefineButton 的嚴格選擇器一致），避免誤抓同名非欄位節點。
  return (
    (form?.querySelector(
      `input[name="${name}"], textarea[name="${name}"], select[name="${name}"]`,
    ) as FormField | null) ?? null
  );
}

/** 以原生 setter 寫值並派發 input 事件，確保受控元件也能同步。 */
function setFieldValue(field: FormField, value: string): void {
  const proto = Object.getPrototypeOf(field) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AiGenerateBodyButton({
  targetType,
  targetId,
}: {
  targetType: AiTargetType;
  targetId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // 以自身節點定位所屬 form / 欄位，避免依賴 document.activeElement（焦點移動會失準）。
  const rootRef = useRef<HTMLDivElement>(null);

  function onGenerate() {
    setError(null);
    setPreview(null);
    const excerpt = findField(rootRef.current, "excerpt")?.value ?? "";
    const title = findField(rootRef.current, "title")?.value ?? "";
    if (!excerpt.trim()) {
      setError("請先輸入摘要，再使用依摘要生成內文。");
      return;
    }
    startTransition(async () => {
      const res = await generateBodyFromExcerptAction(
        { excerpt, title },
        { targetType, targetId },
      );
      if (res.ok) setPreview(res.html);
      else setError(res.error);
    });
  }

  function onAccept() {
    const field = findField(rootRef.current, "body_html");
    if (!field) {
      setError("找不到內文欄位，無法填入。");
      return;
    }
    // 生成內文常會在已有內文時誤觸，覆蓋前先確認，避免不可逆的內容遺失。
    if (field.value.trim() && !window.confirm("內文已有內容，確定要覆蓋嗎？")) {
      return;
    }
    if (preview != null) setFieldValue(field, preview);
    setPreview(null);
  }

  return (
    <div
      ref={rootRef}
      className="border-border bg-surface-muted/40 flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "生成中…" : "✨ 依摘要生成內文"}
        </button>
        <span className="text-text-muted text-[12px]">
          依上方「摘要」擴寫成完整內文 HTML，供你審核後採用（會覆蓋現有內文）。
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      {preview != null ? (
        <div className="flex flex-col gap-2">
          <span className="text-ink text-[12px] font-medium">生成結果預覽</span>
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
