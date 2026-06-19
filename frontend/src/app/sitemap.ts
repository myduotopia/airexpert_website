import type { MetadataRoute } from "next";
import { getPublishedProducts, getPublishedServices } from "@/lib/data";

// Overridable at deploy; same fallback as robots.ts / layout metadataBase.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airexpert.com.tw";

// Static routes mirror the App Router tree (see src/app). Kept in sync by hand;
// dynamic product detail pages are appended from the data layer below.
const STATIC_PATHS = ["/", "/products", "/contact", "/services"] as const;

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

  // getPublishedProducts is server-only and runs here on the server. Empty today
  // (no products published yet); each published slug → /products/[slug] entry.
  const products = await getPublishedProducts();
  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${SITE_URL}/products/${product.slug}`,
    lastModified: product.updated_at ? new Date(product.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Published service detail pages (/services/[slug]) — DB-driven, mirroring
  // products/brands (replaces the previously hardcoded static service paths).
  const services = await getPublishedServices();
  const serviceEntries: MetadataRoute.Sitemap = services.map((service) => ({
    url: `${SITE_URL}/services/${service.slug}`,
    lastModified: service.updated_at ? new Date(service.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...productEntries, ...serviceEntries];
}
