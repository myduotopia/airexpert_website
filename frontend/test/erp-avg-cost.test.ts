import { describe, it, expect } from "vitest";
import {
  avgCostAfterInbound,
  avgCostAfterReturnOut,
  inboundUnitCosts,
} from "@/lib/erp/avg-cost";

// 移動加權平均成本（spec §5.2）。

describe("avgCostAfterInbound（I 進貨 / SR 銷退）", () => {
  it("一般情況：(q0·c0 + qty·in) / (q0 + qty)", () => {
    expect(avgCostAfterInbound({ q0: 10, c0: 100, qty: 10, inCost: 200 })).toBe(
      150,
    );
    expect(avgCostAfterInbound({ q0: 2, c0: 100, qty: 1, inCost: 101 })).toBe(
      100.3333,
    );
  });

  it("q0 = 0 → 直接取進貨成本", () => {
    expect(avgCostAfterInbound({ q0: 0, c0: 0, qty: 5, inCost: 880 })).toBe(
      880,
    );
  });

  it("q0 < 0（負庫存）→ 取進貨成本", () => {
    expect(avgCostAfterInbound({ q0: -2, c0: 500, qty: 5, inCost: 880 })).toBe(
      880,
    );
  });

  it("q0 + qty ≤ 0 → 取進貨成本（避免除以 0 / 負數）", () => {
    expect(avgCostAfterInbound({ q0: 0, c0: 500, qty: 0, inCost: 880 })).toBe(
      880,
    );
  });
});

describe("avgCostAfterReturnOut（PR 進退）", () => {
  it("一般情況：(q0·c0 − qty·ret) / (q0 − qty)", () => {
    expect(
      avgCostAfterReturnOut({ q0: 20, c0: 150, qty: 10, retCost: 200 }),
    ).toBe(100);
  });

  it("q0 − qty = 0 → 成本不變", () => {
    expect(
      avgCostAfterReturnOut({ q0: 10, c0: 150, qty: 10, retCost: 200 }),
    ).toBe(150);
  });

  it("q0 − qty < 0 → 成本不變", () => {
    expect(avgCostAfterReturnOut({ q0: 5, c0: 150, qty: 10, retCost: 1 })).toBe(
      150,
    );
  });
});

describe("inboundUnitCosts（進貨單折扣分攤 × 匯率）", () => {
  const lines = [
    { line_type: "item" as const, qty: 2, unit_price: 1000 },
    { line_type: "item" as const, qty: 1, unit_price: 2000 },
    { line_type: "discount" as const, qty: 0, unit_price: 0, amount: -400 },
    { line_type: "note" as const, qty: 0, unit_price: 0 },
  ];

  it("折扣依行金額比例分攤到各 item 行", () => {
    expect(inboundUnitCosts(lines, 1)).toEqual([900, 1800, null, null]);
  });

  it("外幣乘上匯率", () => {
    expect(inboundUnitCosts(lines, 30)).toEqual([27000, 54000, null, null]);
  });

  it("無折扣 → unit_price × 匯率", () => {
    expect(inboundUnitCosts([lines[0]], 31.5)).toEqual([31500]);
  });
});
