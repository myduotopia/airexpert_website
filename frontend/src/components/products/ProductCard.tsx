import Link from "next/link";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { ArrowRight } from "lucide-react";

type ProductCardProps = {
  product: Product;
  /**
   * "list"  — full card with category tag + summary ("查看詳情 →").
   * "related" — compact card with SKU + "查看 →" (used on the detail page).
   */
  variant?: "list" | "related";
};

/**
 * Single reusable product card for both the list grid and the detail page's
 * "related products" grid. White surface, thin border, rounded; image on top,
 * text below. Links to `/products/[slug]`.
 */
export function ProductCard({ product, variant = "list" }: ProductCardProps) {
  const isRelated = variant === "related";
  const primaryImage = product.images?.[0] ?? null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group border-border bg-surface focus-visible:ring-primary block overflow-hidden rounded-[14px] border transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
    >
      <div
        className={`relative w-full overflow-hidden ${isRelated ? "aspect-[16/10]" : "aspect-[16/9]"}`}
      >
        <ProductImage
          image={primaryImage}
          fallbackAlt={product.name}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>

      <div className="flex flex-col gap-2 p-4">
        {isRelated ? (
          product.brand || product.category ? (
            <span className="text-text-muted font-mono text-[11px] tracking-[0.5px] uppercase">
              {product.brand ?? product.category}
            </span>
          ) : null
        ) : (
          <span className="text-primary-deep font-mono text-[11px] tracking-[0.5px] uppercase">
            {product.category}
          </span>
        )}

        <h3 className="text-ink text-[15px] leading-snug font-semibold sm:text-[16px]">
          {product.name}
        </h3>

        {!isRelated && product.summary ? (
          <p className="text-text-muted line-clamp-2 text-[13px] leading-[1.6]">
            {product.summary}
          </p>
        ) : null}

        <span className="text-primary-deep mt-1 inline-flex items-center gap-1 text-[13px] font-medium">
          {isRelated ? "查看" : "查看詳情"}
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
