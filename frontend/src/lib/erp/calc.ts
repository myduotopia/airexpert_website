// 單據金額 / 稅額試算（spec §5.1）。純函式，client 即時試算與 server 存草稿共用。
// DB 過帳時由 SQL 重新計算為準；兩邏輯需一致（SQL round() 為「四捨五入、遠離 0」）。
import type { LineType, TaxType } from "./types";

/**
 * 四捨五入到 decimals 位（遠離 0，同 Postgres numeric round）。
 * 以指數字串位移避免浮點誤差（1.005 → 1.01，而非 Math.round 的 1.00）。
 */
export function roundHalfAwayFromZero(x: number, decimals = 0): number {
  if (!Number.isFinite(x)) return 0;
  const sign = x < 0 ? -1 : 1;
  const shifted = Math.round(Number(`${Math.abs(x)}e${decimals}`));
  const result = sign * Number(`${shifted}e-${decimals}`);
  // 避免回傳 -0。
  return result === 0 ? 0 : result;
}

/** 幣別的金額小數位：TWD 取整數，外幣取 2 位。 */
export function currencyDecimals(currency: string): number {
  return currency.trim().toUpperCase() === "TWD" ? 0 : 2;
}

/**
 * 單行金額：
 * - item：round(qty × unit_price, 2)
 * - discount：使用者輸入的折扣金額，一律轉為負數（輸入 38000 或 -38000 皆為 -38000）
 * - note：0
 */
export function calcLineAmount(line: {
  line_type: LineType;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}): number {
  switch (line.line_type) {
    case "item":
      return roundHalfAwayFromZero(
        (Number(line.qty) || 0) * (Number(line.unit_price) || 0),
        2,
      );
    case "discount":
      return roundHalfAwayFromZero(-Math.abs(Number(line.amount) || 0), 2);
    default:
      return 0;
  }
}

export interface DocumentTotalsInput {
  lines: {
    line_type: LineType;
    qty?: number | null;
    unit_price?: number | null;
    amount?: number | null;
  }[];
  taxType: TaxType;
  /** 稅率，例 0.05。 */
  taxRate: number;
  currency: string;
  /** 匯率（TWD 為 1）。 */
  exchangeRate: number;
}

export interface DocumentTotals {
  /** Σ 行金額（未依幣別取整）。 */
  subtotal: number;
  amount_untaxed: number;
  tax_amount: number;
  /** 以單據幣別。 */
  total_amount: number;
  /** 應收應付以此計：round(total × exchange_rate, 0)。 */
  total_twd: number;
}

/**
 * 表頭合計（spec §5.1）：
 * - excluded（外加）：untaxed = subtotal；tax = round(subtotal × rate)；total = subtotal + tax
 * - included（內含）：total = subtotal；untaxed = round(total / (1 + rate))；tax = total − untaxed
 * - exempt（免稅）：tax = 0；total = untaxed = subtotal
 * round 的位數：TWD 取整數、外幣 2 位。total_twd = round(total × exchange_rate, 0)。
 */
export function calcDocumentTotals(input: DocumentTotalsInput): DocumentTotals {
  const dp = currencyDecimals(input.currency);
  const rate = Number(input.taxRate) || 0;
  const subtotal = roundHalfAwayFromZero(
    input.lines.reduce((sum, l) => sum + calcLineAmount(l), 0),
    2,
  );

  let untaxed: number;
  let tax: number;
  let total: number;
  switch (input.taxType) {
    case "excluded":
      untaxed = subtotal;
      tax = roundHalfAwayFromZero(subtotal * rate, dp);
      total = roundHalfAwayFromZero(subtotal + tax, 2);
      break;
    case "included":
      total = subtotal;
      untaxed = roundHalfAwayFromZero(total / (1 + rate), dp);
      tax = roundHalfAwayFromZero(total - untaxed, 2);
      break;
    default:
      untaxed = subtotal;
      tax = 0;
      total = subtotal;
  }

  const fx = Number(input.exchangeRate) || 0;
  return {
    subtotal,
    amount_untaxed: untaxed,
    tax_amount: tax,
    total_amount: total,
    total_twd: roundHalfAwayFromZero(total * fx, 0),
  };
}
