"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Service, ContentStatus } from "@/lib/types";
import type { FormState } from "@/app/admin/(protected)/services/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已發佈" },
  { value: "archived", label: "已封存" },
];

function imagesToText(images: Service["images"]): string {
  return (images ?? []).map((img) => img.url).join("\n");
}

const labelCls = "text-ink text-[14px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none";
const textareaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";

export function ServiceForm({
  action,
  service,
}: {
  action: Action;
  service?: Service;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [images, setImages] = useState(imagesToText(service?.images ?? []));
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
          defaultValue={service?.title ?? ""}
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
            defaultValue={service?.slug ?? ""}
            placeholder="energy-plan"
            className={inputCls}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-sort`} className={labelCls}>
            排序（小→大）
          </label>
          <input
            id={`${uid}-sort`}
            name="sort_order"
            type="number"
            defaultValue={service?.sort_order ?? 0}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-summary`} className={labelCls}>
          摘要
        </label>
        <textarea
          id={`${uid}-summary`}
          name="summary"
          rows={2}
          defaultValue={service?.summary ?? ""}
          className={textareaCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-body`} className={labelCls}>
          內文 HTML
        </label>
        <textarea
          id={`${uid}-body`}
          name="body_html"
          rows={12}
          defaultValue={service?.body_html ?? ""}
          placeholder="<p>段落…</p>"
          className={`${textareaCls} font-mono text-[13px]`}
        />
      </div>

      {/* 內文圖：每行一個 URL。第一張作詳情頁主圖。 */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>圖片（每行一個 URL；第一張為主圖）</span>
        <textarea
          name="images"
          rows={3}
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${textareaCls} font-mono text-[13px]`}
        />
        <ImageUploader
          folder="services"
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
          defaultValue={service?.status ?? "draft"}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-seo-title`} className={labelCls}>
          SEO 標題
        </label>
        <input
          id={`${uid}-seo-title`}
          name="seo_title"
          defaultValue={service?.seo_title ?? ""}
          className={inputCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-seo-desc`} className={labelCls}>
          SEO 描述
        </label>
        <textarea
          id={`${uid}-seo-desc`}
          name="seo_description"
          rows={2}
          defaultValue={service?.seo_description ?? ""}
          className={textareaCls}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton>{service ? "儲存變更" : "建立服務"}</SubmitButton>
        <Link
          href="/admin/services"
          className="border-border text-ink hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-medium"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
