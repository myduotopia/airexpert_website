// frontend/src/lib/analytics/ranges.ts
// 純函式：計算 GA4/GSC 查詢的本期與上期日期。無 I/O、無 server-only，便於單元測試。

/** 允許的區間天數（對應 UI 的近 7 / 30 / 90 天）。 */
export const RANGE_DAYS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

/** GA4 無回報延遲，但排除當日（不完整）→ 延遲 1 天結算至昨天。 */
export const GA4_LAG_DAYS = 1;
/** Search Console 資料約 2–3 天延遲，保守取 3。 */
export const GSC_LAG_DAYS = 3;

export interface DateWindow {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（含）
}
export interface RangeResult {
  current: DateWindow;
  previous: DateWindow;
}

/** 由 `YYYY-MM-DD` 取 UTC 午夜的 epoch 毫秒。 */
function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
const DAY = 86_400_000;
function utcToYmd(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 由「今天（YYYY-MM-DD）」算出本期與上期。
 * 本期結束 = 今天 - lagDays；本期長度 = days；上期為緊鄰的等長區間。
 */
export function computeRange(
  todayYmd: string,
  days: number,
  lagDays: number,
): RangeResult {
  const todayMs = ymdToUtc(todayYmd);
  const curEnd = todayMs - lagDays * DAY;
  const curStart = curEnd - (days - 1) * DAY;
  const prevEnd = curStart - DAY;
  const prevStart = prevEnd - (days - 1) * DAY;
  return {
    current: { startDate: utcToYmd(curStart), endDate: utcToYmd(curEnd) },
    previous: { startDate: utcToYmd(prevStart), endDate: utcToYmd(prevEnd) },
  };
}

/** 以 Asia/Taipei 時區取「今天」的 YYYY-MM-DD；注入 now 便於測試。 */
export function taipeiTodayYmd(now: Date = new Date()): string {
  // en-CA locale 輸出即 YYYY-MM-DD。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
