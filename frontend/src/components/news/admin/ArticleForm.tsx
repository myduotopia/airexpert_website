"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { NEWS_CATEGORIES } from "@/components/news/constants";
import type { Article, ContentStatus } from "@/lib/types";
import type { FormState } from "@/app/admin/(protected)/news/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已發佈" },
  { value: "archived", label: "已封存" },
];

// published_at（ISO 字串）→ <input type="datetime-local"> 需要的 yyyy-MM-ddThh:mm（本地時間）。
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function imagesToText(images: Article["images"]): string {
  return (images ?? []).map((img) => img.url).join("\n");
}

const labelCls = "text-ink text-[14px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none";
const textareaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";

export function ArticleForm({
  action,
  article,
}: {
  action: Action;
  article?: Article;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [cover, setCover] = useState(article?.cover_image ?? "");
  const [images, setImages] = useState(imagesToText(article?.images ?? []));
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
          defaultValue={article?.title ?? ""}
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
            defaultValue={article?.slug ?? ""}
            placeholder="ax-s9-launch"
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
            defaultValue={article?.category ?? NEWS_CATEGORIES[0]}
            className={inputCls}
          >
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-excerpt`} className={labelCls}>
          摘要
        </label>
        <textarea
          id={`${uid}-excerpt`}
          name="excerpt"
          rows={2}
          defaultValue={article?.excerpt ?? ""}
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
          rows={10}
          defaultValue={article?.body_html ?? ""}
          placeholder="<p>段落…</p>"
          className={`${textareaCls} font-mono text-[13px]`}
        />
      </div>

      {/* 封面圖：上傳後寫入隱藏欄位；亦可手動貼 URL。 */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>封面圖</span>
        <input
          name="cover_image"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…（或用下方上傳）"
          className={inputCls}
        />
        <ImageUploader folder="articles" onUploaded={(url) => setCover(url)} />
      </div>

      {/* 內文圖：每行一個 URL。 */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>內文圖（每行一個 URL）</span>
        <textarea
          name="images"
          rows={3}
          value={images}
          onChange={(e) => setImages(e.target.value)}
          className={`${textareaCls} font-mono text-[13px]`}
        />
        <ImageUploader
          folder="articles"
          onUploaded={(url) =>
            setImages((prev) => (prev ? `${prev}\n${url}` : url))
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-published`} className={labelCls}>
            發佈時間
          </label>
          <input
            id={`${uid}-published`}
            name="published_at"
            type="datetime-local"
            defaultValue={toLocalInput(article?.published_at ?? null)}
            className={inputCls}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-status`} className={labelCls}>
            狀態
          </label>
          <select
            id={`${uid}-status`}
            name="status"
            defaultValue={article?.status ?? "draft"}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-seo-title`} className={labelCls}>
          SEO 標題
        </label>
        <input
          id={`${uid}-seo-title`}
          name="seo_title"
          defaultValue={article?.seo_title ?? ""}
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
          defaultValue={article?.seo_description ?? ""}
          className={textareaCls}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <SubmitButton>{article ? "儲存變更" : "建立文章"}</SubmitButton>
        <Link
          href="/admin/news"
          className="border-border text-ink hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-medium"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
