// ERP 顯示格式（千分位金額、數量）。純函式，client / server 皆可用。
import { currencyDecimals, roundHalfAwayFromZero } from "./calc";

/**
 * 金額千分位：formatMoney(224070) → "224,070"；formatMoney(12.5, 2) → "12.50"。
 * decimals 未指定時依 currency（TWD 0 位、外幣 2 位）。null / 非數字回 "—"。
 */
export function formatMoney(
  value: number | null | undefined,
  opts: { currency?: string; decimals?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const dp = opts.decimals ?? currencyDecimals(opts.currency ?? "TWD");
  const rounded = roundHalfAwayFromZero(value, dp);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** 數量：去掉多餘的小數 0（numeric(12,3)）。formatQty(2) → "2"、formatQty(1.5) → "1.5"。 */
export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return roundHalfAwayFromZero(value, 3).toLocaleString("en-US", {
    maximumFractionDigits: 3,
  });
}
