import type { MetadataRoute } from "next";

// Overridable at deploy; same fallback as sitemap.ts / layout metadataBase.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.airexpert.com.tw";

// File convention: app/robots.ts default-exports a function returning
// MetadataRoute.Robots, which Next serves at /robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // 公開站台全部允許爬取……
      allow: "/",
      // ……但排除後台與非公開路徑（避免被索引；後台另有 requireAdmin 授權，
      // 此處僅是 robots 層的軟性宣告 + API 內部端點）。
      disallow: ["/admin", "/api/", "/maintenance"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
