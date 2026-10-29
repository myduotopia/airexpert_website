// 舊系統主檔匯入（客戶 #266、廠商 #273）共用的純函式：標題比對鍵、依名稱找欄、取儲存格、
// 送貨郵遞＋送貨地址合併、note 分段（「【標籤】內容」）與可重跑的合併、空白判斷。
// 不可 import server-only 模組（一次性腳本、測試共用）。
//
// 個資：本檔不產生任何含儲存格內容的訊息。

/** 標題比對鍵：NFKC（全形括號／英數 → 半形）、去所有空白、不分大小寫。 */
export function headerKey(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 依標題列建立「標題 → 欄索引」查詢；同名標題出現多次時取第一欄。找不到回傳 null。 */
export function headerFinder(
  header: readonly unknown[],
): (label: string) => number | null {
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const k = headerKey(h);
    if (k && !index.has(k)) index.set(k, i);
  });
  return (label) => index.get(headerKey(label)) ?? null;
}

/** 去頭尾空白、統一換行為 \n；空字串 → null。 */
export function cell(row: readonly unknown[], i: number | null): string | null {
  if (i === null) return null;
  const s = String(row[i] ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return s ? s : null;
}

/** 整列皆為空白。 */
export function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((c) => String(c ?? "").trim() === "");
}

/**
 * 送貨郵遞＋送貨地址 → 一個地址字串：郵遞區號在前、中間一個空白；郵遞區號非數字時照原文。
 * 地址本身已以該郵遞區號開頭時不重複加。兩者皆空 → null。
 */
export function combineDeliveryAddress(
  zip: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const z = (zip ?? "").trim();
  const a = (address ?? "").trim();
  if (!z) return a || null;
  if (!a) return z;
  if (a.startsWith(z)) return a;
  return `${z} ${a}`;
}

/** note 段落：「【標籤】內容」。 */
export function segment(label: string, content: string): string {
  return `【${label}】${content}`;
}

/**
 * 把段落附加到既有 note 之後（換行分隔）。已整段存在（以整行為界、CRLF 視同 LF）的段落不重複附加，
 * 故重跑結果不變。沒有要附加的段落時回傳既有值本身（未改動）。既有 note 只有空白視為空。
 */
export function mergeNote(
  existing: string | null | undefined,
  segments: readonly string[],
): string | null {
  const base = existing ?? null;
  const hasBase = !!base && base.trim() !== "";
  const haystack = `\n${hasBase ? base!.replace(/\r\n?/g, "\n") : ""}\n`;
  const toAdd: string[] = [];
  for (const seg of segments) {
    if (haystack.includes(`\n${seg}\n`) || toAdd.includes(seg)) continue;
    toAdd.push(seg);
  }
  if (toAdd.length === 0) return base;
  return hasBase ? `${base}\n${toAdd.join("\n")}` : toAdd.join("\n");
}

/** null／undefined／只有空白。 */
export function isBlank(v: string | null | undefined): boolean {
  return (v ?? "").trim() === "";
}

/** 統一編號為 8 位數字（有值但不符者照原文保存，只計數）。 */
export function isStandardTaxId(v: string | null | undefined): boolean {
  return !!v && /^\d{8}$/.test(v);
}
