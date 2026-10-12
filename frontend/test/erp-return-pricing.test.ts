import { describe, it, expect } from "vitest";

// lib/erp/returns.ts（#233）：銷退依原單折扣分攤後的淨價計算，且累計不得超過原單。
//   1. allocateDiscountNet：折扣依品項行金額比例分攤（同毛利報表），各行淨額合計 = 原單明細合計；
//      先算淨單價（台幣取整數、外幣 2 位），尾差放在「能整除吸收的行中金額最大者」（同額取最後一行）；
//   2. splitReturnPrice：可退金額 ÷ 可退數量除不盡時拆兩行（其餘 @ 去尾單價、最後 1 個補差），合計 = 可退金額；
//   3. validateReturnAmount：銷退明細合計（含銷退單自身折扣行）+ 已退 ≤ 原單。
import { calcDocumentTotals } from "@/lib/erp/calc";
import { newDraftLine } from "@/lib/erp/draft";
import {
  allocateDiscountNet,
  linesSubtotal,
  splitReturnPrice,
  validateReturnAmount,
} from "@/lib/erp/returns";
import type { LineType } from "@/lib/erp/types";

function src(
  id: string,
  type: LineType,
  qty: number,
  unitPrice: number,
  amount?: number,
) {
  return {
    id,
    line_type: type,
    qty,
    unit_price: unitPrice,
    amount: amount ?? (type === "item" ? qty * unitPrice : 0),
  };
}

/** 仿 S11510002：7 個品項合計 279,000、2 行折扣共 −40,000 → 未稅 239,000、外加 5% 總計 250,950。 */
function s11510002() {
  return [
    src("al010n", "item", 1, 32000),
    src("a", "item", 1, 120000),
    src("b", "item", 2, 30000),
    src("c", "item", 1, 25000),
    src("d", "item", 3, 12000),
    src("e", "item", 1, 5000),
    src("f", "item", 1, 1000),
    src("disc1", "discount", 0, 0, -30000),
    src("note", "note", 0, 0),
    src("disc2", "discount", 0, 0, -10000),
  ];
}

function sum(xs: number[]): number {
  return Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;
}

describe("allocateDiscountNet", () => {
  it("無折扣 → 各行淨額 = 原行金額（含台幣小數單價，不取整）", () => {
    const net = allocateDiscountNet(
      [src("x", "item", 2, 99.5), src("y", "item", 1, 1000)],
      "TWD",
    );
    expect(net).toEqual({ x: 199, y: 1000 });
  });

  it("單一品項行 → 淨額 = 品項 + 折扣", () => {
    expect(
      allocateDiscountNet(
        [src("x", "item", 1, 10000), src("d", "discount", 0, 0, -1500)],
        "TWD",
      ),
    ).toEqual({ x: 8500 });
  });

  it("折扣輸入正數也視為負數（同 calcLineAmount）", () => {
    expect(
      allocateDiscountNet(
        [src("x", "item", 1, 10000), src("d", "discount", 0, 0, 1500)],
        "TWD",
      ),
    ).toEqual({ x: 8500 });
  });

  it("S11510002：依品項金額比例分攤，合計 = 239,000，AL010N 約 27,412", () => {
    const net = allocateDiscountNet(s11510002(), "TWD");
    expect(Object.keys(net)).toEqual(["al010n", "a", "b", "c", "d", "e", "f"]);
    expect(sum(Object.values(net))).toBe(239000);
    expect(net.al010n).toBe(27412);
    // 淨單價四捨五入後合計 239,002，尾差 −2 放在金額最大的 a（數量 1 可整除吸收）。
    expect(net.a).toBe(102794);
    expect(net.b).toBe(2 * 25699);
    expect(net.d).toBe(3 * 10280);
    // 每行淨額皆可被數量整除（整數單價）→ 預設全退不需拆行。
    for (const l of s11510002().filter((x) => x.line_type === "item")) {
      expect(Number.isInteger(net[l.id] / l.qty)).toBe(true);
    }
  });

  it("尾差：最大行無法整除時改放可整除的行中金額最大者", () => {
    // 單價 101 × 3 = 303、1 × 100；折扣 −3 → 400。淨單價 100.25→100（×3=300）、99.25→99 → 399，尾差 +1。
    // 最大行數量 3 無法以整數吸收 +1 → 改放數量 1 的 y。
    const net = allocateDiscountNet(
      [
        src("x", "item", 3, 101),
        src("y", "item", 1, 100),
        src("d", "discount", 0, 0, -3),
      ],
      "TWD",
    );
    expect(net).toEqual({ x: 300, y: 100 });
  });

  it("尾差：同額時放最後一行（外幣 2 位小數）", () => {
    const net = allocateDiscountNet(
      [
        src("x", "item", 1, 10),
        src("y", "item", 1, 10),
        src("z", "item", 1, 10),
        src("d", "discount", 0, 0, -10),
      ],
      "USD",
    );
    // 每行 6.67，合計 20.01 → 尾差 −0.01 放在最後一行。
    expect(net).toEqual({ x: 6.67, y: 6.67, z: 6.66 });
  });

  it("尾差：沒有任何行能整除吸收 → 放金額最大行（淨單價非整數，由 splitReturnPrice 拆行）", () => {
    const net = allocateDiscountNet(
      [src("x", "item", 3, 100), src("d", "discount", 0, 0, -100)],
      "TWD",
    );
    expect(net).toEqual({ x: 200 });
  });

  it("金額 0 的贈品行不吸收尾差、淨額維持 0", () => {
    const net = allocateDiscountNet(
      [
        src("x", "item", 3, 100),
        src("free", "item", 1, 0),
        src("d", "discount", 0, 0, -100),
      ],
      "TWD",
    );
    expect(net).toEqual({ x: 200, free: 0 });
  });
});

describe("splitReturnPrice", () => {
  it("可整除 → 單一行", () => {
    expect(splitReturnPrice(3, 30840, "TWD")).toEqual([
      { qty: 3, unit_price: 10280 },
    ]);
  });

  it("2 位小數可表示 → 單一行（不拆）", () => {
    expect(splitReturnPrice(2, 82237, "TWD")).toEqual([
      { qty: 2, unit_price: 41118.5 },
    ]);
  });

  it("除不盡 → 其餘 @ 去尾單價、最後 1 個補差，合計 = 可退金額", () => {
    const parts = splitReturnPrice(3, 200, "TWD");
    expect(parts).toEqual([
      { qty: 2, unit_price: 66 },
      { qty: 1, unit_price: 68 },
    ]);
    expect(sum(parts.map((p) => p.qty * p.unit_price))).toBe(200);
  });

  it("外幣除不盡 → 去尾到分", () => {
    const parts = splitReturnPrice(3, 20, "USD");
    expect(parts).toEqual([
      { qty: 2, unit_price: 6.66 },
      { qty: 1, unit_price: 6.68 },
    ]);
  });

  it("非整數數量除不盡 → 單一行去尾到分（不超過可退金額）", () => {
    const [p] = splitReturnPrice(1.5, 100, "TWD");
    expect(p).toEqual({ qty: 1.5, unit_price: 66.66 });
    expect(p.qty * p.unit_price).toBeLessThanOrEqual(100);
  });

  it("可退金額 ≤ 0 → 單價 0；數量 ≤ 0 → 不帶", () => {
    expect(splitReturnPrice(2, -5, "TWD")).toEqual([{ qty: 2, unit_price: 0 }]);
    expect(splitReturnPrice(0, 100, "TWD")).toEqual([]);
  });
});

describe("全退：銷退合計 = 原單（各稅別）", () => {
  it.each(["excluded", "included", "exempt"] as const)("%s", (taxType) => {
    const lines = s11510002();
    const net = allocateDiscountNet(lines, "TWD");
    const returnLines = lines
      .filter((l) => l.line_type === "item")
      .flatMap((l) => splitReturnPrice(l.qty, net[l.id], "TWD"))
      .map((p) =>
        newDraftLine("item", { qty: p.qty, unit_price: p.unit_price }),
      );
    const opts = {
      taxType,
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    };
    const original = calcDocumentTotals({ lines, ...opts });
    const ret = calcDocumentTotals({ lines: returnLines, ...opts });
    expect(ret).toEqual(original);
    if (taxType === "excluded") {
      expect(original.amount_untaxed).toBe(239000);
      expect(original.total_amount).toBe(250950);
    }
  });
});

describe("linesSubtotal", () => {
  it("品項 + 折扣（備註、小計不計）", () => {
    expect(linesSubtotal(s11510002())).toBe(239000);
  });
});

describe("validateReturnAmount", () => {
  const limit = { original: 239000, returned: 30000 };

  it("未超過 / 剛好等於上限 → null", () => {
    expect(
      validateReturnAmount(
        [newDraftLine("item", { qty: 1, unit_price: 209000 })],
        limit,
        "excluded",
      ),
    ).toBeNull();
  });

  it("超過 → 錯誤訊息含本單金額、可退上限、原單與已退", () => {
    expect(
      validateReturnAmount(
        [newDraftLine("item", { qty: 1, unit_price: 209001 })],
        limit,
        "excluded",
      ),
    ).toBe(
      "銷退金額（未稅）209,001 超過原銷貨單可退金額 209,000（原單 239,000、已退 30,000）；請調低退貨單價或數量。",
    );
  });

  it("銷退單自身的折扣行會降低退貨金額", () => {
    expect(
      validateReturnAmount(
        [
          newDraftLine("item", { qty: 1, unit_price: 209500 }),
          newDraftLine("discount", { amount: -500 }),
        ],
        limit,
        "excluded",
      ),
    ).toBeNull();
  });

  it("內含稅以含稅金額比較（與原單同稅別），訊息標示含稅；外幣顯示 2 位", () => {
    expect(
      validateReturnAmount(
        [newDraftLine("item", { qty: 1, unit_price: 10.5 })],
        { original: 10, returned: 0 },
        "included",
        "USD",
      ),
    ).toBe(
      "銷退金額（含稅）10.50 超過原銷貨單可退金額 10.00（原單 10.00、已退 0.00）；請調低退貨單價或數量。",
    );
  });
});
