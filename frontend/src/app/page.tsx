import { PainCarousel } from "@/components/home/PainCarousel";
import { StatBar } from "@/components/home/StatBar";
import { TechSection } from "@/components/home/TechSection";
import { NewsTeaser } from "@/components/home/NewsTeaser";
import { ProductShowcase } from "@/components/home/ProductShowcase";
import { ProductFeatures } from "@/components/home/ProductFeatures";
import { SocialFollow } from "@/components/home/SocialFollow";
import type { NewsCardProps } from "@/components/NewsCard";
import { getHomeContent } from "@/lib/data/home";
import { getPublishedArticles } from "@/lib/data";
import { formatNewsDate } from "@/components/news/format";
import type { Article } from "@/lib/types";

// 首頁區段（依序）：輪播圖 → 數據列 → 永續節能 → 最新消息(3 篇)
// → 產品系列 → 產品特色 → 追蹤我們。內容皆來自 site_settings（home_*），
// 未 seed 時退回 HOME_DEFAULTS（見 @/lib/data/home），最新消息取自 published 文章。
function articleToNewsCard(article: Article): NewsCardProps {
  return {
    category: article.category,
    date: formatNewsDate(article.published_at),
    title: article.title,
    excerpt: article.excerpt ?? "",
    href: `/news/${article.slug}`,
  };
}

export default async function Home() {
  const home = await getHomeContent();
  const latestArticles = (await getPublishedArticles()).slice(0, 3);
  const newsItems = latestArticles.map(articleToNewsCard);

  return (
    <>
      <PainCarousel slides={home.carousel.slides} />
      <StatBar content={home.stats} />
      <TechSection content={home.tech} />
      <NewsTeaser content={home.news} items={newsItems} />
      <ProductShowcase content={home.products} />
      <ProductFeatures content={home.features} />
      <SocialFollow content={home.social} />
    </>
  );
}
