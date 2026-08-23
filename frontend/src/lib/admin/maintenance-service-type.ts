// 維護紀錄「服務類型」分類（例檢／保養／維修）。純函式、無 I/O，好單測。
//
// 規則來源：2026-08-23 開會結論（issue #154）。三選一互斥，依下列**優先順序**判定
// （順序即為 if / else-if，一列只會屬於一類）：
//   1. 例檢 inspection —「專用油」欄辨識到「例」（含「例.」「例行」等變形）。
//   2. 保養 maintenance — 否則，四個耗材欄（專用油／機油濾清器／空氣濾清器／油氣分離器）
//      任一直接寫了「純數量記號」（1~9、x1／×1、/、✓、○、│ 等勾記）。
//   3. 維修 repair — 否則，變頻器／過濾系統／備註任一寫了「非數量的文字內容」
//      （自由文字，例「油鏡×1只」「散熱器組清潔」「乾燥機12"散熱馬達+葉片」）。
//      「NA」「N/A」= 不適用，視同空白格，不算自由文字；只有數字或勾記的格子
//      （如時數「83」「37446」對欄偏移掉進來）也不算自由文字。
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

/**
 * 純數量：1~9，或 x1／×1／X 2 之類的「符號 + 數量」。
 *
 * 刻意只收個位數（issue #154 規格即為 1~9）：保養卡的「時數」欄是兩位數的月份序號
 * （83、88、84…）疊在五位數讀數上，OCR 對欄偏移時最容易把那個兩位數塞進耗材欄；
 * 真實耗材數量都是個位數，收窄後這種偏移會留在「未判定」而不是被靜默標成保養。
 */
const QUANTITY_RE = /^(?:[1-9]|[xX×]\s*[1-9])$/;

/**
 * 「只是數字或勾記」的格子：涵蓋 QUANTITY_RE，另外把兩位以上的數字（如時數 83／37446
 * 掉進變頻器／過濾系統／備註欄）也算進來。這種格子沒有描述性文字，不足以判成維修，
 * 寧可留 null 讓人工補，也不要靜默標錯（與 QUANTITY_RE 收窄的理由相同）。
 */
const BARE_MARK_RE = /^(?:[xX×]\s*)?[0-9]+$/;

/** trim 後再去掉結尾的句點／頓號（手寫常寫成「例.」「1.」）。 */
function normalizeCell(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/[.。、,，\s]+$/u, "");
}

/** 整格都是勾記（如「/」「//」「✓✓」）。 */
function isAllTicks(s: string): boolean {
  return s !== "" && Array.from(s).every((c) => TICK_MARKS.includes(c));
}

/**
 * 是否為「純數量記號」——即該格只寫了 1~9 的數量或勾記，沒有描述性文字。
 * 匯出僅供單元測試直接驗證（產品程式碼只透過 classifyServiceType 使用）。
 */
export function isQuantityMark(v: string | null | undefined): boolean {
  const s = normalizeCell(v);
  if (!s) return false;
  return QUANTITY_RE.test(s) || isAllTicks(s);
}

/** 是否只寫了數字（任意位數）或勾記——維修判準用的「非描述性文字」判斷。 */
function isBareMark(v: string | null | undefined): boolean {
  const s = normalizeCell(v);
  if (!s) return false;
  return BARE_MARK_RE.test(s) || isAllTicks(s);
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
  return s !== "" && !isBareMark(v) && !isNotApplicable(v);
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

/**
 * 詳情頁「未判定」頁籤的哨兵值（service_type is null 的列）。
 *
 * 刻意不重用 null：null 是 parseServiceType「沒帶／非法 → 不篩選」的回傳值，
 * 兩者混用會讓「全部」與「只看未判定」無法區分。字串值也不可能與真實 service_type
 * 相撞——DB 的 mx_records_service_type_check 只允許 inspection/maintenance/repair，
 * 且 parseServiceType("unclassified") 回 null（不在 SERVICE_TYPES 內）。
 */
export const UNCLASSIFIED = "unclassified";

export const UNCLASSIFIED_LABEL = "未判定";

/** 詳情頁 ?type= 的合法值：三個 ServiceType，或「只看未判定」。 */
export type ServiceTypeFilter = ServiceType | typeof UNCLASSIFIED;

/** 頁籤順序：例檢／保養／維修／未判定。 */
export const SERVICE_TYPE_FILTERS: readonly ServiceTypeFilter[] = [
  ...SERVICE_TYPES,
  UNCLASSIFIED,
] as const;

export const SERVICE_TYPE_FILTER_LABELS: Record<ServiceTypeFilter, string> = {
  ...SERVICE_TYPE_LABELS,
  [UNCLASSIFIED]: UNCLASSIFIED_LABEL,
};

/**
 * 把詳情頁 ?type= 收斂成篩選值；未帶、非法或重複帶（Next 會給陣列）→ null＝不篩選（全部）。
 * 與 parseServiceType 的差異只在多接受 UNCLASSIFIED 哨兵。
 */
export function parseServiceTypeFilter(v: unknown): ServiceTypeFilter | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s === UNCLASSIFIED) return UNCLASSIFIED;
  return parseServiceType(s);
}

/** 該列是否為「未判定」（service_type 為 null／未設定）。 */
export function isUnclassified(r: { service_type: ServiceType | null }) {
  return !r.service_type;
}
