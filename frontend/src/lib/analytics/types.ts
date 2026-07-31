// frontend/src/lib/analytics/types.ts
// analytics 模組共用結果型別（皆為 JSON-serializable，供 unstable_cache 與 RSC 傳遞）。

export interface GscPageRow {
  page: string; // 著陸頁完整 URL
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number; // 平均排名
}

export interface Opportunity extends GscPageRow {
  slug: string; // 由 page 推出，供 /admin/seo?q= 用
}
