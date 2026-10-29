// ⚠️ 暫代版（#272）：#271 合併後改用 lib/erp/meeting/date-range.ts，並刪除本檔。
// 報表工具列的日期區間快速選項（本週／上週／本月／上月）與標題用的「MM/DD~MM/DD」。純函式。
// 週以星期一為第一天；日期皆為 YYYY-MM-DD（台北日期由呼叫端傳入 today）。

export type DatePreset =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month";

export const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "this_week", label: "本週" },
  { key: "last_week", label: "上週" },
  { key: "this_month", label: "本月" },
  { key: "last_month", label: "上月" },
];

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function presetRange(
  preset: DatePreset,
  today: string,
): { from: string; to: string } {
  const t = parse(today);
  if (preset === "this_week" || preset === "last_week") {
    const monday = addDays(t, -((t.getUTCDay() + 6) % 7));
    const start = preset === "this_week" ? monday : addDays(monday, -7);
    return { from: fmt(start), to: fmt(addDays(start, 6)) };
  }
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth() + (preset === "this_month" ? 0 : -1);
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return { from: fmt(first), to: fmt(last) };
}

/** 報表標題的區間：「11/01~11/07」；只有一端時「11/01~」／「~11/07」；皆空為空字串。 */
export function rangeLabel(from: string, to: string): string {
  const md = (iso: string) =>
    iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "";
  if (!from && !to) return "";
  return `${md(from)}~${md(to)}`;
}
