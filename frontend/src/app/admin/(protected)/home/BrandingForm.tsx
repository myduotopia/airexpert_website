"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { saveBranding, type SaveResult } from "./actions";

// 單一品牌資產欄位（LOGO 或 favicon）：手填 URL + 上傳 + 即時預覽。
// 受控 input 讓「上傳完成」可直接回填 URL；預覽即時反映目前值。
function AssetField({
  name,
  label,
  help,
  folder,
  initialUrl,
  previewClassName,
  previewBg,
}: {
  name: "logo_url" | "favicon_url";
  label: string;
  help: string;
  folder: string;
  initialUrl: string;
  /** 預覽圖樣式（LOGO 與 favicon 尺寸不同）。 */
  previewClassName: string;
  /** 預覽底色（深色 LOGO 在白底、淺色在深底較易辨識）。 */
  previewBg?: string;
}) {
  const [url, setUrl] = useState(initialUrl);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-ink text-[14px] font-medium">
        {label}
      </label>
      <p className="text-text-muted text-[12px]">{help}</p>

      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <span
            className={`border-border flex items-center justify-center overflow-hidden rounded-md border ${previewBg ?? "bg-white"}`}
          >
            {/* 預覽可能是外部 / data URL，用原生 img 避免 next/image 網域設定。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${label}預覽`} className={previewClassName} />
          </span>
        ) : (
          <span className="text-text-muted text-[13px]">
            尚未設定（將使用內建預設）
          </span>
        )}
        <ImageUploader folder={folder} onUploaded={setUrl} />
      </div>

      <input
        id={name}
        name={name}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… 或上傳後自動填入；留空表示使用內建預設"
        className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[14px] outline-none"
      />
    </div>
  );
}

// 品牌資產設定表單：LOGO + favicon。送出後由 saveBranding upsert site_settings.branding。
export function BrandingForm({
  logoUrl,
  faviconUrl,
}: {
  logoUrl: string;
  faviconUrl: string;
}) {
  const [state, formAction] = useActionState<SaveResult | null, FormData>(
    saveBranding,
    null,
  );

  return (
    <form
      action={formAction}
      className="border-border flex flex-col gap-6 rounded-xl border bg-white p-5"
    >
      <AssetField
        name="logo_url"
        label="網站 LOGO"
        help="顯示於前台頁首（與品牌文字並列）。建議使用透明背景 PNG / SVG，高度約 46px。"
        folder="branding"
        initialUrl={logoUrl}
        previewClassName="h-[46px] w-auto p-1"
      />

      <AssetField
        name="favicon_url"
        label="favicon（瀏覽器分頁圖示）"
        help="瀏覽器分頁與書籤顯示的小圖示，建議正方形（.ico / .png / .svg，32×32 以上）。"
        folder="branding"
        initialUrl={faviconUrl}
        previewClassName="h-8 w-8 p-0.5"
        previewBg="bg-surface-muted"
      />

      <div className="flex items-center gap-3">
        <SubmitButton>儲存品牌資產</SubmitButton>
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
