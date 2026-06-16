import type { Metadata } from "next";
import { getPublishedArticles, getArticlesByCategory } from "@/lib/data";
import {
  NEWS_CATEGORIES,
  NEWS_FILTER_ALL,
  type NewsCategory,
} from "@/components/news/constants";
import { FilterRow } from "@/components/news/FilterRow";
import { FeaturedArticle } from "@/components/news/FeaturedArticle";
import { EditorPicks } from "@/components/news/EditorPicks";
import { ArticleCard } from "@/components/news/ArticleCard";
import { Newsletter } from "@/components/news/Newsletter";

export const metadata: Metadata = {
  title: "最新消息",
  description:
    "產品發表、技術專文、永續報告與企業動態，掌握超勁賀的最新節能氣源資訊。",
};

function isValidCategory(value: string): value is NewsCategory {
  return (NEWS_CATEGORIES as readonly string[]).includes(value);
}

export default async function NewsPage({
  searchParams,
}: {
  // Next.js 16：searchParams 為非同步。
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const active =
    category && isValidCategory(category) ? category : NEWS_FILTER_ALL;

  const articles =
    active === NEWS_FILTER_ALL
      ? await getPublishedArticles()
      : await getArticlesByCategory(active);

  // 只在「全部」且有資料時顯示主打＋編輯推薦版塊，避免分類視圖重複。
  const showFeatured = active === NEWS_FILTER_ALL && articles.length > 0;
  const featured = showFeatured ? articles[0] : null;
  const picks = showFeatured ? articles.slice(1, 6) : [];
  const gridArticles = showFeatured ? articles.slice(1) : articles;

  return (
    <>
      {/* Hero（node r4IZjR） */}
      <section className="bg-surface-muted border-border border-b">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-5 px-6 pt-16 pb-10 text-center md:px-20 md:pt-[72px]">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            NEWS &amp; INSIGHTS
          </p>
          <h1 className="text-ink text-[40px] leading-[1.1] font-bold sm:text-[52px]">
            最新消息
          </h1>
          <p className="text-text-muted max-w-[620px] text-[16px] leading-[1.6]">
            產品發表、技術專文、永續報告與企業動態，掌握超勁賀的最新節能氣源資訊。
          </p>
        </div>
      </section>

      {/* FilterRow（node wyHNu） */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-6 md:px-20">
          <FilterRow active={active} />
        </div>
      </section>

      {/* FeaturedBlock（node z6uuR2）：主打 + 編輯推薦 */}
      {featured ? (
        <section className="bg-surface">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-6 py-10 md:px-20 lg:grid-cols-[760px_1fr]">
            <FeaturedArticle article={featured} />
            <EditorPicks articles={picks} />
          </div>
        </section>
      ) : null}

      {/* ArticleGrid（node gTsaA） */}
      <section className="bg-surface">
        <div className="mx-auto max-w-[1440px] px-6 pt-2 pb-12 md:px-20">
          {gridArticles.length === 0 ? (
            <p className="text-text-muted py-16 text-center text-[15px]">
              {active === NEWS_FILTER_ALL
                ? "目前尚無消息，敬請期待。"
                : `「${active}」分類目前尚無消息。`}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {gridArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Newsletter（node QuIZG） */}
      <Newsletter />
    </>
  );
}
