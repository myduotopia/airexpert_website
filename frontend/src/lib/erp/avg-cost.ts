// 移動加權平均成本（spec §5.2）。純函式；DB 過帳由 SQL 計算為準，這裡供試算與測試對照。
// 成本以 TWD、全公司（不分倉）計。記號：q0 = 過帳前全倉總量、c0 = 過帳前 avg_cost。
import { roundHalfAwayFromZero } from "./calc";

/** 單位成本精度（numeric(14,4)）。 */
const COST_DP = 4;

/**
 * 入庫後的平均成本（I 進貨、SR 銷退、以及作廢 PR 視同入庫）：
 * C1 = (q0·c0 + qty·inCost) / (q0 + qty)；若 q0 < 0 或 q0 + qty ≤ 0 → C1 = inCost。
 */
export function avgCostAfterInbound(p: {
  q0: number;
  c0: number;
  qty: number;
  inCost: number;
}): number {
  const { q0, c0, qty, inCost } = p;
  if (q0 < 0 || q0 + qty <= 0) return roundHalfAwayFromZero(inCost, COST_DP);
  return roundHalfAwayFromZero((q0 * c0 + qty * inCost) / (q0 + qty), COST_DP);
}

/**
 * 以特定成本出庫後的平均成本（PR 進退，以及作廢 I / SR 視同以原成本出庫）：
 * C1 = (q0·c0 − qty·retCost) / (q0 − qty)；若 q0 − qty ≤ 0 → C1 = c0（不變）。
 */
export function avgCostAfterReturnOut(p: {
  q0: number;
  c0: number;
  qty: number;
  retCost: number;
}): number {
  const { q0, c0, qty, retCost } = p;
  if (q0 - qty <= 0) return roundHalfAwayFromZero(c0, COST_DP);
  return roundHalfAwayFromZero((q0 * c0 - qty * retCost) / (q0 - qty), COST_DP);
}

/**
 * 進貨單各 item 行的入庫單位成本（TWD）：
 * in_cost = 分攤折扣後行金額 / qty × exchange_rate；
 * 折扣行（負數）依各 item 行金額比例分攤。回傳與 lines 同長度陣列，非 item 行為 null。
 */
export function inboundUnitCosts(
  lines: {
    line_type: "item" | "discount" | "note";
    qty: number;
    unit_price: number;
    amount?: number | null;
  }[],
  exchangeRate: number,
): (number | null)[] {
  const itemAmount = (l: { qty: number; unit_price: number }) =>
    roundHalfAwayFromZero(l.qty * l.unit_price, 2);
  const itemTotal = lines
    .filter((l) => l.line_type === "item")
    .reduce((s, l) => s + itemAmount(l), 0);
  const discountTotal = lines
    .filter((l) => l.line_type === "discount")
    .reduce((s, l) => s - Math.abs(Number(l.amount) || 0), 0);

  return lines.map((l) => {
    if (l.line_type !== "item") return null;
    if (!l.qty) return 0;
    const amt = itemAmount(l);
    const share = itemTotal !== 0 ? (discountTotal * amt) / itemTotal : 0;
    return roundHalfAwayFromZero(
      ((amt + share) / l.qty) * exchangeRate,
      COST_DP,
    );
  });
}
