// frontend/src/lib/analytics/gsc.ts
// Search Console API 封裝：純轉換（可測）+ 呼叫與快取（Task 11）。SERVER ONLY。
import "server-only";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "../data/cache";
import { getGoogleAccessToken } from "./google-auth";
import { googleApiPost } from "./google-fetch";
import { computeRange, taipeiTodayYmd, GSC_LAG_DAYS } from "./ranges";
import { findOpportunities } from "./insights";
import type { GscPageRow, GscDashboard } from "./types";

interface RawGscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}
interface RawGsc {
  rows?: RawGscRow[];
}

const n = (v: number | undefined): number =>
  Number.isFinite(v) ? (v as number) : 0;

/** 單維度回應 → 型別化列。dimension 決定 label 欄位名（query 或 page）。 */
export function parseGscRows(
  resp: RawGsc,
  dimension: "query" | "page",
): (GscPageRow & { query: string })[] {
  return (resp.rows ?? []).map((r) => {
    const key = r.keys?.[0] ?? "";
    return {
      ...(dimension === "query" ? { query: key } : { page: key }),
      clicks: n(r.clicks),
      impressions: n(r.impressions),
      ctr: n(r.ctr),
      position: n(r.position),
    } as GscPageRow & { query: string };
  });
}

/** 彙總為總點擊/曝光、整體 CTR、以曝光加權的平均排名。 */
export function sumGscTotals(rows: RawGscRow[]): {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
} {
  let clicks = 0,
    impressions = 0,
    weightedPos = 0;
  for (const r of rows) {
    clicks += n(r.clicks);
    impressions += n(r.impressions);
    weightedPos += n(r.position) * n(r.impressions);
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPos / impressions : 0,
  };
}

const GSC_URL = (siteUrl: string) =>
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/searchAnalytics/query`;

async function query(
  siteUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<RawGsc> {
  return googleApiPost<RawGsc>(GSC_URL(siteUrl), token, body);
}

async function fetchGsc(siteUrl: string, days: number): Promise<GscDashboard> {
  const token = await getGoogleAccessToken();
  const { current, previous } = computeRange(
    taipeiTodayYmd(),
    days,
    GSC_LAG_DAYS,
  );
  const win = (w: { startDate: string; endDate: string }) => ({
    startDate: w.startDate,
    endDate: w.endDate,
  });

  const [curTotals, prevTotals, queries, pages] = await Promise.all([
    query(siteUrl, token, win(current)), // 無 dimensions → 單列總計
    query(siteUrl, token, win(previous)),
    query(siteUrl, token, {
      ...win(current),
      dimensions: ["query"],
      rowLimit: 20,
    }),
    query(siteUrl, token, {
      ...win(current),
      dimensions: ["page"],
      rowLimit: 20,
    }),
  ]);

  const cur = sumGscTotals(curTotals.rows ?? []);
  const prev = sumGscTotals(prevTotals.rows ?? []);
  const pageRows = parseGscRows(pages, "page");

  return {
    kpis: {
      clicks: { value: cur.clicks, previous: prev.clicks },
      impressions: { value: cur.impressions, previous: prev.impressions },
      ctr: { value: cur.ctr, previous: prev.ctr },
      position: { value: cur.position, previous: prev.position },
    },
    queries: parseGscRows(queries, "query"),
    pages: pageRows,
    opportunities: findOpportunities(pageRows),
    asOf: current.endDate,
  };
}

/** 快取包裝：key 含 siteUrl 與 days；tag `analytics`；1 小時。 */
export function getGscDashboard(
  siteUrl: string,
  days: number,
): Promise<GscDashboard> {
  return unstable_cache(
    () => fetchGsc(siteUrl, days),
    ["gsc-dashboard", siteUrl, String(days)],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.analytics] },
  )();
}
