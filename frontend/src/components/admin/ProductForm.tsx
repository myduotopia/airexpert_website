"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { useNavigateOnSuccess } from "@/components/admin/useNavigateOnSuccess";
import { ProductImagesField } from "@/components/admin/ProductImagesField";
import { SeoFields } from "@/components/admin/SeoFields";
import { AiRefineButton } from "@/components/admin/ai/AiRefineButton";
import { AiFillSeoButton } from "@/components/admin/ai/AiFillSeoButton";
import { PRODUCT_CATEGORIES } from "@/components/products/categories";
import type { Product } from "@/lib/types";
import type { ProductFormState } from "@/app/admin/(protected)/products/actions";

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
            defaultValue={product?.category ?? PRODUCT_CATEGORIES[0]}
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
          <select
            name="status"
            defaultValue={product?.status ?? "draft"}
            className={inputCls}
          >
            <option value="draft">草稿</option>
            <option value="published">已發佈</option>
            <option value="archived">已封存</option>
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
          placeholder={
            "排氣量=7.5 m³/min\n工作壓力=8 bar\n馬達功率=55 kW\n噪音值=68 dB(A)"
          }
        />
        <span className="text-text-muted text-[12px]">
          每行一個項目，以等號（=）分隔名稱與數值，例如「排氣量=7.5 m³/min」。
        </span>
      </label>

      {/* 圖片 images(jsonb) */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>商品圖片</span>
        <ProductImagesField initial={product?.images ?? []} />
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
