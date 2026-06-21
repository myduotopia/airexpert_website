import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getArticleBySlug, getPublishedArticles } from "@/lib/data";
import { sanitizeBodyHtml } from "@/lib/sanitize";
import { buildSeoMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { ArticleCard } from "@/components/news/ArticleCard";
import { formatNewsDate } from "@/components/news/format";

// Next 16：dynamic `params` 為 Promise，須 await（見 node_modules/next/dist/docs）。
// 顯式定型，不依賴尚未生成的全域 PageProps helper。
type DetailPageProps = {
  params: Promise<{ slug: string }>;
};

// 已發佈文章在 build 時預先產生；新 slug 仍會 on-demand 渲染（dynamicParams 預設 true）。
export async function generateStaticParams() {
  const articles = await getPublishedArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

// generateMetadata 與頁面都呼叫 getArticleBySlug；資料層以 React cache() 包裝，
// 同一請求內只查一次。
export async function generateMetadata(
  props: DetailPageProps,
): Promise<Metadata> {
  const { slug } = await props.params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: "找不到文章" };
  }

  return buildSeoMetadata(article, {
    title: article.title,
    description: article.excerpt,
    image: article.cover_image,
  });
}

export default async function ArticleDetailPage(props: DetailPageProps) {
  const { slug } = await props.params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const allArticles = await getPublishedArticles();
  const related = allArticles
    .filter((a) => a.id !== article.id && a.category === article.category)
    .slice(0, 3);
  // 同分類不足時，以其他最新文章補滿。
  const relatedFilled =
    related.length >= 3
      ? related
      : [
          ...related,
          ...allArticles
            .filter(
              (a) => a.id !== article.id && !related.some((r) => r.id === a.id),
            )
            .slice(0, 3 - related.length),
        ];

  const gallery = (article.images ?? []).filter((img) => img?.url);

  return (
    <>
      <JsonLd data={article.schema_jsonld} />
      {/* Breadcrumb */}
      <section className="bg-surface-muted border-border border-b">
        <div className="text-text-muted mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-6 py-4 text-[13px] md:px-20">
          <Link href="/" className="hover:text-primary-deep transition-colors">
            首頁
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/news"
            className="hover:text-primary-deep transition-colors"
          >
            最新消息
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{article.category}</span>
        </div>
      </section>

      {/* Article header */}
      <section className="bg-surface">
        <div className="mx-auto flex max-w-[820px] flex-col gap-5 px-6 pt-12 pb-6 md:px-0">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center rounded-[6px] px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {article.category}
            </span>
            <span className="text-text-muted font-mono text-[12px]">
              {formatNewsDate(article.published_at)}
            </span>
          </div>
          <h1 className="text-ink text-[32px] leading-[1.25] font-bold sm:text-[40px]">
            {article.title}
          </h1>
          {article.excerpt ? (
            <p className="text-text-muted text-[18px] leading-[1.7]">
              {article.excerpt}
            </p>
          ) : null}
        </div>
      </section>

      {/* Cover image */}
      {article.cover_image ? (
        <section className="bg-surface">
          <div className="mx-auto max-w-[820px] px-6 md:px-0">
            <div className="border-border relative aspect-[820/440] w-full overflow-hidden rounded-[16px] border">
              <Image
                src={article.cover_image}
                alt={article.title}
                fill
                sizes="(max-width: 820px) 100vw, 820px"
                priority
                className="object-cover"
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Body */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[820px] px-6 py-10 md:px-0">
          {article.body_html ? (
            <div
              className="text-ink/90 [&_a]:text-primary-deep [&_h2]:text-ink [&_h3]:text-ink max-w-none text-[17px] leading-[1.8] [&_a]:underline [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[24px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-[20px] [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
              // body_html 經 sanitizeBodyHtml allowlist 消毒後才渲染（防 stored XSS）。
              dangerouslySetInnerHTML={{
                __html: sanitizeBodyHtml(article.body_html),
              }}
            />
          ) : (
            <p className="text-text-muted text-[16px]">內容建置中。</p>
          )}

          {/* 內文圖庫（images jsonb） */}
          {gallery.length > 0 ? (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {gallery.map((img, i) => (
                <div
                  key={img.url}
                  className="border-border relative aspect-[16/10] w-full overflow-hidden rounded-[12px] border"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? `${article.title} 圖 ${i + 1}`}
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
              href="/news"
              className="text-primary-deep inline-flex items-center gap-2 text-[15px] font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              返回最新消息
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
                  RELATED · 延伸閱讀
                </p>
                <h2 className="text-ink text-[26px] font-bold sm:text-[32px]">
                  更多消息
                </h2>
              </div>
              <Link
                href="/news"
                className="text-primary-deep hidden items-center gap-1 text-[15px] font-medium sm:inline-flex"
              >
                查看全部
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedFilled.map((item) => (
                <ArticleCard key={item.id} article={item} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}
