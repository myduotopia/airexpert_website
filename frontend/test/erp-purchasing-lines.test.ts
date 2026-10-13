import { describe, it, expect, vi } from "vitest";

// 採購區純函式：「轉進貨單 / 轉進退單」的明細建構，與 P11509008 金額重現。
vi.mock("@/lib/supabase-server", () => ({ getServerSupabase: vi.fn() }));

import { calcDocumentTotals } from "@/lib/erp/calc";
import {
  buildLinesFromSource,
  capReturnableByStock,
  todayIso,
  type ReturnStockInfo,
} from "@/lib/erp/queries/purchasing";

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

// B-10：轉進退單預設數量 = min(原進貨數 − 已退數, 可退在庫量)。
describe("capReturnableByStock（進退預設數量扣除已售出／不在庫）", () => {
  type CapLine = Parameters<typeof capReturnableByStock>[0][number];
  const info = (p: Partial<ReturnStockInfo> = {}): ReturnStockInfo => ({
    items: new Map(),
    stockQty: new Map(),
    inStockSerialIds: new Set(),
    ...p,
  });
  const serialItem = { track_stock: true, track_serial: true };
  const stockItem = { track_stock: true, track_serial: false };
  const noStockItem = { track_stock: false, track_serial: false };

  // I11510002：乾燥機進 2 台（T001、T002），T001 已售出。
  const dryer: CapLine[] = [
    {
      id: "il-1",
      line_type: "item",
      item_id: "dryer",
      serials: [{ id: "t001" }, { id: "t002" }],
    },
    { id: "il-2", line_type: "discount", item_id: null, serials: [] },
  ];

  it("追蹤機號：本進貨單入庫、仍在原倉的機號數（2 台售出 1 台 → 1）", () => {
    const res = capReturnableByStock(
      dryer,
      new Map([["il-1", 2]]),
      info({
        items: new Map([["dryer", serialItem]]),
        stockQty: new Map([["dryer", 5]]),
        inStockSerialIds: new Set(["t002"]),
      }),
    );
    expect(res.get("il-1")).toBe(1);
  });

  it("追蹤機號：已退 1 台、剩 1 台在庫 → 1（取較小值，不重複扣）", () => {
    const res = capReturnableByStock(
      dryer,
      new Map([["il-1", 1]]),
      info({
        items: new Map([["dryer", serialItem]]),
        inStockSerialIds: new Set(["t002"]),
      }),
    );
    expect(res.get("il-1")).toBe(1);
  });

  it("追蹤機號：全數售出 → 0", () => {
    const res = capReturnableByStock(
      dryer,
      new Map([["il-1", 2]]),
      info({ items: new Map([["dryer", serialItem]]) }),
    );
    expect(res.get("il-1")).toBe(0);
  });

  it("追蹤庫存不追蹤機號：以原倉目前庫存為上限，負庫存視為 0", () => {
    const lines: CapLine[] = [
      { id: "a", line_type: "item", item_id: "filter", serials: [] },
    ];
    const cap = (stock: number) =>
      capReturnableByStock(
        lines,
        new Map([["a", 5]]),
        info({
          items: new Map([["filter", stockItem]]),
          stockQty: new Map([["filter", stock]]),
        }),
      ).get("a");
    expect(cap(3)).toBe(3);
    expect(cap(8)).toBe(5);
    expect(cap(-2)).toBe(0);
  });

  it("同品項多行共用庫存：依行序分配，不重複計算", () => {
    const lines: CapLine[] = [
      { id: "a", line_type: "item", item_id: "filter", serials: [] },
      { id: "b", line_type: "item", item_id: "filter", serials: [] },
    ];
    const res = capReturnableByStock(
      lines,
      new Map([
        ["a", 3],
        ["b", 2],
      ]),
      info({
        items: new Map([["filter", stockItem]]),
        stockQty: new Map([["filter", 4]]),
      }),
    );
    expect([res.get("a"), res.get("b")]).toEqual([3, 1]);
  });

  it("追蹤機號但該行沒有入庫機號（舊資料）→ 改以原倉庫存為上限", () => {
    const lines: CapLine[] = [
      { id: "a", line_type: "item", item_id: "dryer", serials: [] },
    ];
    const res = capReturnableByStock(
      lines,
      new Map([["a", 2]]),
      info({
        items: new Map([["dryer", serialItem]]),
        stockQty: new Map([["dryer", 1]]),
      }),
    );
    expect(res.get("a")).toBe(1);
  });

  it("不追蹤庫存：維持原數量 − 已退", () => {
    const lines: CapLine[] = [
      { id: "s", line_type: "item", item_id: "svc", serials: [] },
    ];
    const res = capReturnableByStock(
      lines,
      new Map([["s", 2]]),
      info({ items: new Map([["svc", noStockItem]]) }),
    );
    expect(res.get("s")).toBe(2);
  });

  it("數量減少時折扣依比例跟著調整（2 台 −1,000 → 退 1 台 −500）", () => {
    const src: Src[] = [
      line({
        id: "il-1",
        line_type: "item",
        item_id: "dryer",
        qty: 2,
        unit_price: 30000,
        amount: 60000,
      }),
      line({ id: "il-2", line_type: "discount", amount: -1000 }),
    ];
    const capped = capReturnableByStock(
      dryer,
      new Map([["il-1", 2]]),
      info({
        items: new Map([["dryer", serialItem]]),
        inStockSerialIds: new Set(["t002"]),
      }),
    );
    const lines = buildLinesFromSource(src, capped);
    expect(lines.map((l) => [l.line_type, l.qty, l.amount])).toEqual([
      ["item", 1, 0],
      ["discount", 0, -500],
    ]);
  });
});

describe("todayIso", () => {
  it("以台北時區計算日期", () => {
    expect(todayIso(new Date("2026-09-15T17:30:00Z"))).toBe("2026-09-16");
    expect(todayIso(new Date("2026-09-15T15:59:00Z"))).toBe("2026-09-15");
  });
});
