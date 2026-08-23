// 維護紀錄「服務類型」分類（例檢／保養／維修）。純函式、無 I/O，好單測。
//
// 規則來源：2026-08-23 開會結論（issue #154）。三選一互斥，依下列**優先順序**判定
// （順序即為 if / else-if，一列只會屬於一類）：
//   1. 例檢 inspection —「專用油」欄辨識到「例」（含「例.」「例行」等變形）。
//   2. 保養 maintenance — 否則，四個耗材欄（專用油／機油濾清器／空氣濾清器／油氣分離器）
//      任一直接寫了「純數量記號」（1~99、x1／×1、/、✓、○、│ 等勾記）。
//   3. 維修 repair — 否則，變頻器／過濾系統／備註任一寫了「非數量的文字內容」
//      （自由文字，例「油鏡×1只」「散熱器組清潔」「乾燥機12"散熱馬達+葉片」）。
//      「NA」「N/A」= 不適用，視同空白格，不算自由文字。
//   4. 皆不符 → null（判不出來，由人工在核對畫面補）。
//
// 此檔為規則的真相來源：AI 辨識只是加速，AI 沒給 service_type 或給了非法值時，
// 一律回頭用本檔推導（見 maintenance-normalize.parseExtraction）。SQL 版同規則見
// supabase/migrations/0014_record_service_type.sql，兩邊改動需同步。

export type ServiceType = "inspection" | "maintenance" | "repair";

/** 下拉／篩選用的固定順序。 */
export const SERVICE_TYPES: readonly ServiceType[] = [
  "inspection",
  "maintenance",
  "repair",
] as const;

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  inspection: "例檢",
  maintenance: "保養",
  repair: "維修",
};

/** badge 配色（三類可一眼區分；沿用後台 StatusBadge 的色票風格）。 */
export const SERVICE_TYPE_BADGE_CLASSES: Record<ServiceType, string> = {
  inspection: "bg-sky-100 text-sky-700",
  maintenance: "bg-primary/10 text-primary-deep",
  repair: "bg-amber-100 text-amber-700",
};

/**
 * 分類只看這七欄；刻意用選擇性欄位，讓 RecordPayload、表單值物件、DB 列都能直接傳入。
 */
export interface ServiceTypeInput {
  oil?: string | null;
  oil_filter?: string | null;
  air_filter?: string | null;
  oil_separator?: string | null;
  inverter?: string | null;
  filter_system?: string | null;
  note?: string | null;
}

/** 勾記類記號：單獨出現代表「該項已做／已更換」，不算自由文字。 */
const TICK_MARKS = "/／\\＼✓✔○◯〇│|∣ｌVv";

/** 純數量：1~99，或 x1／×1／X 2 之類的「符號 + 數量」。 */
const QUANTITY_RE = /^(?:[1-9][0-9]?|[xX×]\s*[1-9][0-9]?)$/;

/** trim 後再去掉結尾的句點／頓號（手寫常寫成「例.」「1.」）。 */
function normalizeCell(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/[.。、,，\s]+$/u, "");
}

/**
 * 是否為「純數量記號」——即該格只寫了數量或勾記，沒有描述性文字。
 * 匯出供 UI／測試共用。
 */
export function isQuantityMark(v: string | null | undefined): boolean {
  const s = normalizeCell(v);
  if (!s) return false;
  if (QUANTITY_RE.test(s)) return true;
  // 連續勾記（如「//」「✓✓」）也視為記號。
  return Array.from(s).every((c) => TICK_MARKS.includes(c));
}

/**
 * 「NA」「N/A」= 不適用／該次未做該項。辨識 prompt 明確要求手寫的 NA 原樣填入
 * （見 lib/ai/gemini.ts 手寫符號語彙），它代表「沒做這項」而非「做了維修」，
 * 因此視同空白格，不可當成自由文字。
 */
const NOT_APPLICABLE_RE = /^n\s*[./／]?\s*a$/i;

function isNotApplicable(v: string | null | undefined): boolean {
  return NOT_APPLICABLE_RE.test(normalizeCell(v));
}

/** 該格是否寫了「非數量的文字內容」（自由文字 → 維修的判準）。 */
function hasFreeText(v: string | null | undefined): boolean {
  const s = normalizeCell(v);
  return s !== "" && !isQuantityMark(v) && !isNotApplicable(v);
}

/**
 * 依開會結論的優先順序把一列維護紀錄歸類為例檢／保養／維修；判不出來回 null。
 */
export function classifyServiceType(r: ServiceTypeInput): ServiceType | null {
  // 1. 例檢：專用油欄含「例」（涵蓋「例」「例.」「例行」等手寫變形）。
  if ((r.oil ?? "").trim().includes("例")) return "inspection";

  // 2. 保養：耗材欄直接寫了數量／勾記（保養優先於維修）。
  if (
    isQuantityMark(r.oil) ||
    isQuantityMark(r.oil_filter) ||
    isQuantityMark(r.air_filter) ||
    isQuantityMark(r.oil_separator)
  ) {
    return "maintenance";
  }

  // 3. 維修：變頻器／過濾系統／備註寫了其他耗材名稱與數量（自由文字）。
  if (
    hasFreeText(r.inverter) ||
    hasFreeText(r.filter_system) ||
    hasFreeText(r.note)
  ) {
    return "repair";
  }

  return null;
}

/** 把外部輸入（表單值 / AI 回傳）收斂成合法 ServiceType；非法或空值回 null。 */
export function parseServiceType(v: unknown): ServiceType | null {
  const s = typeof v === "string" ? v.trim() : "";
  return (SERVICE_TYPES as readonly string[]).includes(s)
    ? (s as ServiceType)
    : null;
}
