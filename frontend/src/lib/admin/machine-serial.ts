// 機號（serial_no）前綴組字工具（純函式，無 I/O，好單測）。
//
// 背景：並非每台機器都有原廠機號 —— 現場很多卡是用「A機」「1號機」這種代稱，
// 過濾系統卡更常常在機號位置寫過濾器型號。而 mx_machines 對「未封存卡」的
// lower(btrim(serial_no)) 有**全域**唯一索引，不同客戶都寫「A機」就會互撞。
// 因此建議把機號打成「客戶名稱-A」／「客戶名稱-1」的形式，加上客戶前綴後
// 自然不會跨客戶衝突。既有的原廠機號（如 J751307001）維持原樣、不受影響。

/** 機號必填的錯誤訊息（引導使用「客戶名稱-A」形式）。 */
export const SERIAL_REQUIRED_MESSAGE =
  "機號為必填。若機台沒有原廠機號，請改用「客戶名稱-A」形式，例：兆利科技-A。";

/** 機號撞唯一索引時的錯誤訊息（引導使用「客戶名稱-A」形式）。 */
export const SERIAL_CONFLICT_MESSAGE =
  "此機號已被其他卡使用，可改用「客戶名稱-A」形式，例：兆利科技-A。";

/** 前綴「本體」（不含結尾分廠括號）的長度上限；超過只截短本體。 */
const MAX_PREFIX_BASE = 12;

/**
 * 客戶名稱中要剔除的組織型態贅字。
 * 依「長 → 短」排列，確保「股份有限公司」先被整段移除，不會被「公司」拆掉。
 */
const COMPANY_NOISE = [
  "股份有限公司",
  "有限公司",
  "(股)",
  "(有)",
  "公司",
] as const;

/** 機號代號（前綴後面那一段）允許的樣態：A、1、12、A機、1號機、甲、甲機… */
const SUFFIX_PATTERN =
  /^(?:[A-Za-z0-9]{1,3}|[\u4e00-\u9fff]{1,2})(?:號)?(?:機)?$/;

/** 全形括號 / 全形連字號 / 全形空白正規化為半形，方便後續以固定規則處理。 */
function toHalfWidth(v: string): string {
  return v
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[－—–]/g, "-")
    .replace(/　/g, " ");
}

/**
 * 客戶名稱 → 機號前綴。規則（依序，測試已釘住）：
 *
 * 1. 全形括號 / 連字號 / 空白正規化為半形。
 * 2. 去掉組織型態贅字：`股份有限公司`、`有限公司`、`(股)`、`(有)`、`公司`。
 * 3. 去掉結尾的路線／區域編號 —— 結尾為純數字、且其前一字是空白或 `)` 才算
 *    （卡上常寫「和成欣業(股)公司(二廠) 25」的 25）。像「3M」「台塑1」這種
 *    數字是名稱本體的一部分，不會被誤刪。
 * 4. 去掉所有空白與連字號 —— 連字號保留給「前綴-機號」的分隔語意，
 *    前綴自身不得含連字號，否則 parsePrefixedSerial 無法切回來。
 * 5. 過長時只截短「本體」，保留結尾的分廠括號（如 `(二廠)`），
 *    避免同一客戶的不同分廠被截成同一個前綴而互撞。截斷以「字元（code point）」
 *    為單位，避免把 CJK 擴充區（surrogate pair）的字剖成半個而產生亂碼。
 *
 * 例：「和成欣業(股)公司(二廠) 25」→「和成欣業(二廠)」；「兆利科技」→「兆利科技」。
 */
export function customerSerialPrefix(customerName: string): string {
  let s = toHalfWidth(customerName ?? "").trim();
  if (!s) return "";
  for (const noise of COMPANY_NOISE) s = s.split(noise).join("");
  s = s.replace(/([\s)])\s*\d+$/, "$1");
  s = s.replace(/[\s-]+/g, "").trim();
  if (!s) return "";

  // 拆出結尾連續的括號群（分廠 / 廠區標註），只截短前面的本體。
  const m = /^(.*?)((?:\([^()]*\))+)$/.exec(s);
  const base = m ? m[1] : s;
  const tail = m ? m[2] : "";
  // 以 code point 切，String#slice 會把 surrogate pair 剖半（如「𠮷」）。
  const chars = Array.from(base);
  const cut =
    chars.length > MAX_PREFIX_BASE
      ? chars.slice(0, MAX_PREFIX_BASE).join("")
      : base;
  return cut + tail;
}

/**
 * 以客戶名稱作前綴組出機號。
 *
 * - 客戶名稱正規化不出前綴時（如客戶名稱為空）→ 原樣回傳 suffix。
 * - suffix 為空 → 回傳「前綴-」，讓表單把游標停在 `-` 後方等使用者補 A / 1。
 * - suffix 已經帶著同一個前綴（不分大小寫）→ 不重複加。
 */
export function buildPrefixedSerial(
  customerName: string,
  suffix: string,
): string {
  const prefix = customerSerialPrefix(customerName);
  // 去掉使用者可能已經打的前導連字號，避免組出「客戶--A」。
  const body = toHalfWidth(suffix ?? "")
    .trim()
    .replace(/^-+/, "")
    .trim();
  if (!prefix) return body;
  if (!body) return `${prefix}-`;

  const lowerPrefix = prefix.toLowerCase();
  const lowerBody = body.toLowerCase();
  if (lowerBody === lowerPrefix) return `${prefix}-`;
  if (lowerBody.startsWith(`${lowerPrefix}-`)) return body;
  return `${prefix}-${body}`;
}

/**
 * 反向拆解「前綴-機號」。判定保守，只有「單一連字號 + 後段看起來是機號代號」
 * 才算帶前綴；沒有連字號（原廠機號 `J751307001`）或後段還有連字號
 * （過濾器型號 `LM-P-010`）一律回 `{ prefix: null, suffix: 原字串 }`。
 *
 * 已知極限：**單段型號與「前綴-代號」在字面上無法區分**。像 `AL-010`、
 * `AD480-1`、`BMF8-8`（卡片上的機型）會被判成帶前綴，而 `AIRTAC-1` 這種
 * 短英文客戶前綴也長得一樣，收緊規則就會反過來拆不回來。因此本函式只適合
 * 「顯示 / 提示」用途，**不要**拿它的結果去改寫或覆蓋使用者輸入的機號。
 */
export function parsePrefixedSerial(serial: string): {
  prefix: string | null;
  suffix: string;
} {
  const s = toHalfWidth(serial ?? "").trim();
  const i = s.indexOf("-");
  if (i <= 0) return { prefix: null, suffix: s };

  const head = s.slice(0, i).trim();
  const tail = s.slice(i + 1).trim();
  // 後段還有連字號 → 是型號之類的多段字串，不當前綴處理。
  if (!head || !tail || tail.includes("-")) return { prefix: null, suffix: s };
  if (!SUFFIX_PATTERN.test(tail)) return { prefix: null, suffix: s };
  return { prefix: head, suffix: tail };
}
