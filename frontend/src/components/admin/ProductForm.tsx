"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { useNavigateOnSuccess } from "@/components/admin/useNavigateOnSuccess";
import { ProductImagesField } from "@/components/admin/ProductImagesField";
import { FileUploader } from "@/components/admin/FileUploader";
import { SeoFields } from "@/components/admin/SeoFields";
import { AiRefineButton } from "@/components/admin/ai/AiRefineButton";
import { AiFillSeoButton } from "@/components/admin/ai/AiFillSeoButton";
import { PRODUCT_CATEGORIES } from "@/components/products/categories";
import { hpOutputToText } from "@/lib/products/hp-output";
import type { Product } from "@/lib/types";
import type { ProductFormState } from "@/app/admin/(protected)/products/actions";

// 變頻空壓機才顯示「馬力數 ↔ 造氣量」對照欄位（與 categories.ts 的第一項一致）。
const VFD_COMPRESSOR = "變頻空壓機";

type FormAction = (
  state: ProductFormState,
  formData: FormData,
) => Promise<ProductFormState>;

// spec(jsonb) 在表單裡以「每行 key=value」文字編輯（server action 端 parseSpec 解析）。
function specToText(spec: Product["spec"] | undefined): string {
  if (!spec) return "";
  return Object.entries(spec)
    .filter(([k]) => k.trim() !== "")
    .map(([k, v]) => `${k}=${v ?? ""}`)
    .join("\n");
}

const labelCls = "text-ink text-[13px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border px-3 text-[14px] outline-none";
const areaCls =
  "border-border focus:border-primary w-full rounded-lg border px-3 py-2 text-[14px] outline-none";

export function ProductForm({
  action,
  product,
  submitLabel,
}: {
  action: FormAction;
  product?: Product;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    action,
    {},
  );
  useNavigateOnSuccess(state, "/admin/products");

  // manual_url：受控輸入（可手動貼 URL / 清空），上傳後由 FileUploader 寫回。
  const [manualUrl, setManualUrl] = useState<string>(product?.manual_url ?? "");

  // 分類受控：切到「變頻空壓機」時才顯示 hp_output 對照欄位、並調整規格表提示。
  const [category, setCategory] = useState<string>(
    product?.category ?? PRODUCT_CATEGORIES[0],
  );
  const isVfdCompressor = category === VFD_COMPRESSOR;
  const specPlaceholder = isVfdCompressor
    ? "壓力範圍=5~8 kg/cm²G\n冷卻方式=氣冷、水冷\n潤滑方式=微油"
    : "排氣量=7.5 m³/min\n工作壓力=8 bar\n馬達功率=55 kW\n噪音值=68 dB(A)";

  return (
    <form action={formAction} className="flex max-w-[760px] flex-col gap-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          {state.error}
        </p>
      ) : null}

      {/* 基本資訊 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>商品名稱 *</span>
          <input
            name="name"
            required
            defaultValue={product?.name ?? ""}
            className={inputCls}
            placeholder="AX-S9 無油螺旋空壓機"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Slug（網址代稱）*</span>
          <input
            name="slug"
            required
            defaultValue={product?.slug ?? ""}
            className={inputCls}
            placeholder="ax-s9-oil-free"
            pattern="[a-z0-9-]+"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>分類 *</span>
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputCls}
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>品牌（選填）</span>
          <input
            name="brand"
            defaultValue={product?.brand ?? ""}
            className={inputCls}
            placeholder="KAISHAN / DELTECH"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>狀態</span>
          {/* #89：狀態 UI 簡化為「公開 / 隱藏」（DB enum 仍保留 archived；archived 視為隱藏）。 */}
          <select
            name="status"
            defaultValue={
              product?.status === "published" ? "published" : "draft"
            }
            className={inputCls}
          >
            <option value="published">公開</option>
            <option value="draft">隱藏</option>
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>摘要（列表 / 詳情副標）</span>
        <textarea
          name="summary"
          rows={2}
          defaultValue={product?.summary ?? ""}
          className={areaCls}
          placeholder="一句話描述此商品的核心賣點。"
        />
      </label>

      {/* 規格表 spec(jsonb) */}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>規格表（每行一筆，格式：項目=規格值）</span>
        <textarea
          name="spec"
          rows={8}
          defaultValue={specToText(product?.spec)}
          className={`${areaCls} font-mono text-[13px]`}
          placeholder={specPlaceholder}
        />
        <span className="text-text-muted text-[12px]">
          {isVfdCompressor
            ? "變頻空壓機建議填壓力範圍 / 冷卻方式 / 潤滑方式；馬力數與造氣量請填在下方對照表。"
            : "每行一個項目，以等號（=）分隔名稱與數值，例如「排氣量=7.5 m³/min」。"}
        </span>
      </label>

      {/* hp_output(jsonb)：僅變頻空壓機顯示；馬力數 ↔ 造氣量 一對多對照 */}
      {isVfdCompressor ? (
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>
            馬力數 ↔ 造氣量 對照表（每行一筆，格式：馬力數=造氣量）
          </span>
          <textarea
            name="hp_output"
            rows={7}
            defaultValue={hpOutputToText(product?.hp_output)}
            className={`${areaCls} font-mono text-[13px]`}
            placeholder={"10=1.094\n20=2.372\n30=3.905"}
          />
          <span className="text-text-muted text-[12px]">
            每行一筆，馬力數=造氣量（僅填數字），例如「10=1.094」。前台會顯示為下拉選單，選馬力數即顯示對應造氣量（單位固定
            HP / m³/min）。
          </span>
        </label>
      ) : null}

      {/* 圖片 images(jsonb) */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>商品圖片</span>
        <ProductImagesField initial={product?.images ?? []} />
      </div>

      {/* 技術手冊 PDF manual_url */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>技術手冊 PDF（選填）</span>
        <input
          name="manual_url"
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          placeholder="https://…（或用下方上傳 PDF）"
          className={inputCls}
        />
        <FileUploader
          folder="manuals"
          accept=".pdf,application/pdf"
          onUploaded={(url) => setManualUrl(url)}
        />
        <span className="text-text-muted text-[12px]">
          上傳或貼入技術手冊 PDF 網址；有值時前台商品內頁才會顯示「下載技術手冊
          PDF」按鈕。
        </span>
      </div>

      {/* 內文 */}
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>詳情內文（HTML，選填）</span>
        <textarea
          name="body_html"
          rows={5}
          defaultValue={product?.body_html ?? ""}
          className={`${areaCls} font-mono text-[13px]`}
          placeholder="<p>產品詳細介紹…</p>"
        />
        <AiRefineButton targetType="product" targetId={product?.id ?? null} />
      </label>

      {/* SEO 設定（完整 meta） */}
      <AiFillSeoButton targetType="product" targetId={product?.id ?? null} />
      <SeoFields values={product} />

      <div className="border-border flex items-center gap-3 border-t pt-5">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link
          href="/admin/products"
          className="text-text-muted hover:text-ink text-[14px]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
