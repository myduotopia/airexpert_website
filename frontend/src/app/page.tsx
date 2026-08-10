import { PainCarousel } from "@/components/home/PainCarousel";
import { StatBar } from "@/components/home/StatBar";
import { CasesSection } from "@/components/home/CasesSection";
import { ProductShowcase } from "@/components/home/ProductShowcase";
import { NewsTeaser } from "@/components/home/NewsTeaser";
import { ClientLogos } from "@/components/home/ClientLogos";
import { ServiceProcess } from "@/components/home/ServiceProcess";
import { SocialFollow } from "@/components/home/SocialFollow";
import type { NewsCardProps } from "@/components/NewsCard";
import { getHomeContent } from "@/lib/data/home";
import { getPublishedArticles } from "@/lib/data";
import { getBranding } from "@/lib/data/site";
import { formatNewsDate } from "@/components/news/format";
import { JsonLd } from "@/components/seo/JsonLd";
import type { Article } from "@/lib/types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airexpert.com.tw";

// 首頁改版（issue #97，依 wholenewhome 2.pen）。輪播以下區段依序：
//   輪播圖 → 數字(StatBar) → 服務流程(Service) → 客戶實績(Cases)
//   → 產品系列(Products, 深色 rail) → 最新消息(News, rail) → 與我們保持聯繫(Contact)。
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
  const { logo_url } = await getBranding();
  const logoAbs = logo_url?.startsWith("http")
    ? logo_url
    : `${SITE_URL}${logo_url ?? "/airexpert-mark.svg"}`;

  // 首頁 Organization 結構化資料：協助 Google 理解品牌與業務範疇（含目標關鍵字）。
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "超勁賀空壓科技",
    alternateName: "AirExpert",
    url: SITE_URL,
    logo: logoAbs,
    description:
      "工業空壓機與節能氣源系統整合服務商，提供空壓機、真空泵浦、鼓風機、乾燥機與節能規劃，並協助評估節能補助與導入 ISO 50001 能源管理。",
    knowsAbout: [
      "工業空壓機",
      "空壓機",
      "真空泵浦",
      "鼓風機",
      "冷凍式乾燥機",
      "節能規劃",
      "節能補助評估",
      "ISO 50001 能源管理",
    ],
    areaServed: "TW",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+886-800-884-588",
      contactType: "customer service",
      email: "Service@airexpert.com.tw",
      areaServed: "TW",
      availableLanguage: ["zh-Hant"],
    },
  };

  return (
    <>
      <JsonLd data={orgSchema} />
      {/* SEO 主標（視覺隱藏、不影響 V3.08 版面）：提供首頁唯一 H1 與核心關鍵字。 */}
      <h1 className="sr-only">
        工業空壓機與節能氣源系統整合服務｜超勁賀空壓科技
      </h1>
      <PainCarousel slides={home.carousel.slides} />
      <StatBar content={home.stats} />
      <ServiceProcess />
      <CasesSection content={home.caseStudy} />
      <ProductShowcase content={home.products} />
      <NewsTeaser content={home.news} items={newsItems} />
      <ClientLogos />
      <SocialFollow content={home.social} />
    </>
  );
}
