"use client";

import { useId, useState } from "react";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { SeoFieldsValues } from "@/lib/seo";

// 可收合的「SEO 設定」fieldset，五個內容編輯頁共用（新增 / 編輯皆可）。
// 以 defaultValue 帶入現值，使其在受控與非受控表單都能運作；
// og_image_url 以隱藏欄位 + ImageUploader 維護（與 ProductImagesField 同套路）。
// 各 name= 與 server action（buildSeoValues）讀取的鍵一致。
//
// schema_jsonld 在 DB 為 jsonb 物件；表單以 JSON 文字編輯，server action 端解析。

const labelCls = "text-ink text-[13px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none";
const areaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";

/** schema_jsonld（jsonb 物件 / null）→ 表單可編輯的縮排 JSON 文字。 */
function jsonldToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function SeoFields({
  values,
  defaultOpen = false,
}: {
  values?: SeoFieldsValues;
  defaultOpen?: boolean;
}) {
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [ogImage, setOgImage] = useState<string>(values?.og_image_url ?? "");

  return (
    <fieldset className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-ink text-[14px] font-semibold"
        >
          {open ? "▾" : "▸"} SEO 設定
        </button>
      </legend>

      {open ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>SEO 標題（選填）</span>
              <input
                name="seo_title"
                defaultValue={values?.seo_title ?? ""}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>Canonical URL（選填）</span>
              <input
                name="canonical_url"
                defaultValue={values?.canonical_url ?? ""}
                placeholder="https://airexpert.com.tw/…"
                className={inputCls}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className={labelCls}>SEO 描述（選填）</span>
            <textarea
              name="seo_description"
              rows={2}
              defaultValue={values?.seo_description ?? ""}
              className={areaCls}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>OG 標題（選填，預設同 SEO 標題）</span>
              <input
                name="og_title"
                defaultValue={values?.og_title ?? ""}
                className={inputCls}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={labelCls}>
                OG 描述（選填，預設同 SEO 描述）
              </span>
              <input
                name="og_description"
                defaultValue={values?.og_description ?? ""}
                className={inputCls}
              />
            </label>
          </div>

          {/* og_image_url：以隱藏欄位送出，上傳後寫入；亦可手動貼 URL。 */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>OG 分享圖（選填，預設用封面 / 首圖）</span>
            <input
              name="og_image_url"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://…（或用下方上傳）"
              className={inputCls}
            />
            <ImageUploader folder="seo" onUploaded={(url) => setOgImage(url)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-jsonld`} className={labelCls}>
              JSON-LD 結構化資料（選填，需為合法 JSON）
            </label>
            <textarea
              id={`${uid}-jsonld`}
              name="schema_jsonld"
              rows={6}
              defaultValue={jsonldToText(values?.schema_jsonld)}
              placeholder={
                '{\n  "@context": "https://schema.org",\n  "@type": "Product"\n}'
              }
              className={`${areaCls} font-mono text-[13px]`}
            />
            <span className="text-text-muted text-[12px]">
              留空表示不輸出。輸出時會跳脫 `&lt;` 以防 XSS。
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="noindex"
                value="on"
                defaultChecked={values?.noindex ?? false}
                className="h-4 w-4"
              />
              <span className={labelCls}>noindex（不被搜尋引擎索引）</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="nofollow"
                value="on"
                defaultChecked={values?.nofollow ?? false}
                className="h-4 w-4"
              />
              <span className={labelCls}>nofollow（不追蹤頁面連結）</span>
            </label>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
