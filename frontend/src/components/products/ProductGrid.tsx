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
  /** 初始選取的分類（例如首頁產品圖以 ?category= 帶入）；非合法分類則為「全部」。 */
  initial?: string;
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
 * Per the V3.08 spec all 6 canonical categories are always shown as chips (with
 * a live count), so visitors see the full system taxonomy even before every
 * category has products. Empty categories render a per-category empty state
 * rather than disappearing.
 */
export function ProductGrid({ products, initial }: ProductGridProps) {
  const initialFilter: Filter = (
    PRODUCT_CATEGORIES as readonly string[]
  ).includes(initial ?? "")
    ? (initial as ProductCategory)
    : ALL_CATEGORY;
  const [active, setActive] = useState<Filter>(initialFilter);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products)
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return map;
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

  const chips: Filter[] = [ALL_CATEGORY, ...PRODUCT_CATEGORIES];

  function countFor(chip: Filter): number {
    return chip === ALL_CATEGORY ? products.length : (counts.get(chip) ?? 0);
  }

  return (
    <div className="flex flex-col gap-8">
      <div
        className="flex flex-wrap gap-3"
        role="group"
        aria-label="產品分類篩選"
      >
        {chips.map((chip) => {
          const isActive = chip === active;
          const count = countFor(chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => setActive(chip)}
              aria-pressed={isActive}
              className={`focus-visible:ring-primary inline-flex items-center gap-2 rounded-3xl border px-4 py-2 text-[16px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                isActive
                  ? "border-primary-deep bg-primary-deep text-white"
                  : "border-border bg-surface-muted text-ink hover:border-primary"
              }`}
            >
              {chip}
              <span
                className={`font-mono text-[13px] ${
                  isActive ? "text-white/70" : "text-text-muted"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="border-border bg-surface-muted text-text-muted flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed px-6 py-16 text-center">
          <p className="text-ink text-[18px] font-semibold">
            {active} 系列建置中
          </p>
          <p className="text-[15px]">此分類產品即將上線，敬請期待。</p>
        </div>
      )}
    </div>
  );
}
