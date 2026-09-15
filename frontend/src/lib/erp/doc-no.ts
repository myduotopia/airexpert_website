// 單號規則（spec §4.2）：prefix + 民國年(3) + 月(2) + 流水號(3，超過 999 自然變 4 位)。
// 例：S11509047、P11509008、SR11509001；收款 RC、付款 PM。
// 實際取號由 DB 的 erp_next_doc_no 負責（併發安全）；此處為顯示 / 測試用純函式。
import type { DocType } from "./types";

const ROC_OFFSET = 1911;

/** 單別 → 單號前綴（與 doc_type 相同）。 */
export const DOC_TYPE_PREFIX: Record<DocType, string> = {
  Q: "Q",
  P: "P",
  I: "I",
  PR: "PR",
  S: "S",
  SR: "SR",
  T: "T",
  A: "A",
};

/** 收付款單號前綴。 */
export const PAYMENT_PREFIX = { in: "RC", out: "PM" } as const;

/** 單別中文名稱。 */
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  Q: "報價單",
  P: "採購單",
  I: "進貨單",
  PR: "進退單",
  S: "銷貨單",
  SR: "銷退單",
  T: "調撥單",
  A: "盤點調整單",
};

/**
 * 西元日期 "YYYY-MM-DD" → 民國年月期間 "11509"（年補足 3 位）。
 * 格式不符丟錯（呼叫端應已驗證日期）。
 */
export function rocPeriod(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(isoDate);
  if (!m) throw new Error(`日期格式錯誤：${isoDate}`);
  const roc = Number(m[1]) - ROC_OFFSET;
  if (roc < 1) throw new Error(`日期早於民國元年：${isoDate}`);
  return `${String(roc).padStart(3, "0")}${m[2]}`;
}

/** 組單號：formatDocNo("S", "2026-09-15", 47) → "S11509047"；seq ≥ 1000 → 4 位。 */
export function formatDocNo(
  prefix: string,
  isoDate: string,
  seq: number,
): string {
  return `${prefix}${rocPeriod(isoDate)}${String(seq).padStart(3, "0")}`;
}
