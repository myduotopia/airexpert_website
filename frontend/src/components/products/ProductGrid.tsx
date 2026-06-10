"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import {
  ALL_CATEGORY,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from "./categories";

type ProductGridProps = {
  products: Product[];
};

type Filter = ProductCategory | typeof ALL_CATEGORY;

/**
 * Client-side category filter + responsive product grid.
 *
 * The parent server component fetches the full published list once via
 * `getPublishedProducts()` and passes it down; filtering happens in the browser
 * over that array (no query params, no refetch) — simplest behaviour for a list
 * that comfortably fits in one request. The "全部" chip clears the filter.
 *
 * Only categories that actually have products get a chip, so the filter never
 * lands on an empty result (besides the global empty state handled here).
 */
export function ProductGrid({ products }: ProductGridProps) {
  const [active, setActive] = useState<Filter>(ALL_CATEGORY);

  const availableCategories = useMemo(() => {
    const present = new Set(products.map((p) => p.category));
    return PRODUCT_CATEGORIES.filter((c) => present.has(c));
  }, [products]);

  const visible = useMemo(
    () =>
      active === ALL_CATEGORY
        ? products
        : products.filter((p) => p.category === active),
    [products, active],
  );

  if (products.length === 0) {
    return (
      <div className="border-border bg-surface-muted text-text-muted flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed px-6 py-20 text-center">
        <p className="text-ink text-[20px] font-semibold">內容建置中</p>
        <p className="text-[16px]">產品資料即將上線，敬請期待。</p>
      </div>
    );
  }

  const chips: Filter[] = [ALL_CATEGORY, ...availableCategories];

  return (
    <div className="flex flex-col gap-8">
      <div
        className="flex flex-wrap gap-3"
        role="group"
        aria-label="產品分類篩選"
      >
        {chips.map((chip) => {
          const isActive = chip === active;
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActive(chip)}
              aria-pressed={isActive}
              className={`focus-visible:ring-primary rounded-3xl border px-4 py-2 text-[16px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                isActive
                  ? "border-primary-deep bg-primary-deep text-white"
                  : "border-border bg-surface-muted text-ink hover:border-primary"
              }`}
            >
              {chip}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
