// frontend/src/lib/analytics/format.ts
// 純顯示工具：無 I/O，供 server 元件與測試共用。

/** 期間變化比例。上期為 0 且本期非 0 → null（無基準）；兩期皆 0 → 0。 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** 比例 → 帶正負號的百分比字串；null → "—"。 */
export function formatPct(ratio: number | null): string {
  if (ratio === null) return "—";
  const sign = ratio > 0 ? "+" : ratio < 0 ? "-" : "";
  return `${sign}${(Math.abs(ratio) * 100).toFixed(1)}%`;
}

const SECTION_LABELS: Record<string, string> = {
  products: "商品",
  news: "最新消息",
  services: "服務",
  cases: "節能實績",
  events: "公司活動",
};

/** GA4 pagePath → 可讀頁名。去除 query；首頁與已知區段特別處理。 */
export function prettyPagePath(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  if (clean === "/" || clean === "") return "首頁";
  const seg = clean.replace(/^\/+/, "").split("/");
  const label = SECTION_LABELS[seg[0]];
  if (label && seg[1]) return `${label}：${seg.slice(1).join("/")}`;
  if (label && !seg[1]) return label;
  return clean;
}
