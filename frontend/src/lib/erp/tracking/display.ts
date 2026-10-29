// 週報追蹤資料（#272）的顯示格式。純函式，client / server 共用。
//
// 日期：refYear 為「今年」（台北）時，同年顯示 MM/DD（週會簡報慣例），其他年份加民國年 114/12/31；
//       refYear = null（CSV）一律輸出完整西元 YYYY-MM-DD，方便 Excel 排序。

const ROC_OFFSET = 1911;

export function formatTrackingDate(
  iso: string | null | undefined,
  refYear: number | null,
): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  if (refYear === null) return `${m[1]}-${m[2]}-${m[3]}`;
  const year = Number(m[1]);
  if (year === refYear) return `${m[2]}/${m[3]}`;
  return `${year - ROC_OFFSET}/${m[2]}/${m[3]}`;
}

export interface DeliveryWindowText {
  text: string;
  /** 待確認（起迄皆空）：以紅字顯示。 */
  pending: boolean;
}

/** 交機時間：起迄皆空 → 待確認；同日 → 單日；不同日 → 區間。 */
export function formatDeliveryWindow(
  start: string | null,
  end: string | null,
  refYear: number | null,
): DeliveryWindowText {
  const from = start ?? end;
  const to = end ?? start;
  if (!from || !to) return { text: "待確認", pending: true };
  if (from === to) {
    return { text: formatTrackingDate(from, refYear), pending: false };
  }
  return {
    text: `${formatTrackingDate(from, refYear)}~${formatTrackingDate(to, refYear)}`,
    pending: false,
  };
}

/** 清單「處理進度」欄：最新一筆的「日期 內容」；無進度為空字串。 */
export function latestProgressText(
  date: string | null,
  content: string | null,
  refYear: number | null,
): string {
  if (!content) return "";
  const d = formatTrackingDate(date, refYear);
  return d ? `${d} ${content}` : content;
}

/** 今年（台北時區）。 */
export function taipeiYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
    }).format(now),
  );
}
