import { describe, it, expect, vi } from "vitest";

// lib/erp/queries/sales.ts 的純函式：報價轉銷貨、銷貨轉銷退（可退數量上限）、
// 銷退數量檢查、成本毛利；以及 S11509047 範例單的合計（calc.ts）。
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => {
    throw new Error("pure tests must not touch supabase");
  }),
}));

import { calcDocumentTotals } from "@/lib/erp/calc";
import { newDraftLine } from "@/lib/erp/draft";
import {
  calcSaleMargins,
  quoteToSaleDraft,
  returnableLines,
  saleToReturnDraft,
  todayTaipei,
  validateReturnQty,
} from "@/lib/erp/queries/sales";
import type {
  DocType,
  ErpDocumentWithLines,
  LineType,
  TaxType,
} from "@/lib/erp/types";

type Line = ErpDocumentWithLines["lines"][number];

function line(
  id: string,
  lineNo: number,
  type: LineType,
  patch: Partial<Line> = {},
): Line {
  return {
    id,
    document_id: "doc",
    line_no: lineNo,
    line_type: type,
    item_id: null,
    description: null,
    qty: 0,
    unit_price: 0,
    amount: 0,
    unit_cost: null,
    source_line_id: null,
    serial_nos: null,
    serials: [],
    ...patch,
  };
}

function doc(
  docType: DocType,
  lines: Line[],
  patch: Partial<ErpDocumentWithLines> = {},
): ErpDocumentWithLines {
  return {
    id: `${docType}-doc`,
    doc_type: docType,
    doc_no: `${docType}11509047`,
    doc_date: "2026-09-10",
    status: "posted",
    customer_id: "cust-1",
    vendor_id: null,
    warehouse_id: "wh-main",
    to_warehouse_id: null,
    source_doc_id: null,
    party_name: "兆利科技",
    party_tax_id: null,
    party_contact: null,
    party_phone: null,
    party_address: null,
    sales_rep: "阿宏",
    tax_type: "included",
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    amount_untaxed: 0,
    tax_amount: 0,
    total_amount: 0,
    total_twd: 0,
    invoice_no: null,
    expected_date: "2026-10-10",
    note: "備庫",
    posted_at: null,
    posted_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: null,
    created_by: null,
    lines,
    ...patch,
  };
}

/** S11509047 的明細（spec §5.1 範例）。 */
function s11509047Lines() {
  return [
    newDraftLine("item", {
      item_id: "ALH-15AI",
      qty: 1,
      unit_price: 195000,
      serial_ids: ["26-PM15060010"],
    }),
    newDraftLine("item", { item_id: "LM-AL020N", qty: 1, unit_price: 50000 }),
    newDraftLine("item", { item_id: "TOK-0360-S", qty: 1, unit_price: 20000 }),
    newDraftLine("item", { item_id: "LM-F-0020-P", qty: 1, unit_price: 8000 }),
    newDraftLine("item", { item_id: "NAD-0402-CKD", qty: 1, unit_price: 0 }),
    newDraftLine("discount", {
      description: "3101 優惠專案折扣",
      amount: -38000,
    }),
    newDraftLine("note", { description: "付款方式：匯款" }),
    newDraftLine("note", { description: "餘額交機後付清" }),
  ];
}

describe("S11509047 合計（calc.ts）", () => {
  it.each<[TaxType, number, number, number]>([
    ["included", 235000, 223810, 11190],
    ["exempt", 235000, 235000, 0],
  ])("%s → 總計 %d", (taxType, total, untaxed, tax) => {
    const totals = calcDocumentTotals({
      lines: s11509047Lines(),
      taxType,
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    });
    expect(totals.subtotal).toBe(235000);
    expect(totals.total_amount).toBe(total);
    expect(totals.amount_untaxed).toBe(untaxed);
    expect(totals.tax_amount).toBe(tax);
    expect(totals.total_twd).toBe(total);
  });

  it("折扣輸入正數也視為 −38,000", () => {
    const lines = s11509047Lines().map((l) =>
      l.line_type === "discount" ? { ...l, amount: 38000 } : l,
    );
    expect(
      calcDocumentTotals({
        lines,
        taxType: "exempt",
        taxRate: 0.05,
        currency: "TWD",
        exchangeRate: 1,
      }).total_amount,
    ).toBe(235000);
  });
});

describe("quoteToSaleDraft", () => {
  const quote = doc("Q", [
    line("ql-1", 1, "item", {
      item_id: "ALH-15AI",
      description: "ALH-15AI 空壓機",
      qty: 1,
      unit_price: 195000,
      amount: 195000,
    }),
    line("ql-2", 2, "discount", {
      description: "3101 優惠專案折扣",
      amount: -38000,
    }),
    line("ql-3", 3, "note", { description: "付款方式：匯款" }),
  ]);

  it("複製表頭與全部明細，item 行帶 source_line_id，草稿無 id", () => {
    const draft = quoteToSaleDraft(quote, {
      docDate: "2026-09-15",
      warehouseId: "wh-main",
    });
    expect(draft).toMatchObject({
      id: null,
      doc_type: "S",
      doc_date: "2026-09-15",
      customer_id: "cust-1",
      warehouse_id: "wh-main",
      source_doc_id: "Q-doc",
      sales_rep: "阿宏",
      tax_type: "included",
      tax_rate: 0.05,
      note: "備庫",
      expected_date: null,
    });
    expect(
      draft.lines.map((l) => [
        l.line_type,
        l.item_id,
        l.description,
        l.qty,
        l.unit_price,
        l.amount,
        l.source_line_id,
        l.serial_ids,
      ]),
    ).toEqual([
      ["item", "ALH-15AI", "ALH-15AI 空壓機", 1, 195000, 195000, "ql-1", []],
      ["discount", null, "3101 優惠專案折扣", 0, 0, -38000, null, []],
      ["note", null, "付款方式：匯款", 0, 0, 0, null, []],
    ]);
    expect(new Set(draft.lines.map((l) => l.key)).size).toBe(3);
  });
});

describe("銷退：saleToReturnDraft / returnableLines / validateReturnQty", () => {
  const sale = doc(
    "S",
    [
      line("sl-1", 1, "item", {
        item_id: "ALH-15AI",
        description: "ALH-15AI",
        qty: 1,
        unit_price: 195000,
        amount: 195000,
      }),
      line("sl-2", 2, "item", {
        item_id: "TOK-0360-S",
        description: "TOK",
        qty: 5,
        unit_price: 4000,
        amount: 20000,
      }),
      line("sl-3", 3, "discount", { amount: -38000 }),
      line("sl-4", 4, "note", { description: "備註" }),
    ],
    { tax_type: "exempt" },
  );

  it("只帶尚可退的 item 行，數量上限 = 銷貨 − 已退", () => {
    const draft = saleToReturnDraft(sale, {
      docDate: "2026-09-20",
      returnedQtyByLine: { "sl-1": 1, "sl-2": 2 },
    });
    expect(draft).toMatchObject({
      doc_type: "SR",
      source_doc_id: "S-doc",
      customer_id: "cust-1",
      warehouse_id: "wh-main",
      tax_type: "exempt",
    });
    expect(
      draft.lines.map((l) => [
        l.source_line_id,
        l.item_id,
        l.qty,
        l.unit_price,
      ]),
    ).toEqual([["sl-2", "TOK-0360-S", 3, 4000]]);
  });

  it("全部退完 → 無明細", () => {
    expect(
      saleToReturnDraft(sale, {
        docDate: "2026-09-20",
        returnedQtyByLine: { "sl-1": 1, "sl-2": 5 },
      }).lines,
    ).toEqual([]);
  });

  it("returnableLines 不小於 0", () => {
    expect(
      returnableLines(sale, { "sl-2": 9 }).map((r) => [
        r.line_id,
        r.sold,
        r.returned,
        r.remaining,
      ]),
    ).toEqual([
      ["sl-1", 1, 0, 1],
      ["sl-2", 5, 9, 0],
    ]);
  });

  it("validateReturnQty：同來源行合計超過可退 → 錯誤；未超過 → null", () => {
    const returnable = returnableLines(sale, { "sl-2": 2 });
    const ok = [
      newDraftLine("item", {
        item_id: "TOK-0360-S",
        qty: 3,
        source_line_id: "sl-2",
      }),
    ];
    expect(validateReturnQty(ok, returnable)).toBeNull();

    const over = [
      newDraftLine("item", {
        item_id: "TOK-0360-S",
        qty: 2,
        source_line_id: "sl-2",
      }),
      newDraftLine("item", {
        item_id: "TOK-0360-S",
        qty: 2,
        source_line_id: "sl-2",
      }),
    ];
    expect(validateReturnQty(over, returnable)).toBe(
      "第 2 行退貨數量 4 超過可退數量 3（原銷貨 5、已退 2）。",
    );
  });

  it("validateReturnQty：來源行不屬於此單 / 品項不符", () => {
    const returnable = returnableLines(sale, {});
    expect(
      validateReturnQty(
        [newDraftLine("item", { item_id: "X", qty: 1, source_line_id: "zz" })],
        returnable,
      ),
    ).toContain("不屬於此銷貨單");
    expect(
      validateReturnQty(
        [
          newDraftLine("item", {
            item_id: "X",
            qty: 1,
            source_line_id: "sl-1",
          }),
        ],
        returnable,
      ),
    ).toContain("品項與來源銷貨行不同");
  });
});

describe("calcSaleMargins", () => {
  it("行毛利以未稅計、單據毛利含折扣", () => {
    const sale = doc(
      "S",
      [
        line("a", 1, "item", { qty: 1, amount: 195000, unit_cost: 150000 }),
        line("b", 2, "item", { qty: 2, amount: 20000, unit_cost: 4000.5 }),
        line("c", 3, "discount", { amount: -38000 }),
        line("d", 4, "item", { qty: 1, amount: 0, unit_cost: null }),
      ],
      { tax_type: "exempt", amount_untaxed: 177000 },
    );
    const m = calcSaleMargins(sale);
    expect(m.lines).toEqual({
      a: { cost: 150000, margin: 45000 },
      b: { cost: 8001, margin: 11999 },
      d: { cost: null, margin: null },
    });
    expect(m.totalCost).toBe(158001);
    expect(m.grossMargin).toBe(18999);
    expect(m.marginRate).toBeCloseTo(18999 / 177000);
  });

  it("內含稅：行銷售額 = 金額 ÷ 1.05", () => {
    const sale = doc(
      "S",
      [line("a", 1, "item", { qty: 1, amount: 105000, unit_cost: 60000 })],
      { tax_type: "included", amount_untaxed: 100000 },
    );
    const m = calcSaleMargins(sale);
    expect(m.lines.a).toEqual({ cost: 60000, margin: 40000 });
    expect(m.grossMargin).toBe(40000);
  });
});

describe("todayTaipei", () => {
  it("以台北時區換日", () => {
    expect(todayTaipei(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  });
});
