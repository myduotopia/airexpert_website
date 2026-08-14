import type { MetadataRoute } from "next";
import {
  getPublishedProducts,
  getPublishedServices,
  getPublishedArticles,
  getPublishedCases,
  getPublishedPhotoAlbums,
} from "@/lib/data";

// Overridable at deploy; same fallback as robots.ts / layout metadataBase.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.airexpert.com.tw";

// Static routes mirror the App Router tree (see src/app). Kept in sync by hand;
// dynamic detail pages are appended from the data layer below.
const STATIC_PATHS = [
  "/",
  "/products",
  "/news",
  "/cases",
  "/services",
  "/events",
  "/contact",
] as const;

// File convention: app/sitemap.ts default-exports a function returning
// MetadataRoute.Sitemap, which Next serves at /sitemap.xml.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));

  // All data helpers are server-only and run here on the server. Each query
  // returns only published rows; per-row `noindex` content is intentionally
  // still listed here (sitemap = discovery), the page-level robots meta from
  // V3-1 governs indexing — sitemap and noindex are orthogonal signals.
  const [products, services, articles, cases, albums] = await Promise.all([
    getPublishedProducts(),
    getPublishedServices(),
    getPublishedArticles(),
    getPublishedCases(),
    getPublishedPhotoAlbums(),
  ]);

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: product.updated_at ? new Date(product.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Published service detail pages (/services/[slug]) — DB-driven.
  const serviceEntries: MetadataRoute.Sitemap = services.map((service) => ({
    url: `${SITE_URL}/services/${service.slug}`,
    lastModified: service.updated_at ? new Date(service.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // 最新消息文章 (/news/[slug]) — news 變動較頻繁，weekly。
  const articleEntries: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${SITE_URL}/news/${article.slug}`,
    lastModified: article.updated_at ? new Date(article.updated_at) : now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // 節能實績 (/cases/[slug]) — DB-driven。
  const caseEntries: MetadataRoute.Sitemap = cases.map((item) => ({
    url: `${SITE_URL}/cases/${item.slug}`,
    lastModified: item.updated_at ? new Date(item.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // 公司活動相簿 detail (/events/albums/[slug]) —— events 影片清單無自有 detail 頁，
  // SEO 落在相簿 detail（見 spec §3）。
  const albumEntries: MetadataRoute.Sitemap = albums.map((album) => ({
    url: `${SITE_URL}/events/albums/${album.slug}`,
    lastModified: album.updated_at ? new Date(album.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...productEntries,
    ...serviceEntries,
    ...articleEntries,
    ...caseEntries,
    ...albumEntries,
  ];
}
