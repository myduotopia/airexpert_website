import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MapPin, Factory } from "lucide-react";
import {
  getCaseBySlug,
  getCaseBySlugPreview,
  getPublishedCases,
} from "@/lib/data";
import { getCurrentAdmin } from "@/lib/admin/auth";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { buildSeoMetadata, buildPreviewMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { MetricsCards } from "@/components/cases/MetricsCards";
import { CaseCard } from "@/components/cases/CaseCard";

// Next 16：dynamic `params` 為 Promise，須 await。
type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

// 已發佈實績在 build 時預先產生；新 slug 仍會 on-demand 渲染（dynamicParams 預設 true）。
export async function generateStaticParams() {
  const cases = await getPublishedCases();
  return cases.map((c) => ({ slug: c.slug }));
}

// generateMetadata 與頁面都呼叫 getCaseBySlug；資料層以 React cache() 包裝，
// 同一請求內只查一次。
export async function generateMetadata(
  props: DetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  let caseItem = await getCaseBySlug(slug);

  if (!caseItem) {
    // 已發佈查無 → 若為登入 admin，改以預覽（不限 status）查；找得到代表是隱藏內容。
    const admin = await getCurrentAdmin();
    if (admin) {
      caseItem = await getCaseBySlugPreview(slug);
      if (caseItem) {
        // 隱藏內容的預覽一律強制 noindex / nofollow（不連動 DB 欄位）。
        return buildPreviewMetadata(caseItem.title);
      }
    }
    return { title: "找不到實績案例" };
  }

  return buildSeoMetadata(caseItem, {
    title: caseItem.title,
    image: caseItem.images?.[0]?.url,
    canonicalPath: `/cases/${slug}`,
  });
}

export default async function CaseDetailPage(props: DetailPageProps) {
  const { slug } = await props.params;
  let caseItem = await getCaseBySlug(slug);
  let isPreview = false;

  if (!caseItem) {
    // 已發佈查無 → 若為登入 admin，以預覽（不限 status）查隱藏內容。
    const admin = await getCurrentAdmin();
    if (admin) {
      caseItem = await getCaseBySlugPreview(slug);
      isPreview = Boolean(caseItem);
    }
  }

  if (!caseItem) {
    notFound();
  }

  const allCases = await getPublishedCases();
  const related = allCases
    .filter((c) => c.id !== caseItem.id && c.category === caseItem.category)
    .slice(0, 3);
  // 同分類不足時，以其他最新案例補滿。
  const relatedFilled =
    related.length >= 3
      ? related
      : [
          ...related,
          ...allCases
            .filter(
              (c) =>
                c.id !== caseItem.id && !related.some((r) => r.id === c.id),
            )
            .slice(0, 3 - related.length),
        ];

  const gallery = (caseItem.images ?? []).filter((img) => img?.url);
  const cover = gallery[0] ?? null;

  return (
    <>
      {isPreview ? <PreviewBanner /> : null}
      <JsonLd data={caseItem.schema_jsonld} />
      {/* Breadcrumb */}
      <section className="bg-surface-muted border-border border-b">
        <div className="text-text-muted mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-6 py-4 text-[13px] md:px-20">
          <Link href="/" className="hover:text-primary-deep transition-colors">
            首頁
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/cases"
            className="hover:text-primary-deep transition-colors"
          >
            節能實績
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{caseItem.category}</span>
        </div>
      </section>

      {/* Case header */}
      <section className="bg-surface">
        <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-6 pt-12 pb-6 md:px-0">
          <div className="text-text-muted flex flex-wrap items-center gap-2.5 text-[13px]">
            <span
              className="inline-flex items-center rounded-[6px] px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {caseItem.category}
            </span>
            {caseItem.region ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {caseItem.region}
              </span>
            ) : null}
            {caseItem.industry ? (
              <span className="inline-flex items-center gap-1">
                <Factory className="h-3.5 w-3.5" aria-hidden="true" />
                {caseItem.industry}
              </span>
            ) : null}
          </div>
          <h1 className="text-ink text-[32px] leading-[1.25] font-bold sm:text-[40px]">
            {caseItem.title}
          </h1>
        </div>
      </section>

      {/* Cover image */}
      {cover ? (
        <section className="bg-surface">
          <div className="mx-auto max-w-[820px] px-6 md:px-0">
            <div className="border-border relative aspect-[820/440] w-full overflow-hidden rounded-[16px] border">
              <Image
                src={cover.url}
                alt={cover.alt ?? caseItem.title}
                fill
                sizes="(max-width: 820px) 100vw, 820px"
                priority
                className="object-cover"
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Metrics 數據卡 */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[820px] px-6 pt-10 md:px-0">
          <MetricsCards metrics={caseItem.metrics} />
        </div>
      </section>

      {/* Body */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[820px] px-6 py-10 md:px-0">
          {caseItem.body_html ? (
            <div
              className="text-ink/90 [&_a]:text-primary-deep [&_h2]:text-ink [&_h3]:text-ink max-w-none text-[17px] leading-[1.8] [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[20px] [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
              // body_html 經 sanitizeBodyHtml allowlist 消毒後才渲染（防 stored XSS）。
              dangerouslySetInnerHTML={{
                __html: sanitizeBodyHtml(caseItem.body_html),
              }}
            />
          ) : (
            <p className="text-text-muted text-[16px]">內容建置中。</p>
          )}

          {/* 內文圖庫（images jsonb，首圖已作封面） */}
          {gallery.length > 1 ? (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {gallery.slice(1).map((img, i) => (
                <div
                  key={img.url}
                  className="border-border relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? `${caseItem.title} 圖 ${i + 1}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 400px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="border-border mt-12 border-t pt-8">
            <Link
              href="/cases"
              className="text-primary-deep inline-flex items-center gap-2 text-[15px] font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              返回節能實績
            </Link>
          </div>
        </div>
      </section>

      {/* Related */}
      {relatedFilled.length > 0 ? (
        <section className="bg-surface-muted border-border border-t">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-14 md:px-20">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
                  RELATED · 延伸案例
                </p>
                <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
                  更多實績
                </h2>
              </div>
              <Link
                href="/cases"
                className="text-primary-deep hidden items-center gap-1 text-[15px] font-medium sm:inline-flex"
              >
                查看全部
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedFilled.map((item) => (
                <CaseCard key={item.id} caseItem={item} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
