import { Hero } from "@/components/home/Hero";
import { HeroImage } from "@/components/home/HeroImage";
import { StatBar } from "@/components/home/StatBar";
import { Partners } from "@/components/home/Partners";
import { ProductOverview } from "@/components/home/ProductOverview";
import { TechSection } from "@/components/home/TechSection";
import { NewsTeaser } from "@/components/home/NewsTeaser";
import { CtaBanner } from "@/components/home/CtaBanner";
import type { NewsCardProps } from "@/components/NewsCard";
import { getHomeContent } from "@/lib/data/home";
import { getPublishedArticles } from "@/lib/data/articles";

// 首頁（V3.08 Eco Green Light）。各區段文案存於 site_settings（公開讀 is_public=true），
// 缺漏時退回 HOME_DEFAULTS；最新消息卡片取自已發佈 articles。
export default async function Home() {
  const [content, articles] = await Promise.all([
    getHomeContent(),
    getPublishedArticles(),
  ]);

  const newsItems: NewsCardProps[] = articles.slice(0, 3).map((article) => ({
    category: article.category,
    date: (article.published_at ?? article.created_at)
      .slice(0, 10)
      .replace(/-/g, "."),
    title: article.title,
    excerpt: article.excerpt ?? "",
    // 最新消息 tab 尚未上線（detail 路由未建），統一導向 /news（由 nav 處理導流）。
    href: "/news",
  }));

  return (
    <>
      <Hero content={content.hero} />
      <HeroImage />
      <StatBar content={content.stats} />
      <Partners content={content.partners} />
      <ProductOverview content={content.overview} />
      <TechSection content={content.tech} />
      <NewsTeaser content={content.news} items={newsItems} />
      <CtaBanner content={content.cta} />
    </>
  );
}
