// 拍照辨識分流（純函式，無 I/O，好單測）。
//
// 舊紙本把「過濾系統（乾燥機）保養紀錄卡」與「空壓機保養紀錄卡」混寫在同一張
// 「空壓機保養紀錄卡」上，辨識後必須拆成兩張草稿卡供人工核對。實際照片有三種樣態：
//
//   A 整張其實是過濾卡：機號的位置改手寫「過濾 AL 010N + LM-P-010」（＝過濾器型號）。
//     卡上紅字註記：「舊資料關於過濾系統卡的內容都會寫在『過濾系統』這個欄位；
//     可能會超過欄位寫到變頻器」。
//   B 一張卡兩台機器：表頭「機號J751307001 過濾100HA」＝空壓機 + 過濾系統各一。
//     「專用油／機油濾／空氣濾／油氣分離器」屬空壓機；「過濾系統」欄（可能溢寫到
//     「變頻器」欄）的「乾燥機用散熱馬達12"×2只」等屬過濾卡。
//   B' 同樣是一張卡兩台機器，但過濾系統寫成加號註記：機型那一行結尾補一個「＋100HA」。
//     實際照片證實 B 與 B' 是同一台機器（機號 J751307001、同為 KK123-1），
//     因此「＋100HA / +100HA」等同「過濾100HA」，一樣要拆成兩張卡。
//   C 表頭沒有任何過濾系統標記。此時再看維護列（#166）：
//     列中有乾燥機內容（AD480、乾燥機散熱馬達+葉片、乾修…）→ 照樣拆成兩張草稿卡，
//     由員工用「匯入」勾選框決定要不要留過濾卡（營運決定：判成兩張就產兩張）；
//     列中也沒有乾燥機內容 → 純空壓機卡，只出一張，不可誤生一張空的過濾卡。
//
// 這個模組是「AI 沒標 / 標錯」時的本地後備規則，也是 UI 產生兩張草稿卡的依據。
// 只 import type，不引用 maintenance-normalize 的執行期程式碼（避免循環相依）。
import type { RecordPayload } from "./maintenance-normalize";

/** 一張辨識照片對應的卡別樣態。mixed = 同一張紙同時有空壓機與過濾系統。 */
export type CardKind = "compressor" | "filter" | "mixed";

/** 單一維護列的歸屬卡別。 */
export type BelongsTo = "compressor" | "filter";

/** 維護列草稿：擷取到的固定 9 欄 + 歸屬。 */
export interface RecordDraft extends RecordPayload {
  belongs_to: BelongsTo;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 把任意輸入收斂成合法卡別；認不得回 null（交由本地判定）。 */
export function parseCardKind(v: unknown): CardKind | null {
  return v === "compressor" || v === "filter" || v === "mixed" ? v : null;
}

/** 把任意輸入收斂成合法歸屬；認不得回 null（交由 classifyRecord 推導）。 */
export function parseBelongsTo(v: unknown): BelongsTo | null {
  return v === "compressor" || v === "filter" ? v : null;
}

/**
 * 表頭尾端的「加號註記」樣態（樣態 B'）：機型 / 馬力 / 電壓那一行的結尾另外手寫
 * 「＋100HA」，意思與「過濾100HA」相同（見 #158 的照片 C 與照片 B 是同一台機器）。
 * 只認「字串結尾」且加號後面是 ASCII 型號 token，避免把
 *   - 維護內容的「散熱馬達+葉片」（加號後是中文）
 *   - 「TA-100+」（加號後沒有東西）
 *   - 「JNV75/8+3」（純數字，看不出是型號）
 * 這幾類誤判成過濾系統標記而憑空生出一張過濾卡。
 */
const FILTER_PLUS_SUFFIX_RE = /[+＋]\s*([A-Za-z0-9][A-Za-z0-9\-/]+)\s*$/;

/** token 需同時有英文字母與數字才算型號（100HA、AD480、LM-P-010 ✓；100、AB ✗）。 */
function isModelToken(token: string): boolean {
  return /[A-Za-z]/.test(token) && /\d/.test(token);
}

/**
 * 從表頭字串尾端切出「＋100HA」這類過濾系統註記。
 * 回傳 `[去掉註記後的原文, 註記原文(含加號)]`；沒有註記時回 `[原文, ""]`。
 */
export function splitFilterPlusSuffix(
  v: string | null | undefined,
): [string, string] {
  const text = str(v);
  const m = FILTER_PLUS_SUFFIX_RE.exec(text);
  if (!m || !isModelToken(m[1])) return [text, ""];
  return [text.slice(0, m.index).trim(), text.slice(m.index).trim()];
}

/** 整串就是一個加號註記（例「＋100HA」）→ 這格根本不是機號 / 電壓，是過濾器型號。 */
function isFilterPlusMarker(text: string): boolean {
  const [rest, marker] = splitFilterPlusSuffix(text);
  return marker !== "" && rest === "";
}

/**
 * 機號欄 / 表頭字串是否其實是過濾器型號（不是機號）：
 * 以「過濾」開頭，或整串就是「＋100HA」這類加號註記。
 */
export function isFilterHeaderText(v: string | null | undefined): boolean {
  const s = str(v);
  return /^過濾/.test(s) || isFilterPlusMarker(s);
}

/**
 * 過濾卡的機號 / 卡號建議值：去掉「過濾」／「＋」前綴後的型號原文。
 * 例「過濾100HA」→「100HA」；「＋100HA」→「100HA」；
 * 「過濾 AL 010N + LM-P-010」→「AL 010N + LM-P-010」。
 */
export function filterCardSerial(spec: string | null | undefined): string {
  return str(spec)
    .replace(/^(?:過濾器?|[+＋])\s*/, "")
    .trim();
}

/**
 * 依表頭判定卡別。只看「機號」與「過濾器型號（filter_spec）」兩個訊號：
 * - 機號欄以「過濾」開頭 / 整串是「＋100HA」→ filter（樣態 A，這張紙沒有空壓機）
 * - 兩者都有            → mixed（樣態 B）
 * - 只有過濾器型號      → filter
 * - 其餘（含兩者皆空）  → compressor（樣態 C；不可無中生有過濾卡）
 *
 * 注意：這裡不掃機型 / 電壓等欄，加號註記的挖掘一律由 normalizeCardHeader 先做完。
 */
export function detectCardKind(basic: {
  serial_no?: string | null;
  filter_spec?: string | null;
}): CardKind {
  const serial = str(basic.serial_no);
  const spec = str(basic.filter_spec);
  if (isFilterHeaderText(serial)) return "filter";
  if (!serial) return spec ? "filter" : "compressor";
  return spec ? "mixed" : "compressor";
}

/** normalizeCardHeader 的輸入：表頭上「可能藏著過濾系統標記」的那幾欄。 */
export interface CardHeaderInput {
  serial_no?: string | null;
  filter_spec?: string | null;
  model?: string | null;
  horsepower?: string | null;
  voltage?: string | null;
}

/** 正規化後的表頭；model / horsepower / voltage 已去掉被誤併進去的過濾系統標記。 */
export interface NormalizedCardHeader {
  kind: CardKind;
  serial_no: string;
  filter_spec: string;
  model: string;
  horsepower: string;
  voltage: string;
}

/**
 * 加號註記可能被 AI 併進表頭同一行的任一欄。依「照片上由右往左最可能的位置」掃描：
 * 機號行 → 電壓（＋100HA 就寫在電壓380V 後面）→ 機型 → 馬力。
 */
const PLUS_SUFFIX_FIELDS = [
  "serial_no",
  "voltage",
  "model",
  "horsepower",
] as const;

/**
 * 表頭正規化：把寫錯位置的過濾系統標記搬到 filter_spec，並回傳卡別。
 * 三種容錯：
 * - 機號欄整串以「過濾」開頭（樣態 A）→ 原文搬進 filter_spec，機號留空。
 * - 機號欄中段才出現「過濾」（AI 把「J751307001 過濾100HA」整行塞進 serial_no）
 *   → 以「過濾」切開，前段當機號、後段當過濾器型號。
 * - 表頭某一欄的「結尾」是「＋100HA」這類加號註記（樣態 B'，見 #158 照片 C）
 *   → 註記原文（含加號）搬進 filter_spec，該欄只留註記前的原文。
 *
 * 已經有 filter_spec 時完全不做上述挖掘，因此本函式是冪等的
 * （parseExtraction 與 buildCardDrafts 會各跑一次）。
 */
export function normalizeCardHeader(
  basic: CardHeaderInput,
): NormalizedCardHeader {
  const raw = str(basic.serial_no);
  const fields: Record<(typeof PLUS_SUFFIX_FIELDS)[number], string> = {
    serial_no: raw,
    voltage: str(basic.voltage),
    model: str(basic.model),
    horsepower: str(basic.horsepower),
  };
  let spec = str(basic.filter_spec);

  const at = raw.indexOf("過濾");
  if (at === 0) {
    spec = spec || raw;
    fields.serial_no = "";
  } else if (at > 0 && !spec) {
    spec = raw.slice(at).trim();
    fields.serial_no = raw.slice(0, at).trim();
  }

  if (!spec) {
    for (const key of PLUS_SUFFIX_FIELDS) {
      const [rest, marker] = splitFilterPlusSuffix(fields[key]);
      if (!marker) continue;
      spec = marker;
      fields[key] = rest;
      break;
    }
  }

  return {
    kind: detectCardKind({ serial_no: fields.serial_no, filter_spec: spec }),
    serial_no: fields.serial_no,
    filter_spec: spec,
    model: fields.model,
    horsepower: fields.horsepower,
    voltage: fields.voltage,
  };
}

/**
 * 「乾燥機專屬」耗材關鍵字：出現這些字幾乎可斷定這張紙上真的有第二台機器。
 * 注意「散熱器」（空壓機的散熱器組清洗 / 清潔）刻意不列入，只認「散熱馬達」，
 * 否則樣態 B 的「散熱器組清洗」會被誤判成乾燥機的維護。
 *
 * 「CKD」「AD480」這兩個英數 token 前面另外擋一個「不可再接英文字母」：它們是
 * 純 ASCII 子字串，不加這道關的話 LOAD 20 / HEAD 12 會被當成 AD480、
 * BACKDOOR / lockdown 會被當成 CKD。#166 之後這種誤命中的代價不再只是「某一列
 * 歸錯卡」，而是憑空多出一整張過濾卡草稿，故一律收緊。中文關鍵字不需要這道關。
 */
const DRYER_KEYWORD_RE =
  /乾燥機|乾燥桶|乾修|排水器|濾蕊|濾芯|濾心|散熱馬達|葉片|(?:^|[^A-Za-z])(?:CKD(?![A-Za-z])|AD\s?\d{2,})/i;

/**
 * 過濾系統的耗材關鍵字（＝乾燥機專屬關鍵字再加上「過濾」）。命中即判為過濾卡的內容。
 * 「過濾」二字單獨出現的證據力比其他字弱得多 —— 它就是空壓機卡上「過濾系統」欄的
 * 欄名，寫在該欄裡的「過濾網清洗」講的可能是空壓機自己。因此它只夠拿來「分列」
 * （已知有兩台機器，決定某一列歸誰），不足以拿來「開卡」（見 hasFilterRowEvidence）。
 */
const FILTER_KEYWORD_RE = new RegExp(`過濾|${DRYER_KEYWORD_RE.source}`, "i");

/** 空壓機專屬欄位（這幾欄有值就幾乎確定是空壓機的維護列）。 */
const COMPRESSOR_FIELDS = [
  "hours",
  "oil",
  "oil_filter",
  "air_filter",
  "oil_separator",
] as const satisfies readonly (keyof RecordPayload)[];

/**
 * 把一列的「過濾系統」欄與溢寫到「變頻器」欄的文字合併（顯示 / 判定用原文）。
 * 紅字註記說明過濾卡的內容會寫在過濾系統欄，且可能超過欄位寫到變頻器。
 */
export function filterCellText(r: RecordPayload): string {
  return [r.filter_system, r.inverter]
    .map((v) => str(v))
    .filter(Boolean)
    .join(" ");
}

/**
 * AI 沒標 belongs_to 時的本地後備判定。
 * 1) 過濾系統 / 變頻器 / 備註出現乾燥機耗材關鍵字 → filter
 * 2) 值只出現在「過濾系統」欄（空壓機專屬欄全空）→ filter
 * 3) 其餘 → compressor
 */
export function classifyRecord(r: RecordPayload): BelongsTo {
  const cell = filterCellText(r);
  if (FILTER_KEYWORD_RE.test(`${cell} ${str(r.note)}`)) return "filter";
  const hasCompressorValue = COMPRESSOR_FIELDS.some((f) => str(r[f]) !== "");
  if (str(r.filter_system) !== "" && !hasCompressorValue) return "filter";
  return "compressor";
}

/**
 * 表頭「完全沒有過濾標記」時，要不要一併產出一張過濾卡草稿的門檻（#166）。
 *
 * 這個門檻刻意比 classifyRecord 嚴，因為兩者要回答的問題不同：
 * - classifyRecord 回答「已知這張紙有兩台機器，這一列歸誰」——表頭已經先證實了
 *   乾燥機存在，是強先驗，所以連「值只出現在過濾系統欄」這種弱訊號都可以採信。
 * - 這裡回答「這張紙上到底有沒有第二台機器」——沒有表頭背書，判錯就是無中生有
 *   一張卡，所以只認「乾燥機專屬關鍵字」這一條硬證據：
 *     · 不採信「值只出現在過濾系統欄」（例：該欄只寫「更換」）——空壓機自己的
 *       過濾系統也寫在這一欄，這是欄名不是機器。
 *     · 不採信單獨的「過濾」二字，理由同上（見 FILTER_KEYWORD_RE 的註解）。
 * AI 已明確把某一列標成 filter 時同樣算數：那是它看著照片下的判斷，不是關鍵字巧合。
 *
 * 反過來說，一旦這道門開了，這張紙就等同樣態 B 的混合卡，逐列分流即回到
 * classifyRecord 那套（含弱訊號）——先驗已經被硬證據補上了。
 */
export function hasFilterRowEvidence(
  records: (RecordPayload & { belongs_to?: BelongsTo | null })[],
): boolean {
  return records.some(
    (r) => parseBelongsTo(r.belongs_to) === "filter" || hasDryerEvidence(r),
  );
}

/** 單一列是否帶「乾燥機專屬」硬證據（見 DRYER_KEYWORD_RE）。 */
function hasDryerEvidence(r: RecordPayload): boolean {
  return DRYER_KEYWORD_RE.test(`${filterCellText(r)} ${str(r.note)}`);
}

/**
 * #166 的分流路徑（表頭沒有過濾標記）專用：把 AI 標的 `belongs_to = "compressor"`
 * 從「帶硬證據的列」上拿掉，交還 classifyRecord 判。
 *
 * 為什麼非做不可：辨識 prompt 在 card_kind = "compressor" 時要求 AI
 * 「所有列一律 belongs_to = compressor」。這條路徑的表頭正好就是沒有過濾標記，
 * 所以 AI 給的 compressor 是**那條規則的產物、不是看照片下的判斷**，沒有證據力。
 * 不清掉的話 hasFilterRowEvidence 開了門、列卻全被 AI 標回空壓機，split.filter
 * 永遠是空的 → hasFilterContent 為 false → 過濾卡照樣是 null，#166 在正式環境
 * 等於完全沒生效（單元測試的 fixture 都沒帶 belongs_to，因此測不出來）。
 *
 * 只清「compressor」且只清「有硬證據」的列：
 * - AI 標的 filter 一律保留（那是判斷，不是規則）。
 * - 沒有硬證據的列保留 AI 的 compressor（例：散熱器組清潔）。
 * - 表頭本來就有過濾標記（mixed）時不套用：那條路徑的 prompt 要求 AI 逐列判斷，
 *   它給的 compressor 是真的判斷，不該被關鍵字推翻。
 * - 只要 AI 在這張紙上標出過**任何一列** filter，整個覆寫就不套用（見呼叫端）：
 *   那證明它有在逐列分辨，不是在套「一律 compressor」那條規則，此時它給的
 *   compressor 同樣是判斷。此情形下過濾卡本來就會由那一列撐起來，不需要覆寫。
 */
function dropForcedCompressor(
  r: RecordPayload & { belongs_to?: BelongsTo | null },
): RecordPayload & { belongs_to?: BelongsTo | null } {
  return parseBelongsTo(r.belongs_to) === "compressor" && hasDryerEvidence(r)
    ? { ...r, belongs_to: null }
    : r;
}

/**
 * 複製成帶歸屬的維護列。逐欄明列而非展開整個物件，確保 AI 多回傳的欄位
 * （或 belongs_to 本身）不會混進之後要 insert 進 mx_records 的 payload。
 */
function withBelongsTo(r: RecordPayload, to: BelongsTo): RecordDraft {
  return {
    service_date: r.service_date,
    hours: r.hours,
    oil: r.oil,
    oil_filter: r.oil_filter,
    air_filter: r.air_filter,
    oil_separator: r.oil_separator,
    inverter: r.inverter,
    filter_system: r.filter_system,
    technician: r.technician,
    note: r.note,
    service_type: r.service_type,
    belongs_to: to,
  };
}

/**
 * 依歸屬把維護列拆成兩張卡。AI 已標 belongs_to 時尊重之，否則用 classifyRecord 推導。
 * 純分類，不做「這張卡該不該存在」的判斷（那是 buildCardDrafts 的事）。
 */
export function splitRecordsByCard(
  records: (RecordPayload & { belongs_to?: BelongsTo | null })[],
): { compressor: RecordDraft[]; filter: RecordDraft[]; all: RecordDraft[] } {
  const all: RecordDraft[] = records.map((r) =>
    withBelongsTo(r, parseBelongsTo(r.belongs_to) ?? classifyRecord(r)),
  );
  return {
    compressor: all.filter((r) => r.belongs_to === "compressor"),
    filter: all.filter((r) => r.belongs_to === "filter"),
    all,
  };
}

/**
 * 依維護列內容推導過濾卡的預設耗材欄名（#155 的動態欄位）。
 * 舊卡的過濾系統欄是自由手寫，無法可靠切成一格一格，因此只給「分類」層級的
 * 預設欄名讓員工改；辨識到的原文另外整段保留在該列的備註。
 */
const FILTER_COLUMN_HINTS: { label: string; re: RegExp }[] = [
  { label: "濾蕊", re: /濾蕊|濾芯|濾心/ },
  { label: "排水器", re: /排水器|CKD|AD\s?\d{2,}/i },
  { label: "散熱馬達", re: /散熱馬達/ },
  { label: "葉片", re: /葉片/ },
];

/** 回傳建議的耗材欄名（依 FILTER_COLUMN_HINTS 順序，不重複）。 */
export function suggestFilterColumns(records: RecordPayload[]): string[] {
  const haystack = records
    .map((r) => `${filterCellText(r)} ${str(r.note)}`)
    .join("\n");
  return FILTER_COLUMN_HINTS.filter((h) => h.re.test(haystack)).map(
    (h) => h.label,
  );
}

export interface CardBasicDraft {
  customer_name: string;
  customer_code: string;
  serial_no: string;
  machine_no: string;
  location: string;
  purchased_at: string;
  model: string;
  horsepower: string;
  voltage: string;
  filter_spec: string;
  drain_spec: string;
}

export interface CardDraft {
  basic: CardBasicDraft;
  records: RecordDraft[];
  /** 過濾卡的預設耗材欄名（空壓機卡恆為空陣列）。 */
  columns: string[];
}

export interface CardDrafts {
  /**
   * 這次「實際產出」的草稿樣態（不是表頭的判定結果）：
   * 兩張都出 = mixed、只出過濾卡 = filter、只出空壓機卡 = compressor。
   * #166 之後表頭沒有過濾標記、但列中有乾燥機內容時也會出兩張，這裡就是 mixed ——
   * 核對畫面的說明文字要講的是「你眼前有幾張卡」，不是「表頭寫了什麼」。
   * 表頭本身的判定另外由 normalizeCardHeader / ExtractedDraft.card_kind 保留。
   */
  kind: CardKind;
  /**
   * 全部維護列，維持照片上由上到下的原始順序，每列帶已判定的歸屬。
   * 核對畫面以這份為單一資料來源：切換某列的 belongs_to 就是「把它搬到另一張卡」。
   */
  rows: RecordDraft[];
  compressor: CardDraft | null;
  filter: CardDraft | null;
}

/** 擷取結果（維護列已帶 AI 的 belongs_to，可能為 null）。 */
export interface CardSplitInput {
  basic: CardBasicDraft;
  records: (RecordPayload & { belongs_to?: BelongsTo | null })[];
}

/**
 * 產生要並排給員工核對的兩張草稿卡。
 *
 * 卡別由表頭決定（normalizeCardHeader），逐列分流則在「表頭說有兩台」或
 * 「列中有乾燥機硬證據」時啟動：
 * - filter     → 只出一張過濾卡，所有列都進過濾卡（樣態 A：整張紙就是過濾卡）
 * - mixed      → 兩張都出，列依 splitRecordsByCard 分流（樣態 B / B'）
 * - compressor → 表頭沒有任何過濾標記。此時再看列的內容（#166）：
 *     · 有乾燥機內容（hasFilterRowEvidence）→ 一樣分流、一樣出兩張草稿卡，
 *       由員工用「匯入」勾選框決定要不要留下過濾卡。營運上的決定是
 *       「判斷完覺得該是兩張卡就產生兩張」，寧可多給一張讓人取消，
 *       也不要讓員工自己按「這張卡也有過濾系統」重建。
 *     · 沒有乾燥機內容 → 只出一張空壓機卡（樣態 D，硬性不變量）。
 *
 * 過濾卡若既沒有過濾器型號也沒有任何列，一律不產生（守住「不誤生空的過濾卡」）。
 */
export function buildCardDrafts(input: CardSplitInput): CardDrafts {
  const header = normalizeCardHeader(input.basic);
  const basic: CardBasicDraft = {
    ...input.basic,
    serial_no: header.serial_no,
    filter_spec: header.filter_spec,
    // 被誤併進機型 / 馬力 / 電壓的「＋100HA」已在 normalizeCardHeader 切走，
    // 空壓機卡的這幾欄要用切乾淨的值，否則電壓會存成「380V ＋100HA」。
    model: header.model,
    horsepower: header.horsepower,
    voltage: header.voltage,
  };

  // 整張是過濾卡（樣態 A）時不分流：那張紙上的專用油、時數也是寫給過濾卡的，
  // 不該被關鍵字拆走。其餘情形只要「表頭說有兩台」或「列中有乾燥機硬證據」就分流。
  const byRowEvidence =
    header.kind === "compressor" && hasFilterRowEvidence(input.records);
  const splitByRow = header.kind === "mixed" || byRowEvidence;
  // 「AI 一列 filter 都沒標」＝ 它在套 prompt 的『card_kind=compressor 就一律標
  // compressor』那條規則，此時它的 compressor 標記沒有證據力，硬證據要蓋過去。
  const aiForcedAllCompressor =
    byRowEvidence &&
    !input.records.some((r) => parseBelongsTo(r.belongs_to) === "filter");
  const rows: RecordDraft[] = splitByRow
    ? splitRecordsByCard(
        aiForcedAllCompressor
          ? input.records.map(dropForcedCompressor)
          : input.records,
      ).all
    : input.records.map((r) =>
        withBelongsTo(r, header.kind === "filter" ? "filter" : "compressor"),
      );
  const split = {
    compressor: rows.filter((r) => r.belongs_to === "compressor"),
    filter: rows.filter((r) => r.belongs_to === "filter"),
  };

  const compressor: CardDraft | null =
    header.kind === "filter"
      ? null
      : {
          basic: { ...basic, filter_spec: "", drain_spec: "" },
          records: split.compressor,
          columns: [],
        };

  // 表頭有過濾標記，或表頭沒標記但列中有乾燥機硬證據（此時 splitByRow 為真）。
  const wantFilter = header.kind !== "compressor" || splitByRow;
  const hasFilterContent = basic.filter_spec !== "" || split.filter.length > 0;
  const filter: CardDraft | null =
    wantFilter && hasFilterContent
      ? {
          basic: {
            ...basic,
            // 過濾卡的機號建議用去掉「過濾」前綴的型號；filter_spec 保留原文。
            // 表頭沒有過濾標記時（#166）這裡是空字串：紙上根本沒寫過濾器型號，
            // 不可硬塞值。0018 起 serial_no 可為 null，只要機台代號非空就能建卡
            // （DB CHECK 要求兩段至少有一段），代號沿用表頭；兩段都空時
            // shouldImportFilterCard 會預設不勾選，等員工自己補一段再送出。
            serial_no: filterCardSerial(basic.filter_spec),
            // 機台代號（A機／1號機）的唯一範圍自 0019 起是 (客戶, 卡別)，兩張草稿
            // 卡別不同，帶同一個代號不會互撞，故混合卡的過濾卡也沿用表頭的代號。
            // 這正是現場的實情：乾燥機就擺在 A機 旁邊，紙卡上往往也標成「A機」，
            // 員工不必再為了避開衝突而重打一次代號。
            // 乾燥機卡沒有馬力 / 電壓 / 購買時間（見 #155），一律留空由員工補。
            purchased_at: "",
            model: "",
            horsepower: "",
            voltage: "",
          },
          records: split.filter,
          columns: suggestFilterColumns(split.filter),
        }
      : null;

  // 回報實際產出的樣態：表頭說 compressor 但列中挖出乾燥機時，員工眼前是兩張卡。
  const kind: CardKind =
    compressor === null ? "filter" : filter === null ? "compressor" : "mixed";
  return { kind, rows, compressor, filter };
}

/**
 * 過濾卡預設是否勾選匯入：要有維護列，也要有識別（機號或機台代號至少一段）。
 * - 表頭雖標了過濾型號、但整張沒有任何過濾系統的維護列時，預設不匯入，
 *   避免辨識把表頭的零星註記誤讀成過濾系統標記而生出一張空卡。
 * - 表頭沒有過濾標記、紙上也沒寫機台代號時（#166），這張草稿還缺識別，
 *   直接送出必然撞到「機號與機台代號至少填一項」，預設不勾選比較誠實。
 * 兩種情形員工都能自己勾回來（過濾卡分頁的表頭欄位本來就可編輯）。
 */
export function shouldImportFilterCard(card: CardDraft | null): boolean {
  if (card === null || card.records.length === 0) return false;
  return (
    card.basic.serial_no.trim() !== "" || card.basic.machine_no.trim() !== ""
  );
}
