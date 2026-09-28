// 時數解析與「目前時數」判定（spec §5.1 / §5.2）— 純函式（client / server 皆可用）。
// 抄表是手寫 / 拍照辨識來的文字（「22,278」「22278H」「0/1500」「２２２７８」），
// 這裡只做保守解析：看不懂就回 null，不猜。
import { MAX_HOURS, type HoursReading } from "./types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_RE = /^\d+(?:\.\d+)?$/;

/** 全形英數 / 標點 → 半形；全形空白 → 半形空白。 */
function toHalfWidth(text: string): string {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/**
 * 時數文字 → 整數小時；無法判讀回 null。
 * - 全形轉半形、去千分位逗號與空白、去單位（小時 / 時 / H / h / hr / hrs）；
 * - 含 `/` 取前段（耗材時數「0/1500」＝已用/壽命）；
 * - 只接受 0–1,000,000 的整數或小數（四捨五入取整），其餘一律 null。
 */
export function parseHours(text: unknown): number | null {
  if (typeof text !== "string") return null;
  let t = toHalfWidth(text).trim();
  if (t === "") return null;
  const slash = t.indexOf("/");
  if (slash >= 0) t = t.slice(0, slash);
  t = t
    .replace(/,/g, "")
    .replace(/小時|hrs?|時|h/gi, "")
    .replace(/\s+/g, "")
    .trim();
  if (!NUMBER_RE.test(t)) return null;
  const n = Math.round(Number(t));
  if (!Number.isFinite(n) || n < 0 || n > MAX_HOURS) return null;
  return n;
}

/** 日期 + 時數文字 → HoursReading；日期或時數不可用回 null。 */
export function readingFrom(
  date: string | null | undefined,
  hoursText: unknown,
  source: HoursReading["source"],
): HoursReading | null {
  if (typeof date !== "string" || !ISO_DATE_RE.test(date)) return null;
  const hours = parseHours(hoursText);
  return hours === null ? null : { date, hours, source };
}

/** 是否為可用的抄表（日期合法、時數為合理數字）。 */
export function isValidReading(
  r: HoursReading | null | undefined,
): r is HoursReading {
  return (
    !!r &&
    typeof r.date === "string" &&
    ISO_DATE_RE.test(r.date) &&
    Number.isFinite(r.hours) &&
    r.hours >= 0 &&
    r.hours <= MAX_HOURS
  );
}

/**
 * 目前時數：日期最新的一筆；同日期以報告單（當次實際抄表）優先。
 * 無可用抄表回 null。
 */
export function latestHours(
  readings: readonly HoursReading[] | null | undefined,
): HoursReading | null {
  let best: HoursReading | null = null;
  for (const r of readings ?? []) {
    if (!isValidReading(r)) continue;
    if (
      !best ||
      r.date > best.date ||
      (r.date === best.date &&
        r.source === "report" &&
        best.source !== "report")
    ) {
      best = r;
    }
  }
  return best;
}

/** 依日期由舊到新排序（同日期報告單在後＝較新）的可用抄表。 */
export function sortReadings(
  readings: readonly HoursReading[] | null | undefined,
): HoursReading[] {
  return (readings ?? []).filter(isValidReading).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.source === b.source) return 0;
    return a.source === "report" ? 1 : -1;
  });
}
