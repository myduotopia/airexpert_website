import type { MetadataRoute } from "next";

// Overridable at deploy; same fallback as sitemap.ts / layout metadataBase.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airexpert.com.tw";

// File convention: app/robots.ts default-exports a function returning
// MetadataRoute.Robots, which Next serves at /robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
