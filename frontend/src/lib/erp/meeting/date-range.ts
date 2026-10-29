// ERP 週報（#271）共用：報表日期區間 — 純函式（client / server 皆可用、可單元測試）。
// 一律以「台北時區的今天」為基準（呼叫端傳入 taipeiToday()），週一為一週的第一天。
// 日期皆為西元 ISO 字串 YYYY-MM-DD（DB date 欄位無時區，這裡只做字面日期運算，以 UTC 計算避免時區位移）。
//
// 網址參數（各子頁籤共用）：
//   range = this_week（預設）| last_week | this_month | last_month | custom
//   from / to = 自訂區間的起訖（只在 range=custom 時使用）
import { isIsoDate, taipeiToday } from "@/lib/erp/statement";

export type MeetingRangePreset =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

export const MEETING_RANGE_PRESETS: readonly {
  key: MeetingRangePreset;
  label: string;
}[] = [
  { key: "this_week", label: "本週" },
  { key: "last_week", label: "上週" },
  { key: "this_month", label: "本月" },
  { key: "last_month", label: "上月" },
  { key: "custom", label: "自訂" },
];

export const DEFAULT_MEETING_PRESET: MeetingRangePreset = "this_week";

/** 自訂區間最長天數（起訖相差，與 DB erp_meeting_maintenance 的上限一致）。 */
export const MEETING_RANGE_MAX_DAYS = 366;

export interface MeetingRange {
  preset: MeetingRangePreset;
  /** 起日（含），YYYY-MM-DD。 */
  from: string;
  /** 迄日（含），YYYY-MM-DD。 */
  to: string;
  /** 自訂區間不合法時的提示（此時已退回預設的本週）。 */
  error: string | null;
}

export function isMeetingRangePreset(v: unknown): v is MeetingRangePreset {
  return (
    typeof v === "string" && MEETING_RANGE_PRESETS.some((p) => p.key === v)
  );
}

function toUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** iso 加減天數。 */
export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 兩日相差天數（to − from）。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

/** iso 所在週的週一。 */
export function weekStart(iso: string): string {
  const day = toUtc(iso).getUTCDay(); // 0 = 週日
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  return { from: fromUtc(first), to: fromUtc(last) };
}

/** 預設區間的起訖（custom 視同本週）。today 須為 YYYY-MM-DD。 */
export function presetRange(
  preset: MeetingRangePreset,
  today: string,
): { from: string; to: string } {
  if (!isIsoDate(today)) throw new Error(`日期格式錯誤：${today}`);
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "last_week": {
      const from = addDays(weekStart(today), -7);
      return { from, to: addDays(from, 6) };
    }
    case "this_month":
      return monthRange(y, m);
    case "last_month":
      return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    case "this_week":
    case "custom":
    default: {
      const from = weekStart(today);
      return { from, to: addDays(from, 6) };
    }
  }
}

/** 自訂區間的檢查；合法回 null。 */
export function validateCustomRange(from: string, to: string): string | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return "請填寫完整的起訖日期。";
  if (from > to) return "起日不可晚於迄日。";
  if (daysBetween(from, to) > MEETING_RANGE_MAX_DAYS) {
    return "查詢區間最長一年。";
  }
  return null;
}

/**
 * 網址參數 → 區間。不合法的 range 視為預設（本週）；
 * custom 起訖不合法時退回本週並帶 error（頁面顯示提示）。
 */
export function parseMeetingRange(
  params: { range?: string | null; from?: string | null; to?: string | null },
  today: string = taipeiToday(),
): MeetingRange {
  const preset = isMeetingRangePreset(params.range)
    ? params.range
    : DEFAULT_MEETING_PRESET;
  if (preset === "custom") {
    const from = params.from ?? "";
    const to = params.to ?? "";
    const error = validateCustomRange(from, to);
    if (!error) return { preset, from, to, error: null };
    return {
      preset: DEFAULT_MEETING_PRESET,
      ...presetRange(DEFAULT_MEETING_PRESET, today),
      error: `自訂區間不正確（${error.replace(/。$/, "")}），已改顯示本週。`,
    };
  }
  return { preset, ...presetRange(preset, today), error: null };
}

/** 區間 → 網址參數（custom 才帶 from / to）。 */
export function meetingRangeParams(
  range: Pick<MeetingRange, "preset" | "from" | "to">,
): Record<string, string> {
  return range.preset === "custom"
    ? { range: "custom", from: range.from, to: range.to }
    : { range: range.preset };
}

function mmdd(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

function rocYmd(iso: string): string {
  return `${Number(iso.slice(0, 4)) - 1911}/${mmdd(iso)}`;
}

/**
 * 報表標題用的區間文字：同一年「MM/DD~MM/DD」；跨年加民國年「114/12/29~115/01/04」。
 */
export function meetingRangeLabel(range: { from: string; to: string }): string {
  if (range.from.slice(0, 4) === range.to.slice(0, 4)) {
    return `${mmdd(range.from)}~${mmdd(range.to)}`;
  }
  return `${rocYmd(range.from)}~${rocYmd(range.to)}`;
}

/** 報表標題：「維護完成紀錄 10/27~11/02」。 */
export function meetingReportTitle(
  name: string,
  range: { from: string; to: string },
): string {
  return `${name} ${meetingRangeLabel(range)}`;
}
