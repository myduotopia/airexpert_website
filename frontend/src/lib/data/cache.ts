// 資料層共用：快取設定與錯誤處理。
// 純常數 / 工具，無 server-only 標記，方便日後在 Server Action 以 revalidateTag 失效。

// 已發佈內容變動不頻繁；以 1 小時為基準，搭配 tag 供日後 on-demand 失效。
export const REVALIDATE_SECONDS = 3600;

/** 集中管理快取 tag，供日後在 Server Action / Route Handler 以 revalidateTag 失效。 */
export const CACHE_TAGS = {
  products: "products",
  articles: "articles",
  cases: "cases",
  events: "events",
  photoAlbums: "photo_albums",
  brands: "brands",
  services: "services",
  siteSettings: "site_settings",
  analytics: "analytics",
} as const;

export function throwOnError(
  context: string,
  error: { message: string } | null,
): void {
  if (error) {
    throw new Error(`Supabase query failed (${context}): ${error.message}`);
  }
}
