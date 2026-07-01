import { PainCarousel } from "@/components/home/PainCarousel";
import { StatBar } from "@/components/home/StatBar";
import { CasesSection } from "@/components/home/CasesSection";
import { ProductShowcase } from "@/components/home/ProductShowcase";
import { NewsTeaser } from "@/components/home/NewsTeaser";
import { ServiceProcess } from "@/components/home/ServiceProcess";
import { SocialFollow } from "@/components/home/SocialFollow";
import type { NewsCardProps } from "@/components/NewsCard";
import { getHomeContent } from "@/lib/data/home";
import { getPublishedArticles } from "@/lib/data";
import { formatNewsDate } from "@/components/news/format";
import type { Article } from "@/lib/types";

// 首頁改版（issue #97，依 wholenewhome 2.pen）。輪播以下區段依序：
//   輪播圖 → 數字(StatBar) → 客戶實績(Cases) → 產品系列(Products, 深色 rail)
//   → 最新消息(News, rail) → 服務流程(Service) → 與我們保持聯繫(Contact)。
// 既有 CMS 內容（stats/products/news/social）仍走 site_settings（home_*）；
// 新區塊（Cases/Service/Contact 細節）為靜態內容（@/components/home/content）。
// 已退場：TechSection + CarbonDashboard、ProductFeatures（元件檔保留，首頁不再 render）。
function articleToNewsCard(article: Article): NewsCardProps {
  return {
    category: article.category,
    date: formatNewsDate(article.published_at),
    title: article.title,
    excerpt: article.excerpt ?? "",
    href: `/news/${article.slug}`,
    image: article.cover_image ?? article.images?.[0]?.url ?? null,
  };
}

export default async function Home() {
  const home = await getHomeContent();
  const latestArticles = (await getPublishedArticles()).slice(0, 8);
  const newsItems = latestArticles.map(articleToNewsCard);

  return (
    <>
      <PainCarousel slides={home.carousel.slides} />
      <StatBar content={home.stats} />
      <CasesSection />
      <ProductShowcase content={home.products} />
      <NewsTeaser content={home.news} items={newsItems} />
      <ServiceProcess />
      <SocialFollow content={home.social} />
    </>
  );
}
