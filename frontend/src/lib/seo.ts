// V3 SEO 共用工具（client-safe，純函式以利測試）。
// 提供：
//   * buildSeoMetadata — 把內容列的 SEO 欄位整理成 Next 16 的 Metadata。
//   * jsonLdScriptHtml — 安全序列化 JSON-LD（跳脫 `<` 防 `</script>` breakout / XSS）。
//
// 各 detail 頁的 generateMetadata 與 JSON-LD <script> 一律走此檔，確保行為一致。
import type { Metadata } from "next";

/**
 * 五個內容表共有的 SEO 欄位形狀（0003_v3_seo.sql）。
 * 個別內容型別（Product / Article…）已包含這些欄位，可直接傳入。
 */
export interface SeoFieldsValues {
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  schema_jsonld?: unknown;
  noindex?: boolean | null;
  nofollow?: boolean | null;
}

export interface SeoFallback {
  /** seo_title 缺時的標題（內容名稱 / 標題）。 */
  title: string;
  /** seo_description 缺時的描述（摘要）。 */
  description?: string | null;
  /** og_image_url 缺時的圖片（封面 / 首圖）。 */
  image?: string | null;
}

function clean(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * 依 SEO 欄位 + fallback 組出 Next 16 Metadata：
 *   title       = seo_title ?? fallback.title
 *   description = seo_description ?? fallback.description
 *   alternates.canonical = canonical_url（有設定才輸出）
 *   openGraph   = { title: og_title ?? title, description: og_description ?? description,
 *                   images: og_image_url ?? fallback.image }
 *   robots      = { index: !noindex, follow: !nofollow }
 */
export function buildSeoMetadata(
  seo: SeoFieldsValues,
  fallback: SeoFallback,
): Metadata {
  const title = clean(seo.seo_title) ?? fallback.title;
  const description = clean(seo.seo_description) ?? clean(fallback.description);

  const ogTitle = clean(seo.og_title) ?? title;
  const ogDescription = clean(seo.og_description) ?? description;
  const ogImage = clean(seo.og_image_url) ?? clean(fallback.image);
  const canonical = clean(seo.canonical_url);

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };

  // 僅在實際要限制索引時輸出 robots，避免一般頁面多出冗餘的 index,follow 標籤。
  if (seo.noindex || seo.nofollow) {
    metadata.robots = { index: !seo.noindex, follow: !seo.nofollow };
  }

  if (canonical) {
    metadata.alternates = { canonical };
  }

  return metadata;
}

/**
 * 把 JSON-LD 物件序列化成可安全放進 `<script type="application/ld+json">` 的字串。
 * 重點：跳脫 `<` → `<`，避免內容含 `</script>` 提前關閉標籤造成 XSS。
 * 回傳 null 表示無可輸出（空值 / 空物件）。
 */
export function jsonLdScriptHtml(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return null;
  }
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
