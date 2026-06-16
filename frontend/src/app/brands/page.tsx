import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedBrands } from "@/lib/data";

export const metadata: Metadata = {
  title: "品牌介紹",
  description:
    "AirExpert 超勁賀代理的世界級氣源品牌：開山 KAISHAN 螺旋空壓機與真空設備，以及 DELTECH 來自 SPX FLOW 的相變節能乾燥技術。",
};

export default async function BrandsIndexPage() {
  const brands = await getPublishedBrands();

  return (
    <>
      {/* Page header band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20 md:py-20">
          <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
            BRANDS · 品牌介紹
          </p>
          <h1 className="text-ink mt-3 text-[36px] leading-[1.12] font-bold sm:text-[44px]">
            世界級氣源品牌
          </h1>
          <p className="text-text-muted mt-4 max-w-[640px] text-[18px] leading-[1.65] md:text-[20px]">
            精選代理具備頂尖研發與節能技術的國際品牌，為產業提供更高效、更潔淨的氣源解決方案。
          </p>
        </div>
      </section>

      {/* Brand cards */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-20 md:py-16">
          {brands.length > 0 ? (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {brands.map((brand) => (
                <li key={brand.id}>
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="border-border bg-surface hover:border-primary focus-visible:ring-primary group flex h-full flex-col gap-3 rounded-[16px] border p-8 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
                      {brand.slug}
                    </span>
                    <span className="text-ink text-[26px] font-bold">
                      {brand.name}
                    </span>
                    {brand.summary ? (
                      <span className="text-text-muted text-[17px] leading-[1.7]">
                        {brand.summary}
                      </span>
                    ) : null}
                    <span className="text-primary-deep mt-2 inline-flex items-center gap-1 text-[16px] font-semibold">
                      了解更多
                      <ArrowRight
                        className="h-4 w-4 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted text-[16px]">品牌資料建置中。</p>
          )}
        </div>
      </section>
    </>
  );
}
