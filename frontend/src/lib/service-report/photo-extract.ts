// 維護報告單拍照辨識（#280）：報告單版面專用的 prompt、Gemini 輸出 schema 與輸出正規化 — 純函式／常數
// （client / server 皆可用、可單元測試）。呼叫 Gemini 在 lib/ai/gemini.ts 的 extractServiceReportPhotos；
// 保養卡辨識（extractMaintenanceCard）的 prompt 與行為不受影響。
//
// 正規化原則（不信任模型輸出）：未知 key 一律丟棄、型別不對 → 空值、列舉值只收白名單（英文 key 或中文標籤）、
// 文字截到報告單欄位上限；日期接受西元 ISO 或民國「115/10/30」「115.10.30」並驗證。
import {
  type CheckStatus,
  type FilterConsumable,
  type MachineState,
  type ServiceItem,
  type ServiceReportResults,
  type ServiceReportStatus,
  type Suggestion,
  type TimeSlot,
  CHECK_STATUS_LABELS,
  FILTER_CONSUMABLE_LABELS,
  MACHINE_STATE_LABELS,
  SERVICE_ITEM_LABELS,
  SUGGESTION_LABELS,
  TIME_SLOT_LABELS,
} from "./types";
import {
  PART_NAME_MAX,
  PART_QTY_MAX,
  RESULT_TEXT_MAX,
  TEXT_LIMITS,
  isValidIsoDate,
} from "./validate";

/** 一次最多上傳幾張照片（正反面／分頁拍）。 */
export const MAX_PHOTOS = 4;
/**
 * 一次送出的照片 base64 總長度預算。Vercel Functions 的請求主體上限為 4.5MB（與 next.config 的
 * serverActions.bodySizeLimit 無關，平台層就會回 413），多張 2400px 照片很容易超過；
 * 前端依此預算逐張再壓縮（compressImageToFit），伺服器端以 MAX_TOTAL_PHOTO_BASE64_LENGTH 把關。
 */
export const PHOTO_BASE64_BUDGET = 3_600_000;
/** 伺服器端總長度上限（比前端預算略寬，留給其他欄位與編碼的餘裕仍低於 4.5MB）。 */
export const MAX_TOTAL_PHOTO_BASE64_LENGTH = 4_000_000;
/** 單張照片 base64 長度上限。 */
export const MAX_PHOTO_BASE64_LENGTH = MAX_TOTAL_PHOTO_BASE64_LENGTH;
export const ALLOWED_PHOTO_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];
/**
 * 可拍照辨識回填的狀態：與詳情頁「回填結果」相同（report-actions.ts 只在 printed 顯示 fill）——
 * 已列印、尚未結案；作廢、草稿、已結案（需先重新開啟）皆不可。
 */
export function canPhotoBackfill(status: ServiceReportStatus): boolean {
  return status === "printed";
}

export const PHOTO_BACKFILL_WRONG_STATE_MESSAGE =
  "只有已列印、尚未結案的報告單可以拍照辨識回填";

/** 檢查上傳的照片（數量、型別、大小）；不合格回錯誤訊息，合格回 null。 */
export function validatePhotos(images: unknown): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return "請至少選擇一張照片";
  }
  if (images.length > MAX_PHOTOS) return `一次最多 ${MAX_PHOTOS} 張照片`;
  let total = 0;
  for (const img of images) {
    const i = img as { base64?: unknown; mimeType?: unknown } | null;
    if (
      !i ||
      typeof i.base64 !== "string" ||
      i.base64 === "" ||
      typeof i.mimeType !== "string"
    ) {
      return "照片格式不正確";
    }
    if (!ALLOWED_PHOTO_TYPES.includes(i.mimeType)) {
      return `不支援的照片格式：${i.mimeType}`;
    }
    if (i.base64.length > MAX_PHOTO_BASE64_LENGTH) return "照片過大";
    total += i.base64.length;
  }
  if (total > MAX_TOTAL_PHOTO_BASE64_LENGTH) {
    return "照片總大小過大，請減少張數後再試";
  }
  return null;
}

/** 辨識出的料件最多保留幾列（報告單只有 10 列，多的由呼叫端提示）。 */
const MAX_EXTRACTED_PARTS = 20;
/** 維護人員最多幾位（主技師＋協同技師上限 10）。 */
const MAX_TECHNICIANS = 11;

type CompressorKey = keyof NonNullable<ServiceReportResults["compressor"]>;
type DryerKey = keyof NonNullable<ServiceReportResults["dryer"]>;

const COMPRESSOR_TEXT_KEYS = [
  "run_hours",
  "consumable_hours",
  "frequency",
  "set_pressure",
  "temperature",
  "current",
] as const satisfies readonly CompressorKey[];
const COMPRESSOR_CHECK_KEYS = [
  "fan",
  "inverter_fan",
  "inverter_params",
] as const satisfies readonly CompressorKey[];
const DRYER_TEXT_KEYS = [
  "total_hours",
  "saving_rate",
] as const satisfies readonly DryerKey[];
const DRYER_CHECK_KEYS = [
  "refrigerant_high",
  "refrigerant_low",
  "cooling_fan",
  "auto_drain",
  "tank_drain",
] as const satisfies readonly DryerKey[];

/** 可標示「低信心」的欄位（模型回傳的 low_confidence 只收這些）。 */
export const LOW_CONFIDENCE_FIELD_LABELS = {
  report_no: "派工單號",
  report_date: "維護日期",
  time_slot: "時段",
  service_items: "服務項目",
  summary: "修護記要及建議",
  "compressor.run_hours": "運轉時數",
  "compressor.consumable_hours": "耗材時數",
  "compressor.frequency": "運轉頻率",
  "compressor.set_pressure": "設定壓力",
  "compressor.temperature": "運轉溫度",
  "compressor.current": "運轉電流",
  "compressor.fan": "空壓機風扇",
  "compressor.inverter_fan": "變頻器風扇",
  "compressor.inverter_params": "變頻器參數",
  "dryer.total_hours": "乾燥機總時數",
  "dryer.saving_rate": "節能率",
  "dryer.refrigerant_high": "冷媒高壓",
  "dryer.refrigerant_low": "冷媒低壓",
  "dryer.cooling_fan": "散熱風扇",
  "dryer.auto_drain": "自動排水器",
  "dryer.tank_drain": "貯氣桶排水",
  filter_consumable: "過濾耗材",
  parts: "更換料件",
  suggestions: "建議事項",
  technicians: "維護人員",
  customer_signer: "客戶簽名",
} as const;
export type LowConfidenceField = keyof typeof LOW_CONFIDENCE_FIELD_LABELS;

/** 正規化後的辨識結果（欄位皆已驗證；空字串／null／空陣列＝照片上沒有或看不清楚）。 */
export interface ReportPhotoExtraction {
  report_no: string;
  report_date: string | null; // 西元 ISO
  time_slot: TimeSlot | null;
  machine_state: MachineState | null;
  service_items: ServiceItem[];
  summary: string;
  results: ServiceReportResults;
  parts: { name: string; qty: string }[];
  suggestions: Suggestion[];
  technicians: string[];
  customer_signer: string;
  low_confidence: LowConfidenceField[];
}

export function emptyExtraction(): ReportPhotoExtraction {
  return {
    report_no: "",
    report_date: null,
    time_slot: null,
    machine_state: null,
    service_items: [],
    summary: "",
    results: {},
    parts: [],
    suggestions: [],
    technicians: [],
    customer_signer: "",
    low_confidence: [],
  };
}

/* ------------------------------------------------------------------ prompt */

export const SERVICE_REPORT_PHOTO_PROMPT = `你是資料輸入助理。照片是「勁賀空壓科技 機台維護報告單」（A4 直式，印好的表格＋現場手寫／勾選，繁體中文＋數字）。
可能有多張照片，都是同一張報告單（不同角度或分段拍攝），請合併成一份結果。
請依下方 JSON schema 回傳「純 JSON 物件」，看不清楚或空白的欄位一律回空字串 "" 或空陣列 []，絕不猜測或編造。

【版面（由上而下）】
1. 表頭：公司名稱、標題「機台維護報告單」、左上角代號。
2. 「維護日期」＋ 早上／中午／下午 勾選框｜右側「派工單號」（X 開頭，例 X11510002）。
3. 客戶名稱、電話、統一編號、聯絡人、地址（本次不需擷取）。
4. 「服務項目」5 個勾選框：新機試車、例檢、定期大/小保養、查修、其他｜設備、型號、電壓、編號、狀態（運轉／待機）。
5. 「修護記要及建議」：多行手寫文字。
6. 「空壓機檢查」：運轉時數、耗材時數、運轉頻率、設定壓力、運轉溫度、運轉電流（數值，保留手寫原樣，例「7.5-8」「0/1500」），
   空壓機風扇、變頻器風扇、變頻器參數（各有「正常／異常」勾選框）。
7. 「乾燥機檢查」：總時數、節能率（數值）；冷媒高壓、冷媒低壓、散熱風扇運轉狀況、自動排水器功能（正常／異常）。
8. 「過濾耗材」：可續用／建議更換／無裝置／建議加裝（單選）｜「貯氣桶排水功能」（正常／異常）。
9. 「更換料件編號及數量」：左 1–5、右 6–10，每列有品名與數量。印好的品名有：螺旋專用油、機油濾清器、空氣濾清器(外)、
   空氣濾清器(內)、油氣分離器、自動排水器、過濾器濾蕊、（兩列空白可手寫品名）、維護及保養工資。
10. 「建議事項」3 個勾選框：傳動系統年度維護、馬達電機年度維護、壓縮轉子年度歲修｜維護人員簽名｜客戶簽名。

【輸出規則】
- report_no：派工單號原文（去空白），例 "X11510002"。
- report_date：維護日期換算成西元 "YYYY-MM-DD"。紙上是民國紀年，西元 = 民國年 + 1911，例「115/10/30」→ "2026-10-30"。
- time_slot："morning"（早上）| "noon"（中午）| "afternoon"（下午）| ""。
- machine_state："running"（運轉）| "standby"（待機）| ""。
- service_items：有勾選（■、✓、✔、打叉、塗黑）的項目，值為 "new_trial"（新機試車）| "routine"（例檢）| "periodic"（定期大/小保養）| "repair"（查修）| "other"（其他）。
- summary：「修護記要及建議」的文字，照原文逐行抄錄（行與行之間用換行）。
- compressor / dryer 的數值欄：保留手寫原樣字串（不要加單位以外的東西，也不要換算）。
- 正常／異常欄："normal"（正常）| "abnormal"（異常）| ""（兩者都沒勾）。
- filter_consumable："usable"（可續用）| "replace"（建議更換）| "none"（無裝置）| "suggest_install"（建議加裝）| ""。
- parts：只列「數量欄有寫」的料件，name 為該列品名（印好的或手寫的），qty 為數量原文（例 "1"、"1桶"）。
- suggestions：有勾選的建議事項，值為 "transmission"（傳動系統）| "motor"（馬達電機）| "rotor"（壓縮轉子）。
- technicians：「維護人員」簽名的姓名，多位依書寫順序分開列出。
- customer_signer：「客戶簽名」欄的姓名。
- low_confidence：你不確定（字跡潦草、模糊、被遮住）的欄位代號，只能用下列值：
  report_no, report_date, time_slot, service_items, summary,
  compressor.run_hours, compressor.consumable_hours, compressor.frequency, compressor.set_pressure,
  compressor.temperature, compressor.current, compressor.fan, compressor.inverter_fan, compressor.inverter_params,
  dryer.total_hours, dryer.saving_rate, dryer.refrigerant_high, dryer.refrigerant_low, dryer.cooling_fan,
  dryer.auto_drain, dryer.tank_drain, filter_consumable, parts, suggestions, technicians, customer_signer。`;

const S = { type: "STRING" } as const;
const STRINGS = { type: "ARRAY", items: S } as const;

/** Gemini generationConfig.responseSchema（OpenAPI 子集；列舉值由 prompt 規範、正規化再把關）。 */
export const SERVICE_REPORT_PHOTO_SCHEMA = {
  type: "OBJECT",
  properties: {
    report_no: S,
    report_date: S,
    time_slot: S,
    machine_state: S,
    service_items: STRINGS,
    summary: S,
    compressor: {
      type: "OBJECT",
      properties: Object.fromEntries(
        [...COMPRESSOR_TEXT_KEYS, ...COMPRESSOR_CHECK_KEYS].map((k) => [k, S]),
      ),
    },
    dryer: {
      type: "OBJECT",
      properties: Object.fromEntries(
        [...DRYER_TEXT_KEYS, ...DRYER_CHECK_KEYS].map((k) => [k, S]),
      ),
    },
    filter_consumable: S,
    parts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: S, qty: S },
      },
    },
    suggestions: STRINGS,
    technicians: STRINGS,
    customer_signer: S,
    low_confidence: STRINGS,
  },
} as const;

/* -------------------------------------------------------------- 正規化 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 字串（數字也收）→ 去頭尾空白並截長；其他型別 → ""。 */
function text(v: unknown, max: number): string {
  let s = "";
  if (typeof v === "string") s = v;
  else if (typeof v === "number" && Number.isFinite(v)) s = String(v);
  return s.trim().slice(0, max).trim();
}

/** 多行文字：統一換行、去掉每行尾端空白與頭尾空行。 */
function multiline(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/u, ""))
    .join("\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** 英文 key 或中文標籤 → 列舉值；不認得 → null。 */
function pickEnum<T extends string>(
  v: unknown,
  labels: Record<T, string>,
): T | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const keys = Object.keys(labels) as T[];
  const lower = s.toLowerCase();
  const byKey = keys.find((k) => k.toLowerCase() === lower);
  if (byKey) return byKey;
  return keys.find((k) => labels[k] === s) ?? null;
}

/** 陣列 → 列舉值清單（去重、維持原順序、丟掉不認得的）。 */
function pickEnumList<T extends string>(
  v: unknown,
  labels: Record<T, string>,
): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const e = pickEnum(item, labels);
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/** 民國或西元日期 → 西元 ISO；無效 → null。 */
export function parsePhotoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m =
    /^(\d{2,4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(s);
  if (!m) return null;
  let y = Number(m[1]);
  // 三位數（或兩位數）年份視為民國年。
  if (m[1].length <= 3) y += 1911;
  const iso = `${String(y).padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** 派工單號比對用：去空白、大寫（同 DB 唯一索引 upper(btrim(report_no))）。 */
export function normalizeReportNo(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, "").toUpperCase();
}

/**
 * 照片上的派工單號與目前報告單不同 → 回照片上的單號（供警告）；相同或照片沒有單號 → null。
 */
export function reportNoMismatch(
  photoNo: string,
  currentNo: string,
): string | null {
  const photo = normalizeReportNo(photoNo);
  if (photo === "") return null;
  return photo === normalizeReportNo(currentNo) ? null : photo;
}

const CHECK_LABELS: Record<CheckStatus, string> = CHECK_STATUS_LABELS;

function normalizeResults(
  rawCompressor: unknown,
  rawDryer: unknown,
  rawFilter: unknown,
): ServiceReportResults {
  const out: ServiceReportResults = {};

  if (isRecord(rawCompressor)) {
    const c: Record<string, string> = {};
    for (const k of COMPRESSOR_TEXT_KEYS) {
      const v = text(rawCompressor[k], RESULT_TEXT_MAX);
      if (v) c[k] = v;
    }
    for (const k of COMPRESSOR_CHECK_KEYS) {
      const v = pickEnum(rawCompressor[k], CHECK_LABELS);
      if (v) c[k] = v;
    }
    if (Object.keys(c).length > 0) {
      out.compressor = c as ServiceReportResults["compressor"];
    }
  }

  if (isRecord(rawDryer)) {
    const d: Record<string, string> = {};
    for (const k of DRYER_TEXT_KEYS) {
      const v = text(rawDryer[k], RESULT_TEXT_MAX);
      if (v) d[k] = v;
    }
    for (const k of DRYER_CHECK_KEYS) {
      const v = pickEnum(rawDryer[k], CHECK_LABELS);
      if (v) d[k] = v;
    }
    if (Object.keys(d).length > 0) {
      out.dryer = d as ServiceReportResults["dryer"];
    }
  }

  const fc = pickEnum<FilterConsumable>(rawFilter, FILTER_CONSUMABLE_LABELS);
  if (fc) out.filter_consumable = fc;
  return out;
}

function normalizeParts(v: unknown): { name: string; qty: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { name: string; qty: string }[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const name = text(item.name, PART_NAME_MAX);
    const qty = text(item.qty, PART_QTY_MAX);
    if (qty === "") continue; // 沒寫數量＝沒換
    out.push({ name, qty });
    if (out.length >= MAX_EXTRACTED_PARTS) break;
  }
  return out;
}

function normalizeNames(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const out: string[] = [];
  for (const item of list) {
    // 模型偶爾把多位寫成一個字串「師傅甲、師傅乙」→ 拆開。
    for (const part of typeof item === "string"
      ? item.split(/[、,，/／]/)
      : []) {
      const name = text(part, TEXT_LIMITS.technician);
      if (name && !out.includes(name)) out.push(name);
    }
    if (out.length >= MAX_TECHNICIANS) break;
  }
  return out.slice(0, MAX_TECHNICIANS);
}

function normalizeLowConfidence(v: unknown): LowConfidenceField[] {
  if (!Array.isArray(v)) return [];
  const out: LowConfidenceField[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const key = item.trim();
    if (
      Object.prototype.hasOwnProperty.call(LOW_CONFIDENCE_FIELD_LABELS, key) &&
      !out.includes(key as LowConfidenceField)
    ) {
      out.push(key as LowConfidenceField);
    }
  }
  return out;
}

/** 模型原始輸出（JSON.parse 後）→ 已驗證的辨識結果。任何形狀都不丟錯。 */
export function normalizeReportExtraction(raw: unknown): ReportPhotoExtraction {
  if (!isRecord(raw)) return emptyExtraction();
  return {
    report_no: normalizeReportNo(text(raw.report_no, TEXT_LIMITS.report_no)),
    report_date: parsePhotoDate(raw.report_date),
    time_slot: pickEnum<TimeSlot>(raw.time_slot, TIME_SLOT_LABELS),
    machine_state: pickEnum<MachineState>(
      raw.machine_state,
      MACHINE_STATE_LABELS,
    ),
    service_items: pickEnumList<ServiceItem>(
      raw.service_items,
      SERVICE_ITEM_LABELS,
    ),
    summary: multiline(raw.summary, TEXT_LIMITS.summary),
    results: normalizeResults(raw.compressor, raw.dryer, raw.filter_consumable),
    parts: normalizeParts(raw.parts),
    suggestions: pickEnumList<Suggestion>(raw.suggestions, SUGGESTION_LABELS),
    technicians: normalizeNames(raw.technicians),
    customer_signer: text(raw.customer_signer, TEXT_LIMITS.customer_signer),
    low_confidence: normalizeLowConfidence(raw.low_confidence),
  };
}

/** 是否完全沒辨識到任何回填內容（全部空白 → 提示改拍清楚一點）。 */
export function isEmptyExtraction(e: ReportPhotoExtraction): boolean {
  return (
    e.report_no === "" &&
    e.report_date === null &&
    e.time_slot === null &&
    e.machine_state === null &&
    e.service_items.length === 0 &&
    e.summary === "" &&
    Object.keys(e.results).length === 0 &&
    e.parts.length === 0 &&
    e.suggestions.length === 0 &&
    e.technicians.length === 0 &&
    e.customer_signer === ""
  );
}
