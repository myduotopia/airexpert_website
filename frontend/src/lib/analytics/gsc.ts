// frontend/src/lib/analytics/gsc.ts
// Search Console API 封裝：純轉換（可測）+ 呼叫與快取（Task 11）。SERVER ONLY。
import "server-only";
import type { GscPageRow } from "./types";

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
