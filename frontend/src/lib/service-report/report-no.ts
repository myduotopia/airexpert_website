// 派工單號（spec §4.3）：X + 民國年(3) + 月(2) + 流水號(至少 3 位，>999 自然 4 位)。
// 例：X11509009。實際取號由 DB 的 sr_next_report_no 負責（併發安全）；
// 此處為顯示 / 驗證用純函式（client / server 皆可用）。
import { rocPeriod } from "@/lib/erp/doc-no";

export const REPORT_NO_PREFIX = "X";

/** 單號格式：X + 5 位民國年月 + 至少 3 位流水號。 */
const REPORT_NO_RE = /^X\d{5}\d{3,}$/;

/** formatReportNo("2026-09-15", 9) → "X11509009"；seq ≥ 1000 → 4 位。日期格式錯誤會丟錯。 */
export function formatReportNo(isoDate: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`流水號錯誤：${seq}`);
  }
  return `${REPORT_NO_PREFIX}${rocPeriod(isoDate)}${String(seq).padStart(3, "0")}`;
}

/** 正規化使用者輸入（去頭尾空白、轉大寫），與 DB unique index upper(btrim()) 一致。 */
export function normalizeReportNo(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

/** 是否為合法單號（需已正規化；呼叫端應先 normalizeReportNo）。 */
export function isValidReportNo(s: string): boolean {
  return REPORT_NO_RE.test(s);
}
