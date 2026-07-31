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

export interface Metric {
  value: number;
  previous: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  current: number;
  previous: number | null; // 對齊到上期同一相對日；無對應 → null
}

export interface NamedRow {
  label: string;
  value: number;
  extra?: string; // 次要顯示（如平均停留時間）
}

export interface Ga4Dashboard {
  users: Metric;
  sessions: Metric;
  pageViews: Metric;
  avgEngagementSec: Metric;
  daily: DailyPoint[]; // 每日使用者，本期與上期
  topPages: {
    path: string;
    title: string;
    views: number;
    avgTimeSec: number;
  }[];
  sources: NamedRow[]; // 來源/媒介 → 使用者
  devices: NamedRow[]; // 桌機/手機/平板 → 使用者
  asOf: string; // 本期結束日 YYYY-MM-DD
}

export interface GscKpis {
  clicks: Metric;
  impressions: Metric;
  ctr: Metric; // 0..1
  position: Metric;
}

export interface GscDashboard {
  kpis: GscKpis;
  queries: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }[];
  pages: GscPageRow[];
  opportunities: Opportunity[];
  asOf: string; // GSC 本期結束日（已含 3 天延遲）YYYY-MM-DD
}
