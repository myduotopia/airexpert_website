import type { Metadata } from "next";
import { getPublishedProducts } from "@/lib/data";
import { ProductGrid } from "@/components/products/ProductGrid";

export const metadata: Metadata = {
  title: "產品系列",
  description:
    "AirExpert 超勁賀空壓科技完整氣源系統：變頻空壓機、真空泵、鼓風機與乾燥機，為潔淨、節能而生。",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ category }, products] = await Promise.all([
    searchParams,
    getPublishedProducts(),
  ]);

  return (
    <>
      {/* Page header band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20 md:py-20">
          <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
            PRODUCT SYSTEMS · 產品系列
          </p>
          <h1 className="text-ink mt-3 text-[32px] leading-[1.15] font-bold sm:text-[40px]">
            完整氣源系統，為潔淨而生
          </h1>
          <p className="text-text-muted mt-4 max-w-[640px] text-[17px] leading-[1.65]">
            從變頻空壓機到吸附式乾燥機，AirExpert
            提供涵蓋產生、儲存到處理的整合式氣源解決方案，協助產業邁向高效與淨零目標。
          </p>
        </div>
      </section>

      {/* Filters + grid */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-20 md:py-16">
          <ProductGrid products={products} initial={category} />
        </div>
      </section>
    </>
  );
}
