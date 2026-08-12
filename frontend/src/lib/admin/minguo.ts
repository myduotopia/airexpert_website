// 民國（ROC）紀年顯示 / 轉換工具。DB 一律存西元（date / timestamptz），
// 這裡只做顯示與輸入層轉換：民國年 = 西元年 − 1911。純函式（client / server 皆可用）。

const ROC_OFFSET = 1911;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 西元日期字串（"YYYY-MM-DD"，無時區）→ 民國顯示「民國112/04/20」。
 * 直接取字面年月日，不做時區換算（date 欄位無時區，避免 off-by-one）。空 / 無效回 "—"。
 */
export function rocDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const roc = Number(m[1]) - ROC_OFFSET;
  return `民國${roc}/${m[2]}/${m[3]}`;
}

// timestamptz → 台北時區的年月日時分（供封存時間等系統時間顯示）。
const TPE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO timestamp → 民國「民國112/04/20 13:45」（台北時區）。空 / 無效回 "—"。 */
export function rocDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = Object.fromEntries(
    TPE_PARTS.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const roc = Number(parts.year) - ROC_OFFSET;
  return `民國${roc}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** 西元 ISO 日期 → 民國拆解 {year, month, day} 字串（供輸入元件初始值）。無效回空字串。 */
export function isoToRocParts(iso?: string | null): {
  year: string;
  month: string;
  day: string;
} {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return { year: "", month: "", day: "" };
  return {
    year: String(Number(m[1]) - ROC_OFFSET),
    month: String(Number(m[2])),
    day: String(Number(m[3])),
  };
}

/**
 * 民國 年/月/日（字串）→ 西元 ISO "YYYY-MM-DD"。任一欄空或不合法回 ""（送出後視為未填）。
 * 純日曆換算，不驗證該月天數上限（交由使用者，MVP）。
 */
export function rocPartsToIso(
  year: string,
  month: string,
  day: string,
): string {
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  if (!year || !month || !day) return "";
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) {
    return "";
  }
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const gregorian = y + ROC_OFFSET;
  return `${String(gregorian).padStart(4, "0")}-${pad2(mo)}-${pad2(d)}`;
}
