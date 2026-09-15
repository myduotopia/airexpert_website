import { describe, it, expect, vi } from "vitest";

// 採購區純函式：「轉進貨單 / 轉進退單」的明細建構，與 P11509008 金額重現。
vi.mock("@/lib/supabase-server", () => ({ getServerSupabase: vi.fn() }));

import { calcDocumentTotals } from "@/lib/erp/calc";
import { buildLinesFromSource, todayIso } from "@/lib/erp/queries/purchasing";

type Src = Parameters<typeof buildLinesFromSource>[0][number];

function line(p: Partial<Src> & Pick<Src, "id" | "line_type">): Src {
  return {
    item_id: null,
    description: null,
    qty: 0,
    unit_price: 0,
    amount: 0,
    ...p,
  };
}

// P11509008：AM3-22A-E30 ×1 @220,000、折扣 −6,600。
const p11509008: Src[] = [
  line({
    id: "pl-1",
    line_type: "item",
    item_id: "am3",
    description: "AM3-22A-E30 空壓機",
    qty: 1,
    unit_price: 220000,
    amount: 220000,
  }),
  line({
    id: "pl-2",
    line_type: "discount",
    description: "折扣",
    amount: -6600,
  }),
  line({ id: "pl-3", line_type: "note", description: "備庫" }),
];

describe("P11509008 金額（calc.ts）", () => {
  it("合計 213,400、外加 5% 稅 10,670、總計 224,070", () => {
    const totals = calcDocumentTotals({
      lines: p11509008,
      taxType: "excluded",
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    });
    expect(totals).toMatchObject({
      subtotal: 213400,
      amount_untaxed: 213400,
      tax_amount: 10670,
      total_amount: 224070,
      total_twd: 224070,
    });
  });

  it("全數轉進貨單後金額與採購單一致", () => {
    const lines = buildLinesFromSource(p11509008, new Map([["pl-1", 1]]));
    const totals = calcDocumentTotals({
      lines,
      taxType: "excluded",
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    });
    expect(totals.total_amount).toBe(224070);
  });
});

describe("buildLinesFromSource", () => {
  const multi: Src[] = [
    line({
      id: "a",
      line_type: "item",
      item_id: "item-a",
      description: "A",
      qty: 3,
      unit_price: 100,
      amount: 300,
    }),
    line({
      id: "b",
      line_type: "item",
      item_id: "item-b",
      description: "B",
      qty: 2,
      unit_price: 50,
      amount: 100,
    }),
    line({ id: "d", line_type: "discount", description: "折讓", amount: -40 }),
  ];

  it("帶入各行未到貨量、source_line_id，已到齊的行略過", () => {
    const lines = buildLinesFromSource(
      multi,
      new Map([
        ["a", 2],
        ["b", 0],
      ]),
    );
    const items = lines.filter((l) => l.line_type === "item");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      item_id: "item-a",
      description: "A",
      qty: 2,
      unit_price: 100,
      source_line_id: "a",
      serial_ids: [],
      serial_nos: [],
    });
  });

  it("折扣依帶入品項金額比例分攤（200 / 400 → −20）", () => {
    const lines = buildLinesFromSource(multi, new Map([["a", 2]]));
    const disc = lines.find((l) => l.line_type === "discount");
    expect(disc?.amount).toBe(-20);
    expect(disc?.source_line_id).toBeNull();
  });

  it("全數帶入時折扣不變", () => {
    const lines = buildLinesFromSource(
      multi,
      new Map([
        ["a", 3],
        ["b", 2],
      ]),
    );
    expect(lines.map((l) => [l.line_type, l.qty, l.amount])).toEqual([
      ["item", 3, 0],
      ["item", 2, 0],
      ["discount", 0, -40],
    ]);
  });

  it("無剩餘量 → 空陣列", () => {
    expect(buildLinesFromSource(multi, new Map([["a", 0]]))).toEqual([]);
    expect(buildLinesFromSource(multi, new Map())).toEqual([]);
  });

  it("負數剩餘量視為 0；各行 key 唯一", () => {
    const lines = buildLinesFromSource(
      multi,
      new Map([
        ["a", -1],
        ["b", 1],
      ]),
    );
    expect(lines.filter((l) => l.line_type === "item")).toHaveLength(1);
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
  });
});

describe("todayIso", () => {
  it("以台北時區計算日期", () => {
    expect(todayIso(new Date("2026-09-15T17:30:00Z"))).toBe("2026-09-16");
    expect(todayIso(new Date("2026-09-15T15:59:00Z"))).toBe("2026-09-15");
  });
});
