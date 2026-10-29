// ERP 週報（#271）共用：網址參數與子頁籤 — 純函式／常數（client / server 皆可用）。
import { meetingRangeParams, type MeetingRange } from "./date-range";

export const MEETING_PATH = "/admin/erp/meeting";
/** 列印頁（無側欄，A4 橫式）：/admin/erp/print/meeting/<tab>，沿用目前的查詢參數。 */
export const MEETING_PRINT_PATH = "/admin/erp/print/meeting";

export type MeetingTab =
  | "delivery"
  | "repairs"
  | "machine-issues"
  | "maintenance";

/** 子頁籤（顯示順序）。 */
export const MEETING_TABS: readonly { key: MeetingTab; label: string }[] = [
  { key: "delivery", label: "交機進度" },
  { key: "repairs", label: "進廠維修" },
  { key: "machine-issues", label: "新機問題" },
  { key: "maintenance", label: "維護完成紀錄" },
];

/** /admin/erp/meeting 導向的預設子頁籤。 */
export const DEFAULT_MEETING_TAB: MeetingTab = "delivery";

export type SearchParamValue = string | string[] | undefined;
export type MeetingSearchParams = Record<string, SearchParamValue>;

/** 取查詢參數的第一個值（陣列取第一個，缺 → ""），並去頭尾空白。 */
export function firstParam(v: SearchParamValue): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

/** 關鍵字：去頭尾空白、最長 100 字。 */
export function keywordParam(v: SearchParamValue): string {
  return firstParam(v).slice(0, 100);
}

/**
 * 組查詢字串（不含「?」）：區間參數 + 其他非空參數。
 * 用於列印連結（與畫面同條件）與子頁籤之間保留區間。
 */
export function meetingQuery(
  range: Pick<MeetingRange, "preset" | "from" | "to">,
  extra: Record<string, string | null | undefined> = {},
): string {
  const qs = new URLSearchParams(meetingRangeParams(range));
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v.trim() !== "") qs.set(k, v.trim());
  }
  return qs.toString();
}

export function meetingTabHref(tab: MeetingTab, query = ""): string {
  return `${MEETING_PATH}/${tab}${query ? `?${query}` : ""}`;
}

export function meetingPrintHref(tab: MeetingTab, query = ""): string {
  return `${MEETING_PRINT_PATH}/${tab}${query ? `?${query}` : ""}`;
}
