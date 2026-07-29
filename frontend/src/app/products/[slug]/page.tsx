import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getProductBySlug,
  getProductBySlugPreview,
  getPublishedProducts,
} from "@/lib/data";
import { getCurrentAdmin } from "@/lib/admin/auth";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { buildSeoMetadata, buildPreviewMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import type { Product } from "@/lib/types";
import { Breadcrumb } from "@/components/products/Breadcrumb";
import { ProductImage } from "@/components/products/ProductImage";
import { MetricsBox } from "@/components/products/MetricsBox";
import { SpecTable } from "@/components/products/SpecTable";
import { CompressorSpecTable } from "@/components/products/CompressorSpecTable";
import { rangeLabel } from "@/lib/products/hp-output";
import { FeatureGrid } from "@/components/products/FeatureGrid";
import { ProductCard } from "@/components/products/ProductCard";
import { ArrowRight, Check, Download } from "lucide-react";
import {
  SAMPLE_APPLICATIONS,
  SAMPLE_FEATURES,
} from "@/components/products/sample";

// In Next 16 the dynamic `params` prop is a Promise and must be awaited (see
// node_modules/next/dist/docs/.../file-conventions/page.md). We type it
// explicitly rather than via the global `PageProps<...>` helper, since that
// helper relies on generated types that may not exist before `tsc` runs.
type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

// Prerender known product pages at build; new slugs still render on-demand
// (dynamicParams defaults to true). Empty today (no products yet) → all dynamic.
export async function generateStaticParams() {
  const products = await getPublishedProducts();
  return products.map((product) => ({ slug: product.slug }));
}

// generateMetadata and the page both call getProductBySlug; the data layer wraps
// it in React cache(), so the slug is fetched only once per request.
export async function generateMetadata(
  props: DetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  let product = await getProductBySlug(slug);

  if (!product) {
    // 已發佈查無 → 若為登入 admin，改以預覽（不限 status）查；找得到代表是隱藏內容。
    const admin = await getCurrentAdmin();
    if (admin) {
      product = await getProductBySlugPreview(slug);
      if (product) {
        // 隱藏內容的預覽一律強制 noindex / nofollow（不連動 DB 欄位）。
        return buildPreviewMetadata(product.name);
      }
    }
    return { title: "找不到產品" };
  }

  return buildSeoMetadata(product, {
    title: product.name,
    description: product.summary,
    image: product.images?.[0]?.url,
    canonicalPath: `/products/${slug}`,
  });
}

// 變頻空壓機分類（與 categories.ts 第一項一致）。
const VFD_COMPRESSOR = "變頻空壓機";

/** Up to 4 hero metric highlights pulled from the product's spec jsonb. */
function deriveMetrics(product: Product) {
  const variants = product.hp_output ?? [];

  // 變頻空壓機：以馬力數 / 造氣量「範圍」開頭，再補 spec 固定項（湊滿至多 4 格）。
  if (product.category === VFD_COMPRESSOR && variants.length > 0) {
    const metrics: { label: string; value: string }[] = [];
    const hpRange = rangeLabel(variants.map((r) => r.hp));
    const outRange = rangeLabel(variants.map((r) => r.output));
    if (hpRange) metrics.push({ label: "馬力數", value: `${hpRange} HP` });
    if (outRange)
      metrics.push({ label: "造氣量", value: `${outRange} m³/min` });
    for (const [label, value] of Object.entries(product.spec ?? {})) {
      if (metrics.length >= 4) break;
      if (label.trim() !== "" && value !== null && value !== "") {
        metrics.push({ label, value: String(value) });
      }
    }
    return metrics;
  }

  return Object.entries(product.spec ?? {})
    .filter(
      ([key, value]) => key.trim() !== "" && value !== null && value !== "",
    )
    .slice(0, 4)
    .map(([label, value]) => ({ label, value: String(value) }));
}

export default async function ProductDetailPage(props: DetailPageProps) {
  const { slug } = await props.params;
  let product = await getProductBySlug(slug);
  let isPreview = false;

  if (!product) {
    // 已發佈查無 → 若為登入 admin，以預覽（不限 status）查隱藏內容。
    const admin = await getCurrentAdmin();
    if (admin) {
      product = await getProductBySlugPreview(slug);
      isPreview = Boolean(product);
    }
  }

  if (!product) {
    notFound();
  }

  const allProducts = await getPublishedProducts();
  const related = allProducts.filter((p) => p.id !== product.id).slice(0, 4);

  const metrics = deriveMetrics(product);
  const heroImage = product.images?.[0] ?? null;
  const thumbs = (product.images ?? []).slice(0, 3);
  const features = SAMPLE_FEATURES;
  const applications = SAMPLE_APPLICATIONS;

  return (
    <>
      {isPreview ? <PreviewBanner /> : null}
      <JsonLd data={product.schema_jsonld} />
      <Breadcrumb
        items={[
          { label: "首頁", href: "/" },
          { label: "產品系列", href: "/products" },
          { label: product.category },
          { label: product.name },
        ]}
      />

      {/* Hero */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-14 px-6 py-14 md:px-20 md:pb-16 lg:grid-cols-[1fr_560px]">
          {/* Left: info */}
          <div className="flex flex-col gap-5">
            <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
              {product.category}
              {product.brand ? ` · ${product.brand}` : ""}
            </p>
            <h1 className="text-ink text-[34px] leading-[1.15] font-bold sm:text-[44px]">
              {product.name}
            </h1>
            <p className="text-primary-deep font-mono text-[15px]">
              SKU · {product.slug}
            </p>
            {product.summary ? (
              <p className="text-text-muted text-[17px] leading-[1.65]">
                {product.summary}
              </p>
            ) : null}

            <MetricsBox metrics={metrics} />

            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="bg-primary-deep focus-visible:ring-primary inline-flex items-center justify-center rounded-[26px] px-6 py-3 text-[16px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
              >
                申請報價
              </Link>
              {product.manual_url ? (
                <a
                  href={product.manual_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-border text-ink focus-visible:ring-primary hover:border-primary inline-flex items-center justify-center gap-2 rounded-[26px] border px-6 py-3 text-[16px] font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Download size={16} aria-hidden="true" />
                  下載技術手冊 PDF
                </a>
              ) : null}
            </div>
          </div>

          {/* Right: media */}
          <div className="flex flex-col gap-4">
            <div className="border-border relative aspect-[4/3] w-full overflow-hidden rounded-[16px] border lg:aspect-auto lg:h-[460px]">
              <ProductImage
                image={heroImage}
                fallbackAlt={product.name}
                sizes="(max-width: 1024px) 100vw, 560px"
                priority
              />
            </div>
            {/* Thumbnail row — static for MVP; first is selected. */}
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
                    <ProductImage
                      image={thumb}
                      fallbackAlt={`${product.name} 縮圖 ${index + 1}`}
                      sizes="160px"
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Specifications */}
      <section className="bg-surface-muted border-border border-y">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-16 md:px-20">
          <div className="flex flex-col gap-2">
            <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
              SPECIFICATIONS · 技術規格
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              完整機種規格
            </h2>
          </div>
          {product.category === VFD_COMPRESSOR &&
          (product.hp_output ?? []).length > 0 ? (
            <CompressorSpecTable
              spec={product.spec}
              variants={product.hp_output}
            />
          ) : Object.keys(product.spec ?? {}).length > 0 ? (
            <SpecTable spec={product.spec} />
          ) : (
            <p className="text-text-muted text-[16px]">規格資料建置中。</p>
          )}
          {product.body_html ? (
            <div
              className="text-text-muted prose-sm max-w-none text-[16px] leading-[1.7]"
              // body_html 經 sanitizeBodyHtml allowlist 消毒後才渲染（防 stored XSS）。
              dangerouslySetInnerHTML={{
                __html: sanitizeBodyHtml(product.body_html),
              }}
            />
          ) : null}
        </div>
      </section>

      {/* Key features */}
      <section className="bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-16 md:px-20">
          <div className="flex flex-col gap-2">
            <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
              KEY FEATURES · 核心優勢
            </p>
            <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
              為潔淨而生
            </h2>
          </div>
          <FeatureGrid features={features} />
        </div>
      </section>

      {/* Applications */}
      <section className="bg-surface border-border border-t">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-6 py-14 md:px-20">
          <h2 className="text-ink text-[22px] font-bold sm:text-[26px]">
            應用領域
          </h2>
          <div className="flex flex-wrap gap-3">
            {applications.map((app) => (
              <span
                key={app}
                className="border-border bg-surface-muted text-ink inline-flex items-center gap-2 rounded-3xl border px-[18px] py-3 text-[16px] font-medium"
              >
                <Check size={14} aria-hidden="true" className="text-primary" />
                {app}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Related products */}
      {related.length > 0 ? (
        <section className="bg-surface-muted border-border border-t">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-14 md:px-20 md:pb-16">
            <div className="flex flex-col gap-2">
              <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
                RELATED · 相關產品
              </p>
              <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
                完整氣源系統搭配
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} variant="related" />
              ))}
            </div>
            <Link
              href="/products"
              className="text-primary-deep inline-flex items-center gap-1 self-start text-[16px] font-medium"
            >
              查看所有產品
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}
