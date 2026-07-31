// frontend/src/lib/analytics/ga4.ts
// GA4 Data API 封裝：純轉換（可測）+ 呼叫與快取（Task 9）。SERVER ONLY。
import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "../data/cache";
import { getGoogleAccessToken } from "./google-auth";
import { googleApiPost } from "./google-fetch";
import { computeRange, taipeiTodayYmd, GA4_LAG_DAYS } from "./ranges";
import type { Ga4Dashboard, DailyPoint } from "./types";

// ---- 原始回應最小型別（只取用到的欄位）----
interface RawRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
interface RawReport {
  rows?: RawRow[];
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 單列報表取第 i 個 metric 為純量（KPI 用）。缺 → 0。 */
export function parseScalarMetric(resp: RawReport, i: number): number {
  return num(resp.rows?.[0]?.metricValues?.[i]?.value);
}

/** 熱門頁面：dim=[pagePath, pageTitle], metric=[screenPageViews, avgSessionDuration]。 */
export function parseTopPages(
  resp: RawReport,
): { path: string; title: string; views: number; avgTimeSec: number }[] {
  return (resp.rows ?? []).map((r) => {
    const path = r.dimensionValues?.[0]?.value ?? "";
    const rawTitle = r.dimensionValues?.[1]?.value ?? "";
    return {
      path,
      title: rawTitle.trim() || path,
      views: num(r.metricValues?.[0]?.value),
      avgTimeSec: num(r.metricValues?.[1]?.value),
    };
  });
}

/** 單維度 + 單指標 → { label, value }（來源／裝置共用）。 */
export function parseNamedRows(
  resp: RawReport,
): { label: string; value: number }[] {
  return (resp.rows ?? []).map((r) => ({
    label: r.dimensionValues?.[0]?.value ?? "",
    value: num(r.metricValues?.[0]?.value),
  }));
}

const GA4_URL = (propertyId: string) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

interface Window {
  startDate: string;
  endDate: string;
}

async function runReport(
  propertyId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<RawReport> {
  return googleApiPost<RawReport>(GA4_URL(propertyId), token, body);
}

/** 對齊每日兩期：以相對日 index 對應（上期同 index）。長度不足 → previous=null。 */
function buildDaily(cur: RawReport, prev: RawReport): DailyPoint[] {
  const curRows = cur.rows ?? [];
  const prevRows = prev.rows ?? [];
  return curRows.map((r, i) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    current: num(r.metricValues?.[0]?.value),
    previous:
      i < prevRows.length ? num(prevRows[i].metricValues?.[0]?.value) : null,
  }));
}

async function fetchGa4(
  propertyId: string,
  days: number,
): Promise<Ga4Dashboard> {
  const token = await getGoogleAccessToken();
  const { current, previous } = computeRange(
    taipeiTodayYmd(),
    days,
    GA4_LAG_DAYS,
  );

  const kpiMetrics = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "screenPageViews" },
    { name: "averageSessionDuration" },
  ];
  const dr = (w: Window) => [{ startDate: w.startDate, endDate: w.endDate }];

  const [curKpi, prevKpi, curDaily, prevDaily, pages, sources, devices] =
    await Promise.all([
      runReport(propertyId, token, {
        dateRanges: dr(current),
        metrics: kpiMetrics,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(previous),
        metrics: kpiMetrics,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(propertyId, token, {
        dateRanges: dr(previous),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 8,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      }),
    ]);

  const metric = (i: number) => ({
    value: parseScalarMetric(curKpi, i),
    previous: parseScalarMetric(prevKpi, i),
  });

  return {
    users: metric(0),
    sessions: metric(1),
    pageViews: metric(2),
    avgEngagementSec: metric(3),
    daily: buildDaily(curDaily, prevDaily),
    topPages: parseTopPages(pages),
    sources: parseNamedRows(sources),
    devices: parseNamedRows(devices),
    asOf: current.endDate,
  };
}

/** 快取包裝：key 含 propertyId 與 days；tag `analytics`；1 小時。 */
export function getGa4Dashboard(
  propertyId: string,
  days: number,
): Promise<Ga4Dashboard> {
  return unstable_cache(
    () => fetchGa4(propertyId, days),
    ["ga4-dashboard", propertyId, String(days)],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.analytics] },
  )();
}
