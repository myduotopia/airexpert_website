"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import type { Brand, ContentStatus, MediaImage } from "@/lib/types";
import { saveBrand } from "./actions";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已發佈" },
  { value: "archived", label: "已封存" },
];

const inputClass =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";
const labelClass = "text-ink text-[13px] font-medium";

export function BrandForm({ brand }: { brand?: Brand }) {
  const router = useRouter();
  const [images, setImages] = useState<MediaImage[]>(brand?.images ?? []);
  const [logoUrl, setLogoUrl] = useState<string>(brand?.logo_url ?? "");

  // saveBrand 已 bind id；表單 action 直接呼叫。失敗時 server action throw → Next 顯示錯誤頁。
  const action = saveBrand.bind(null, brand?.id ?? null);

  return (
    <form action={action} className="flex flex-col gap-5">
      {/* images 以隱藏 JSON 欄位送出，由下方上傳區維護。 */}
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      {/* logo_url 同樣以隱藏欄位送出，由上傳區或手動輸入維護。 */}
      <input type="hidden" name="logo_url" value={logoUrl} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={labelClass}>
            名稱 *
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={brand?.name ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slug" className={labelClass}>
            Slug *（網址，如 kaishan）
          </label>
          <input
            id="slug"
            name="slug"
            required
            defaultValue={brand?.slug ?? ""}
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="summary" className={labelClass}>
          摘要
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={2}
          defaultValue={brand?.summary ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body_html" className={labelClass}>
          內文 HTML
        </label>
        <textarea
          id="body_html"
          name="body_html"
          rows={8}
          defaultValue={brand?.body_html ?? ""}
          className={`${inputClass} font-mono text-[13px]`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClass}>
            狀態
          </label>
          <select
            id="status"
            name="status"
            defaultValue={brand?.status ?? "draft"}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort_order" className={labelClass}>
            排序
          </label>
          <input
            id="sort_order"
            name="sort_order"
            type="number"
            defaultValue={brand?.sort_order ?? 0}
            className={inputClass}
          />
        </div>
      </div>

      {/* Logo */}
      <fieldset className="border-border flex flex-col gap-2 rounded-lg border p-4">
        <legend className="text-ink px-1 text-[13px] font-medium">Logo</legend>
        {logoUrl ? (
          <div className="flex items-center gap-3">
            <Image
              src={logoUrl}
              alt="Logo 預覽"
              width={64}
              height={64}
              className="border-border h-16 w-16 rounded-md border object-contain"
            />
            <button
              type="button"
              onClick={() => setLogoUrl("")}
              className="text-[13px] font-medium text-red-600 hover:underline"
            >
              移除
            </button>
          </div>
        ) : (
          <ImageUploader
            folder="brands"
            onUploaded={(url) => setLogoUrl(url)}
          />
        )}
      </fieldset>

      {/* Gallery images */}
      <fieldset className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <legend className="text-ink px-1 text-[13px] font-medium">
          品牌圖片（第一張為主圖）
        </legend>
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {images.map((img, index) => (
              <li
                key={img.url}
                className="border-border relative flex flex-col gap-1 rounded-md border p-2"
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? `圖片 ${index + 1}`}
                  width={96}
                  height={96}
                  className="h-24 w-24 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="text-[12px] font-medium text-red-600 hover:underline"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ImageUploader
          folder="brands"
          onUploaded={(url) =>
            setImages((prev) => [
              ...prev,
              { url, alt: null, sort: prev.length },
            ])
          }
        />
      </fieldset>

      {/* SEO */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seo_title" className={labelClass}>
            SEO 標題
          </label>
          <input
            id="seo_title"
            name="seo_title"
            defaultValue={brand?.seo_title ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seo_description" className={labelClass}>
            SEO 描述
          </label>
          <input
            id="seo_description"
            name="seo_description"
            defaultValue={brand?.seo_description ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <div className="border-border flex items-center gap-3 border-t pt-4">
        <SubmitButton>{brand ? "儲存變更" : "建立品牌"}</SubmitButton>
        <button
          type="button"
          onClick={() => router.push("/admin/brands")}
          className="text-text-muted hover:text-ink text-[14px]"
        >
          取消
        </button>
      </div>
    </form>
  );
}
