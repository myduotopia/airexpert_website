import { describe, it, expect } from "vitest";

// lib/erp/reports.ts：銷售毛利彙總（SR 扣減、作廢不計、內含稅、外幣、折扣分攤）。
import {
  aggregateSalesMargin,
  allocateCents,
  buildSalesFacts,
  documentUntaxed,
  type SalesDocInput,
  type SalesLineInput,
} from "@/lib/erp/reports";

const doc = (
  id: string,
  patch: Partial<SalesDocInput> = {},
): SalesDocInput => ({
  id,
  doc_type: "S",
  status: "posted",
  doc_date: "2026-09-10",
  customer_id: "c1",
  sales_rep: "王小明",
  tax_type: "excluded",
  tax_rate: 0.05,
  currency: "TWD",
  exchange_rate: 1,
  ...patch,
});

const item = (
  document_id: string,
  item_id: string,
  qty: number,
  amount: number,
  unit_cost: number | null,
): SalesLineInput => ({
  document_id,
  line_type: "item",
  item_id,
  qty,
  amount,
  unit_cost,
});

const discount = (document_id: string, amount: number): SalesLineInput => ({
  document_id,
  line_type: "discount",
  item_id: null,
  qty: 0,
  amount,
  unit_cost: null,
});

describe("allocateCents", () => {
  it("最大餘數分配，加總等於 target", () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateCents(-100, [1, 1, 1])).toEqual([-33, -33, -34]);
    const r = allocateCents(-1001, [300, 700])!;
    expect(r.reduce((s, x) => s + x, 0)).toBe(-1001);
  });
  it("權重合計為 0 回 null", () => {
    expect(allocateCents(0, [])).toBeNull();
    expect(allocateCents(10, [5, -5])).toBeNull();
  });
});

describe("buildSalesFacts / aggregateSalesMargin", () => {
  it("S 減 SR；作廢與草稿不計；期間外不計", () => {
    const docs = [
      doc("s1"),
      doc("sr1", { doc_type: "SR" }),
      doc("v1", { status: "voided" }),
      doc("d1", { status: "draft" }),
      doc("old", { doc_date: "2026-08-31" }),
      doc("q1", { doc_type: "Q" }),
    ];
    const lines = [
      item("s1", "i1", 3, 3000, 600),
      item("sr1", "i1", 1, 1000, 600),
      item("v1", "i1", 10, 10000, 600),
      item("d1", "i1", 10, 10000, 600),
      item("old", "i1", 10, 10000, 600),
      item("q1", "i1", 10, 10000, 600),
    ];
    const facts = buildSalesFacts(docs, lines, {
      from: "2026-09-01",
      to: "2026-09-30",
    });
    const r = aggregateSalesMargin(facts, "item");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      key: "i1",
      qty: 2,
      revenue: 2000,
      cost: 1200,
      margin: 800,
    });
    expect(r.rows[0].marginRate).toBeCloseTo(0.4);
    expect(r.totals).toMatchObject({ revenue: 2000, cost: 1200, margin: 800 });
  });

  it("內含稅：以 calc.ts 規則換算未稅（TWD 取整）", () => {
    expect(documentUntaxed(1050, "included", 0.05, "TWD")).toBe(1000);
    expect(documentUntaxed(1000, "included", 0.05, "TWD")).toBe(952);
    expect(documentUntaxed(1000, "excluded", 0.05, "TWD")).toBe(1000);
    const facts = buildSalesFacts(
      [doc("s1", { tax_type: "included" })],
      [item("s1", "a", 1, 600, 0), item("s1", "b", 1, 400, 0)],
    );
    // 未稅 952 → 依 600:400 分配 571.2 / 380.8
    const r = aggregateSalesMargin(facts, "item");
    expect(r.totals.revenue).toBe(952);
    const byKey = Object.fromEntries(r.rows.map((x) => [x.key, x.revenue]));
    expect(byKey.a).toBe(571.2);
    expect(byKey.b).toBe(380.8);
  });

  it("外幣：未稅 × 匯率換算 TWD；成本 unit_cost 已為 TWD", () => {
    const facts = buildSalesFacts(
      [doc("s1", { currency: "USD", exchange_rate: 32.5 })],
      [item("s1", "m", 2, 1000.5, 20000)],
    );
    const r = aggregateSalesMargin(facts, "customer");
    expect(r.rows[0]).toMatchObject({
      key: "c1",
      qty: 2,
      revenue: 32516.25,
      cost: 40000,
      margin: -7483.75,
    });
  });

  it("外幣內含稅：外幣 2 位取整後再換算", () => {
    // 105.01 / 1.05 = 100.0095… → 100.01（USD 2 位）× 30 = 3000.3
    const facts = buildSalesFacts(
      [
        doc("s1", {
          currency: "USD",
          exchange_rate: 30,
          tax_type: "included",
        }),
      ],
      [item("s1", "m", 1, 105.01, null)],
    );
    expect(aggregateSalesMargin(facts, "item").totals).toMatchObject({
      revenue: 3000.3,
      cost: 0,
    });
  });

  it("折扣：依客戶／業務歸入所屬單據；依品項按品項金額比例分攤", () => {
    const docs = [doc("s1"), doc("s2", { customer_id: "c2", sales_rep: null })];
    const lines = [
      item("s1", "a", 1, 3000, 1000),
      item("s1", "b", 1, 1000, 500),
      discount("s1", -400),
      { ...discount("s1", 0), line_type: "note" as const },
      item("s2", "a", 1, 2000, 1000),
    ];
    const facts = buildSalesFacts(docs, lines);

    const byCustomer = aggregateSalesMargin(facts, "customer");
    expect(
      Object.fromEntries(byCustomer.rows.map((r) => [r.key, r.revenue])),
    ).toEqual({ c1: 3600, c2: 2000 });

    const byRep = aggregateSalesMargin(facts, "sales_rep");
    expect(
      Object.fromEntries(byRep.rows.map((r) => [r.key, r.revenue])),
    ).toEqual({ 王小明: 3600, null: 2000 });

    const byItem = aggregateSalesMargin(facts, "item");
    // s1 折扣 −400 依 3000:1000 → a −300、b −100
    expect(
      Object.fromEntries(byItem.rows.map((r) => [r.key, r.revenue])),
    ).toEqual({ a: 4700, b: 900 });
    expect(byItem.totals.revenue).toBe(5600);
    expect(byItem.totals.cost).toBe(2500);
    expect(byItem.totals.margin).toBe(3100);
  });

  it("折扣分攤不可整除時以分為單位最大餘數，合計不失真", () => {
    const facts = buildSalesFacts(
      [doc("s1")],
      [
        item("s1", "a", 1, 100, 0),
        item("s1", "b", 1, 100, 0),
        item("s1", "c", 1, 100, 0),
        discount("s1", -100),
      ],
    );
    const r = aggregateSalesMargin(facts, "item");
    expect(r.totals.revenue).toBe(200);
    expect(r.rows.map((x) => x.revenue).sort()).toEqual([66.66, 66.67, 66.67]);
  });

  it("無品項行可分攤的折扣列為 item_id=null；SR 的折扣亦扣減", () => {
    const facts = buildSalesFacts(
      [doc("s1"), doc("sr1", { doc_type: "SR" })],
      [
        discount("s1", -50),
        item("sr1", "a", 1, 500, 100),
        discount("sr1", -100),
      ],
    );
    const r = aggregateSalesMargin(facts, "item");
    const byKey = Object.fromEntries(r.rows.map((x) => [x.key, x]));
    expect(byKey.null.revenue).toBe(-50);
    expect(byKey.a).toMatchObject({ qty: -1, revenue: -400, cost: -100 });
    expect(r.totals.revenue).toBe(-450);
  });

  it("銷售額為 0 時毛利率為 null", () => {
    const r = aggregateSalesMargin([], "customer");
    expect(r.rows).toEqual([]);
    expect(r.totals.marginRate).toBeNull();
  });
});
