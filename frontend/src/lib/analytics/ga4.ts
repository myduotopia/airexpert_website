// frontend/src/lib/analytics/ga4.ts
// GA4 Data API 封裝：純轉換（可測）+ 呼叫與快取（Task 9）。SERVER ONLY。
import "server-only";

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
