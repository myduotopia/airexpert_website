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
//   C 純空壓機卡：表頭沒有任何過濾系統標記，不可誤生一張空的過濾卡。
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
 * 過濾系統（乾燥機）的耗材關鍵字。命中即判為過濾卡的內容。
 * 注意「散熱器」（空壓機的散熱器組清洗 / 清潔）刻意不列入，只認「散熱馬達」，
 * 否則樣態 B 的「散熱器組清洗」會被誤判成乾燥機的維護。
 */
const FILTER_KEYWORD_RE =
  /乾燥機|乾燥桶|乾修|排水器|濾蕊|濾芯|濾心|散熱馬達|葉片|過濾|CKD|AD\s?\d{2,}/i;

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
 * 卡別由表頭決定（normalizeCardHeader），列的歸屬只在 mixed 時才分流：
 * - filter     → 只出一張過濾卡，所有列都進過濾卡（樣態 A：整張紙就是過濾卡）
 * - compressor → 只出一張空壓機卡，不生空的過濾卡（樣態 C）
 * - mixed      → 兩張都出，列依 splitRecordsByCard 分流（樣態 B）
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

  // 只有 mixed 才需要逐列分流：整張是過濾卡 / 整張是空壓機卡時，所有列都屬那張卡
  // （樣態 A 的專用油、時數也是寫在過濾卡上的，不該被關鍵字拆走）。
  const rows: RecordDraft[] =
    header.kind === "mixed"
      ? splitRecordsByCard(input.records).all
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

  const wantFilter = header.kind !== "compressor";
  const hasFilterContent = basic.filter_spec !== "" || split.filter.length > 0;
  const filter: CardDraft | null =
    wantFilter && hasFilterContent
      ? {
          basic: {
            ...basic,
            // 過濾卡的機號 / 卡號建議用去掉「過濾」前綴的型號；filter_spec 保留原文。
            serial_no: filterCardSerial(basic.filter_spec),
            // 乾燥機卡沒有馬力 / 電壓 / 購買時間（見 #155），一律留空由員工補。
            machine_no: "",
            purchased_at: "",
            model: "",
            horsepower: "",
            voltage: "",
          },
          records: split.filter,
          columns: suggestFilterColumns(split.filter),
        }
      : null;

  return { kind: header.kind, rows, compressor, filter };
}

/**
 * 兩張草稿卡各自去比對既有卡時，用來判斷「命中的那張卡是不是同一個客戶的」。
 *
 * 為什麼只有過濾卡需要這道關：mx_machines 的機號唯一索引是「全表唯一」（0012），
 * 而過濾卡的卡號是由 filter_spec 推導出來的「過濾器型號」（例「100HA」），
 * 那是型號不是序號，不同客戶必然重複。若不比對客戶，A 客戶已建的「100HA」過濾卡
 * 會被當成 B 客戶這張照片的既有卡，B 的乾燥機維護列就靜靜寫到 A 的卡上。
 * 空壓機卡的機號是原廠序號（J751307001），不會有這個問題，因此維持原本的純機號比對。
 *
 * 判定順序：兩邊都有客戶編號 → 比編號（不分大小寫）；否則比客戶名稱全等。
 * 兩邊都認不出客戶時回 false（寧可讓員工自己建卡，也不要猜錯客戶）。
 */
export function isSameCustomer(
  a: { customer_code?: string | null; customer_name?: string | null },
  b: { customer_code?: string | null; customer_name?: string | null },
): boolean {
  const codeA = str(a.customer_code).toLowerCase();
  const codeB = str(b.customer_code).toLowerCase();
  if (codeA && codeB) return codeA === codeB;
  const nameA = str(a.customer_name);
  return nameA !== "" && nameA === str(b.customer_name);
}

/**
 * 過濾卡預設是否勾選匯入：有維護列才預設匯入。
 * 表頭雖標了過濾型號、但整張沒有任何過濾系統的維護列時，預設不匯入，
 * 避免辨識把表頭的零星註記誤讀成過濾系統標記而生出一張空卡。
 */
export function shouldImportFilterCard(card: CardDraft | null): boolean {
  return card !== null && card.records.length > 0;
}
