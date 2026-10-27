// 客戶來源（mx_customers.source，0035，#266）的純邏輯：正規化、標籤、列表篩選參數。
// 來源為自由文字（DB 無 check 約束）；常見值「FB」（Facebook 來的客戶）統一存成大寫 FB，
// 列表才能以「FB／其他來源／未填」篩選。client、server、客戶匯入腳本與測試共用；不可 import server-only 模組。

/** Facebook 來的客戶（舊系統名稱標註 (FA)）。 */
export const FB_SOURCE = "FB";

/** 去頭尾空白；空白 → null；fb（不分大小寫）→ FB；其餘照原文。 */
export function normalizeCustomerSource(
  v: string | null | undefined,
): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return s.toUpperCase() === FB_SOURCE ? FB_SOURCE : s;
}

export function isFbSource(v: string | null | undefined): boolean {
  return normalizeCustomerSource(v) === FB_SOURCE;
}

/** 列表／詳情顯示的來源標籤文字；未填回 null。 */
export function customerSourceLabel(
  v: string | null | undefined,
): string | null {
  return normalizeCustomerSource(v);
}

export type CustomerSourceFilter = "all" | "fb" | "other" | "none";

export const CUSTOMER_SOURCE_FILTERS: readonly {
  value: CustomerSourceFilter;
  label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "fb", label: "FB" },
  { value: "other", label: "其他來源" },
  { value: "none", label: "未填" },
];

/** 網址參數 → 篩選值；不認得的一律視為「全部」。 */
export function parseCustomerSourceFilter(
  v: string | null | undefined,
): CustomerSourceFilter {
  return v === "fb" || v === "other" || v === "none" ? v : "all";
}
