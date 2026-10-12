// 銷退金額（#233）：原銷貨單的折扣分攤到各品項行，銷退以「淨價」退貨，且同一銷貨單累計銷退不得超過原單。
// 純函式，client（表單即時提示）與 server（建立銷退草稿、存草稿檢查）共用。過帳時 DB（0028）會再檢查累計金額。
//
// 金額口徑：一律以「明細合計」= Σ 品項行 + 折扣行金額（單據幣別、calc.ts calcLineAmount）比較。
// 銷退單的稅別、幣別固定沿用原銷貨單，故明細合計相等 ⇔ 未稅、稅額、總計皆相等
// （外加／免稅時明細合計即未稅合計；內含稅時為含稅合計，避免逐張單四捨五入未稅額造成累計誤差）。
import {
  calcLineAmount,
  currencyDecimals,
  roundHalfAwayFromZero,
} from "./calc";
import { formatMoney } from "./format";
import type { LineType, TaxType } from "./types";

type AmountLine = {
  line_type: LineType;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
};

type SourceLine = AmountLine & { id: string };

function cents(x: number): number {
  return roundHalfAwayFromZero(x, 2);
}

/** x 是否能以 decimals 位小數精確表示（容許浮點誤差）。 */
function representable(x: number, decimals: number): boolean {
  return Math.abs(roundHalfAwayFromZero(x, decimals) - x) < 1e-9;
}

/** 去尾（向 0）到 decimals 位；先消除浮點誤差（0.29 × 100 = 28.999…）。 */
function truncateTo(x: number, decimals: number): number {
  const shifted = roundHalfAwayFromZero(x * 10 ** decimals, 6);
  return roundHalfAwayFromZero(Math.trunc(shifted) / 10 ** decimals, decimals);
}

/** 明細合計：Σ 品項行 + 折扣行金額（折扣一律負數；備註、小計不計）。 */
export function linesSubtotal(lines: readonly AmountLine[]): number {
  return cents(
    lines
      .filter((l) => l.line_type === "item" || l.line_type === "discount")
      .reduce((s, l) => s + calcLineAmount(l), 0),
  );
}

/**
 * 原單折扣依品項行金額比例分攤（同毛利報表 buildSalesFacts 的口徑），回傳各品項行（依 id）的淨額。
 * lines 需依 line_no 排序（同額時「最後一行」以此順序判斷）。
 *
 * 1. 無折扣（或品項合計 ≤ 0 無從分攤）→ 淨額 = 原行金額，不做任何取整；
 * 2. 淨單價 = 行金額 × (明細合計 ÷ 品項合計) ÷ 數量，取到幣別小數位（台幣整數、外幣 2 位），淨額 = 數量 × 淨單價；
 * 3. 尾差（明細合計 − Σ 淨額）放在「尾差 ÷ 數量 能以幣別小數位（不行再試 2 位）表示」的行中金額最大者
 *    （同額取最後一行；金額 0 的贈品行不吸收），使各行淨單價仍為整齊數字、預設全退不需拆行；
 *    若沒有任何行能整除吸收，才放在金額最大行（該行淨額除不盡，由 splitReturnPrice 拆成兩行）。
 * 保證 Σ 淨額 = 明細合計（原單未稅合計；內含稅時為含稅合計）。
 */
export function allocateDiscountNet(
  lines: readonly SourceLine[],
  currency: string,
): Record<string, number> {
  const items = lines.filter((l) => l.line_type === "item");
  const amounts = items.map((l) => calcLineAmount(l));
  const itemSum = cents(amounts.reduce((s, a) => s + a, 0));
  const discountSum = cents(
    lines
      .filter((l) => l.line_type === "discount")
      .reduce((s, l) => s + calcLineAmount(l), 0),
  );
  const out: Record<string, number> = {};
  if (discountSum === 0 || itemSum <= 0) {
    items.forEach((l, i) => (out[l.id] = amounts[i]));
    return out;
  }

  const dp = currencyDecimals(currency);
  const target = Math.max(0, cents(itemSum + discountSum));
  const factor = target / itemSum;
  const qtys = items.map((l) => Number(l.qty) || 0);
  const nets = items.map((_, i) =>
    qtys[i] > 0
      ? cents(
          qtys[i] * roundHalfAwayFromZero((amounts[i] * factor) / qtys[i], dp),
        )
      : 0,
  );

  const residual = cents(target - nets.reduce((s, n) => s + n, 0));
  if (residual !== 0) {
    const largest = (candidates: number[]) =>
      candidates.reduce<number | null>(
        (best, i) => (best === null || amounts[i] >= amounts[best] ? i : best),
        null,
      );
    const absorbable = (d: number) =>
      items
        .map((_, i) => i)
        .filter(
          (i) =>
            qtys[i] > 0 &&
            amounts[i] > 0 &&
            representable(residual / qtys[i], d),
        );
    const tail =
      largest(absorbable(dp)) ??
      largest(absorbable(2)) ??
      largest(items.map((_, i) => i).filter((i) => amounts[i] > 0)) ??
      largest(items.map((_, i) => i));
    if (tail !== null) nets[tail] = cents(nets[tail] + residual);
  }
  items.forEach((l, i) => (out[l.id] = nets[i]));
  return out;
}

export interface ReturnPricePart {
  qty: number;
  unit_price: number;
}

/**
 * 可退數量 qty、可退金額 cap → 銷退行（單價為 numeric(14,2)，數量 × 單價需剛好 = cap）：
 * - cap ÷ qty 能以 2 位小數表示 → 一行；
 * - 否則數量為 ≥ 2 的整數 → 拆兩行：qty − 1 個 @ 去尾單價（幣別小數位）、最後 1 個 @ 補差，合計 = cap；
 * - 否則（非整數數量）→ 一行 @ 去尾到分（金額略低於 cap，不會超過上限）。
 * cap ≤ 0 → 單價 0；qty ≤ 0 → 不帶。
 */
export function splitReturnPrice(
  qty: number,
  cap: number,
  currency: string,
): ReturnPricePart[] {
  if (!(qty > 0)) return [];
  const amount = Math.max(0, cents(cap));
  const exact = roundHalfAwayFromZero(amount / qty, 2);
  if (cents(qty * exact) === amount) return [{ qty, unit_price: exact }];
  if (Number.isInteger(qty) && qty >= 2) {
    const base = truncateTo(amount / qty, currencyDecimals(currency));
    return [
      { qty: qty - 1, unit_price: base },
      { qty: 1, unit_price: cents(amount - (qty - 1) * base) },
    ];
  }
  return [{ qty, unit_price: truncateTo(amount / qty, 2) }];
}

/** 同一銷貨單的銷退金額上限：原單明細合計、其他已過帳銷退單的明細合計。 */
export interface ReturnAmountLimit {
  original: number;
  returned: number;
}

/**
 * 銷退草稿的金額檢查（存草稿前；過帳時 DB 會再檢查一次）：
 * 本單明細合計（含本單折扣行）+ 已退 ≤ 原單明細合計。回傳錯誤訊息或 null。
 */
export function validateReturnAmount(
  lines: readonly AmountLine[],
  limit: ReturnAmountLimit,
  taxType: TaxType,
  currency = "TWD",
): string | null {
  const total = linesSubtotal(lines);
  const remaining = cents(limit.original - limit.returned);
  if (total <= remaining) return null;
  const fmt = (x: number) => formatMoney(x, { currency });
  const label = taxType === "included" ? "含稅" : "未稅";
  return `銷退金額（${label}）${fmt(total)} 超過原銷貨單可退金額 ${fmt(remaining)}（原單 ${fmt(limit.original)}、已退 ${fmt(limit.returned)}）；請調低退貨單價或數量。`;
}
