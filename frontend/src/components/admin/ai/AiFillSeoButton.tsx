"use client";

import { useState, useTransition } from "react";
import { fillSeoFromContentAction, type AiTargetType } from "@/lib/ai/actions";

// 「一鍵填 SEO」按鈕：讀取同表單的標題（name="title" 或 "name"）與內文（name="body_html"），
// 呼叫 fillSeoFromContentAction（admin + seo_manager 可用），把建議填入 SeoFields 的欄位。
//
// SeoFields 的欄位為非受控（defaultValue）；故以 DOM 取值 / 寫值並派發 input 事件。
// slug 僅在目前為空時填入（避免覆蓋既有網址，影響 SEO）。

function getForm(el: HTMLElement | null): HTMLFormElement | null {
  return el?.closest("form") ?? null;
}

function fieldValue(form: HTMLFormElement, name: string): string {
  const el = form.querySelector(`[name="${name}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  return el?.value ?? "";
}

/** 以原生 setter 寫值並派發 input 事件，確保受控元件也能同步。 */
function setNamedValue(
  form: HTMLFormElement,
  name: string,
  value: string,
  { onlyIfEmpty = false }: { onlyIfEmpty?: boolean } = {},
): void {
  const el = form.querySelector(`[name="${name}"]`) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  if (!el) return;
  if (onlyIfEmpty && el.value.trim() !== "") return;
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AiFillSeoButton({
  targetType,
  targetId,
}: {
  targetType: AiTargetType;
  targetId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onFill(e: React.MouseEvent<HTMLButtonElement>) {
    setError(null);
    setDone(false);
    const form = getForm(e.currentTarget);
    if (!form) return;
    // 標題欄位在文章/實績/服務為 name="title"，商品為 name="name"。
    const title = fieldValue(form, "title") || fieldValue(form, "name");
    // 內文：多數表單為 body_html；相簿表單無內文，退回 summary / description。
    const html =
      fieldValue(form, "body_html") ||
      fieldValue(form, "summary") ||
      fieldValue(form, "description");
    if (!title.trim() && !html.trim()) {
      setError("請先輸入標題或內文，再產生 SEO。");
      return;
    }
    startTransition(async () => {
      const res = await fillSeoFromContentAction(
        { title, html },
        { targetType, targetId },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { seo } = res;
      setNamedValue(form, "seo_title", seo.seo_title);
      setNamedValue(form, "seo_description", seo.seo_description);
      setNamedValue(form, "og_title", seo.og_title);
      setNamedValue(form, "og_description", seo.og_description);
      if (seo.slug)
        setNamedValue(form, "slug", seo.slug, { onlyIfEmpty: true });
      if (seo.jsonld)
        setNamedValue(
          form,
          "schema_jsonld",
          JSON.stringify(seo.jsonld, null, 2),
        );
      setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onFill}
          disabled={pending}
          className="border-primary text-primary-deep hover:bg-primary/5 inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60"
        >
          {pending ? "產生中…" : "✨ 一鍵填 SEO"}
        </button>
        <span className="text-text-muted text-[12px]">
          依標題與內文產生 SEO meta 並填入下方欄位（slug 僅在空白時填入）。
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="text-primary-deep text-[13px]">
          已填入 SEO 欄位 ✓ 請展開「SEO 設定」確認後再儲存。
        </p>
      ) : null}
    </div>
  );
}
