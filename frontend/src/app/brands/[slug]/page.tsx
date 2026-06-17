import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { getBrandBySlug, getPublishedBrands } from "@/lib/data";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { Breadcrumb } from "@/components/products/Breadcrumb";
import { BrandImagePlaceholder } from "@/components/brands/BrandImagePlaceholder";
import { BrandCta } from "@/components/brands/BrandCta";

// In Next 16 the dynamic `params` prop is a Promise and must be awaited (see
// node_modules/next/dist/docs/.../file-conventions/page.md). Typed explicitly
// rather than via the global PageProps helper, which relies on generated types
// that may not exist before `tsc` runs.
type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

// Prerender known brand pages at build; new slugs still render on-demand
// (dynamicParams defaults to true).
export async function generateStaticParams() {
  const brands = await getPublishedBrands();
  return brands.map((brand) => ({ slug: brand.slug }));
}

// generateMetadata and the page both call getBrandBySlug; the data layer wraps
// it in React cache(), so the slug is fetched only once per request.
export async function generateMetadata(
  props: DetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    return { title: "找不到品牌" };
  }

  const title = brand.seo_title ?? `${brand.name} — 品牌介紹`;
  const description = brand.seo_description ?? brand.summary ?? undefined;

  return { title, description };
}

export default async function BrandDetailPage(props: DetailPageProps) {
  const { slug } = await props.params;
  const brand = await getBrandBySlug(slug);

  if (!brand) {
    notFound();
  }

  const allBrands = await getPublishedBrands();
  const otherBrands = allBrands.filter((b) => b.id !== brand.id);

  const images = brand.images ?? [];
  const heroImage = images[0] ?? null;
  const thumbs = images.slice(0, 3);

  return (
    <>
      <Breadcrumb
        items={[
          { label: "首頁", href: "/" },
          { label: "品牌介紹", href: "/brands" },
          { label: brand.name },
        ]}
      />

      {/* Hero */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-14 px-6 py-14 md:px-20 md:pb-16 lg:grid-cols-[1fr_560px]">
          {/* Left: info */}
          <div className="flex flex-col gap-5">
            <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
              品牌代理 · BRAND PARTNER
            </p>
            <h1 className="text-ink text-[34px] leading-[1.15] font-bold sm:text-[44px]">
              {brand.name}
            </h1>
            {brand.summary ? (
              <p className="text-text-muted max-w-[640px] text-[17px] leading-[1.7]">
                {brand.summary}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="bg-primary focus-visible:ring-primary inline-flex items-center justify-center rounded-[26px] px-6 py-[14px] text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
              >
                瀏覽相關產品
              </Link>
              {/* TODO(#7): point at the brand's real catalogue PDF once provided. */}
              <a
                href="#"
                className="border-border text-ink focus-visible:ring-primary hover:border-primary inline-flex items-center justify-center gap-2 rounded-[26px] border px-6 py-[14px] text-[15px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <Download size={16} aria-hidden="true" />
                下載品牌型錄 PDF
              </a>
            </div>
          </div>

          {/* Right: media */}
          <div className="flex flex-col gap-4">
            <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-[16px] border lg:aspect-auto lg:h-[460px]">
              {heroImage ? (
                <Image
                  src={heroImage.url}
                  alt={heroImage.alt ?? brand.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 560px"
                  className="object-cover"
                  priority
                />
              ) : (
                <BrandImagePlaceholder
                  label={brand.name}
                  className="h-full w-full"
                />
              )}
            </div>
            {/* Thumbnail row — first is selected. */}
            <div className="grid grid-cols-3 gap-3">
              {(thumbs.length > 0 ? thumbs : [null, null, null]).map(
                (thumb, index) => (
                  <div
                    key={thumb?.url ?? `thumb-${index}`}
                    className={`relative h-[88px] overflow-hidden rounded-[10px] ${
                      index === 0
                        ? "border-primary border-2"
                        : "border-border border"
                    }`}
                  >
                    {thumb ? (
                      <Image
                        src={thumb.url}
                        alt={thumb.alt ?? `${brand.name} 縮圖 ${index + 1}`}
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="bg-surface-muted h-full w-full" />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Brand story / body */}
      {brand.body_html ? (
        <section className="bg-surface-muted border-border border-y">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-16 md:px-20 md:py-20">
            <div className="flex max-w-[760px] flex-col gap-2">
              <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
                ABOUT · 品牌介紹
              </p>
              <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[36px]">
                關於 {brand.name}
              </h2>
            </div>
            <div
              className="text-text-muted prose-sm max-w-[860px] text-[16px] leading-[1.8] md:text-[18px]"
              // body_html 經 sanitizeBodyHtml allowlist 消毒後才渲染（防 stored XSS）。
              dangerouslySetInnerHTML={{
                __html: sanitizeBodyHtml(brand.body_html),
              }}
            />
          </div>
        </section>
      ) : null}

      {/* Other brands */}
      {otherBrands.length > 0 ? (
        <section className="bg-surface border-border border-t">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-14 md:px-20 md:pb-16">
            <div className="flex flex-col gap-2">
              <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
                BRANDS · 其他品牌
              </p>
              <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
                探索其他代理品牌
              </h2>
            </div>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {otherBrands.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/brands/${other.slug}`}
                    className="border-border bg-surface hover:border-primary focus-visible:ring-primary group flex h-full flex-col gap-3 rounded-[16px] border p-8 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
                      {other.slug}
                    </span>
                    <span className="text-ink text-[24px] font-bold">
                      {other.name}
                    </span>
                    {other.summary ? (
                      <span className="text-text-muted text-[16px] leading-[1.7]">
                        {other.summary}
                      </span>
                    ) : null}
                    <span className="text-primary-deep mt-2 inline-flex items-center gap-1 text-[15px] font-semibold">
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
          </div>
        </section>
      ) : null}

      <BrandCta
        title={`想導入 ${brand.name} 的氣源方案？`}
        description="預約專人談話，我們將依您的用氣需求評估最合適的機種與節能配置。"
      />
    </>
  );
}
