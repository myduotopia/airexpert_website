// 機台識別的「顯示字串」組字工具（純函式，無 I/O，好單測）。
//
// 機台的真正唯一鍵是三段式的 (客戶, 機台代號, 機號)，三段在 DB 分開存
// （mx_customers.name / mx_machines.machine_no / mx_machines.serial_no），
// 只在畫面上組成一個人看得懂的識別，例「兆利科技-A機-100HA」。
//
//   機台代號 machine_no  A機／B機／1號機／A01 銅器部
//     客戶內部用來指認機器的稱呼（「J751307001」不好念才會有這東西）。
//     同一客戶內唯一，跨客戶必然重複。
//   機號 serial_no       J751307001（空壓機為原廠序號）／100HA、AD480（過濾卡為過濾器型號）
//     過濾卡的「機號」其實是型號，兩家客戶買同款乾燥機就會一樣。
//
// ⚠️ 這裡的客戶名稱正規化**只用於顯示**，絕不可寫進資料庫任何欄位
//    （見 #157／PR #162 作廢的前綴方案：把客戶名編進 serial_no 會讓
//     「查所有在用 AD480 的客戶」這種查詢直接失效）。

/** 顯示用客戶短名的「本體」（不含結尾分廠括號）長度上限；超過只截短本體。 */
const MAX_CUSTOMER_BASE = 12;

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

/** 三段識別之間的分隔符。 */
const SEPARATOR = "-";

/** 三段皆為空時的佔位（DB 的 identity check 保證至少有代號或機號，理論上不會發生）。 */
export const UNNAMED_MACHINE = "（未命名卡片）";

/** 全形括號 / 全形連字號 / 全形空白正規化為半形，方便後續以固定規則處理。 */
function toHalfWidth(v: string): string {
  return v
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[－—–]/g, "-")
    .replace(/　/g, " ");
}

/**
 * 客戶名稱 → 顯示用短名。規則（依序，測試已釘住）：
 *
 * 1. 全形括號 / 連字號 / 空白正規化為半形。
 * 2. 去掉組織型態贅字：`股份有限公司`、`有限公司`、`(股)`、`(有)`、`公司`。
 * 3. 去掉結尾的路線／區域編號 —— 結尾為純數字、且其前一字是空白或 `)` 才算
 *    （卡上常寫「和成欣業(股)公司(二廠) 25」的 25）。像「3M」「台塑1」這種
 *    數字是名稱本體的一部分，不會被誤刪。
 * 4. 去掉所有空白與連字號 —— 連字號是三段識別的分隔符，客戶短名自身不得含它，
 *    否則「兆利-科技-A機-100HA」根本看不出哪一段是哪一段。
 * 5. 過長時只截短「本體」，保留結尾的分廠括號（如 `(二廠)`），避免同一客戶的
 *    不同分廠被截成同一個短名而看起來像同一台機器。截斷以「字元（code point）」
 *    為單位，避免把 CJK 擴充區（surrogate pair）的字剖成半個而產生亂碼。
 *
 * 例：「和成欣業(股)公司(二廠) 25」→「和成欣業(二廠)」；「兆利科技」→「兆利科技」。
 */
export function customerShortName(
  customerName: string | null | undefined,
): string {
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
    chars.length > MAX_CUSTOMER_BASE
      ? chars.slice(0, MAX_CUSTOMER_BASE).join("")
      : base;
  return cut + tail;
}

/** machineDisplayName 的客戶參數：可直接給名稱字串，或給帶 name 的客戶物件。 */
export type MachineDisplayCustomer =
  | string
  | { name?: string | null }
  | null
  | undefined;

/** machineDisplayName 的機台參數：只看識別用的兩欄。 */
export interface MachineDisplayMachine {
  machine_no?: string | null;
  serial_no?: string | null;
}

function customerNameOf(customer: MachineDisplayCustomer): string {
  if (typeof customer === "string") return customer;
  return customer?.name ?? "";
}

/**
 * 三段式顯示識別：`客戶短名-機台代號-機號`，例「兆利科技-A機-100HA」。
 *
 * 缺的段落直接略過，不會留下多餘的連字號：
 * - 只有機號的既有卡（大多數空壓機卡）→「兆利科技-J751307001」
 * - 只有代號、沒有機號的卡         →「兆利科技-A機」
 * - 客戶名稱正規化後為空（例：名稱只有「公司」）→「A機-100HA」
 */
export function machineDisplayName(
  customer: MachineDisplayCustomer,
  machine: MachineDisplayMachine,
): string {
  const parts = [
    customerShortName(customerNameOf(customer)),
    (machine.machine_no ?? "").trim(),
    (machine.serial_no ?? "").trim(),
  ].filter((p) => p !== "");
  return parts.length > 0 ? parts.join(SEPARATOR) : UNNAMED_MACHINE;
}

/**
 * 不含客戶的兩段識別：`機台代號-機號`。
 * 用在「已經知道是哪個客戶」的版面（客戶詳情頁名下機台列表），避免每一列都重複客戶名。
 */
export function machineTagLabel(machine: MachineDisplayMachine): string {
  return machineDisplayName(null, machine);
}
