"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SeoFields } from "@/components/admin/SeoFields";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { useNavigateOnSuccess } from "@/components/admin/useNavigateOnSuccess";
import { CASE_CATEGORIES } from "@/components/cases/constants";
import type { Case, CaseMetrics, ContentStatus } from "@/lib/types";
import type { FormState } from "@/app/admin/(protected)/cases/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已發佈" },
  { value: "archived", label: "已封存" },
];

function imagesToText(images: Case["images"]): string {
  return (images ?? []).map((img) => img.url).join("\n");
}

/** metrics（jsonb）→ 表單可編輯的「逐行 key=value」文字（與 actions.parseMetrics 對稱）。 */
function metricsToText(metrics: CaseMetrics | null | undefined): string {
  if (!metrics || typeof metrics !== "object") return "";
  return Object.entries(metrics)
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join("\n");
}

const labelCls = "text-ink text-[14px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none";
const textareaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";

export function CaseForm({
  action,
  caseItem,
}: {
  action: Action;
  caseItem?: Case;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  useNavigateOnSuccess(state, "/admin/cases");
  const [images, setImages] = useState(imagesToText(caseItem?.images ?? []));
  const uid = useId();

  return (
    <form action={formAction} className="flex max-w-[760px] flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-title`} className={labelCls}>
          標題 *
        </label>
        <input
          id={`${uid}-title`}
          name="title"
          required
          defaultValue={caseItem?.title ?? ""}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-slug`} className={labelCls}>
            網址代稱 slug *
          </label>
          <input
            id={`${uid}-slug`}
            name="slug"
            required
            defaultValue={caseItem?.slug ?? ""}
            placeholder="tsmc-air-saving"
            className={inputCls}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-category`} className={labelCls}>
            分類 *
          </label>
          <select
            id={`${uid}-category`}
            name="category"
            required
            defaultValue={caseItem?.category ?? CASE_CATEGORIES[0]}
            className={inputCls}
          >
            {CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-region`} className={labelCls}>
            地區
          </label>
          <input
            id={`${uid}-region`}
            name="region"
            defaultValue={caseItem?.region ?? ""}
            placeholder="新竹科學園區"
            className={inputCls}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-industry`} className={labelCls}>
            產業
          </label>
          <input
            id={`${uid}-industry`}
            name="industry"
            defaultValue={caseItem?.industry ?? ""}
            placeholder="半導體"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-body`} className={labelCls}>
          內文 HTML
        </label>
        <textarea
          id={`${uid}-body`}
          name="body_html"
          rows={10}
          defaultValue={caseItem?.body_html ?? ""}
          placeholder="<p>段落…</p>"
          className={`${textareaCls} font-mono text-[13px]`}
        />
      </div>

      {/* metrics：逐行 key=value，例如「年省電度數=42 萬度」。對稱於 actions.parseMetrics。 */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-metrics`} className={labelCls}>
          節能數據（每行一筆，格式 key=value）
        </label>
        <textarea
          id={`${uid}-metrics`}
          name="metrics"
          rows={4}
          defaultValue={metricsToText(caseItem?.metrics)}
          placeholder={"年省電度數=42 萬度\n投資回收期=1.8 年\n能耗節省=28%"}
          className={`${textareaCls} font-mono text-[13px]`}
        />
      </div>

      {/* 圖片：每行一個 URL，首張作封面。 */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>圖片（每行一個 URL，首張為封面）</span>
        <textarea
          name="images"
          rows={3}
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${textareaCls} font-mono text-[13px]`}
        />
        <ImageUploader
          folder="cases"
          onUploaded={(url) =>
            setImages((prev) => (prev ? `${prev}\n${url}` : url))
          }
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-status`} className={labelCls}>
          狀態
        </label>
        <select
          id={`${uid}-status`}
          name="status"
          defaultValue={caseItem?.status ?? "draft"}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* SEO 設定（完整 meta） */}
      <SeoFields values={caseItem} />

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton>{caseItem ? "儲存變更" : "建立實績"}</SubmitButton>
        <Link
          href="/admin/cases"
          className="border-border text-ink hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-medium"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
