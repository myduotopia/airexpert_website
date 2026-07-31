// frontend/src/lib/analytics/insights.ts
// 純函式：從 GSC 著陸頁挑「曝光高但 CTR 低」的優化機會。門檻為具名常數，便於日後調整。
import type { GscPageRow, Opportunity } from "./types";

/** 曝光需「大於」此值。 */
export const MIN_IMPRESSIONS = 100;
/** CTR 需「小於」此值（0.01 = 1%）。 */
export const MAX_CTR = 0.01;

/** 由著陸頁 URL 取最後一段作為 slug；壞字串或無 path → 空字串。 */
export function slugFromLandingUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segs = pathname.split("/").filter(Boolean);
    return segs.length ? segs[segs.length - 1] : "";
  } catch {
    return "";
  }
}

/** 篩出優化機會並依曝光遞減排序。 */
export function findOpportunities(rows: GscPageRow[]): Opportunity[] {
  return rows
    .filter((r) => r.impressions > MIN_IMPRESSIONS && r.ctr < MAX_CTR)
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({ ...r, slug: slugFromLandingUrl(r.page) }));
}
