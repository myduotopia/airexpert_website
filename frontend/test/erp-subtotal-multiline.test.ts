import { describe, it, expect, vi } from "vitest";

// #221：報價單「小計／總價款」行（顯示用、不計入合計稅額）與多行品名規格。
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => {
    throw new Error("pure tests must not touch supabase");
  }),
}));

import {
  calcDocumentTotals,
  calcLineAmount,
  computeSubtotals,
  subtotalLabel,
} from "@/lib/erp/calc";
import { newDraftLine } from "@/lib/erp/draft";
import {
  buildPrintLines,
  DOC_PRINT_ROWS,
  paginateLines,
  printLineRows,
  type PrintLine,
} from "@/lib/erp/print";
import { quoteToSaleDraft, subtotalNoteText } from "@/lib/erp/queries/sales";
import type {
  DocType,
  DraftDocument,
  ErpDocumentWithLines,
  LineType,
} from "@/lib/erp/types";
import { validateDraftDocument } from "@/lib/erp/validate";

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

function quote(
  lines: Line[],
  patch: Partial<ErpDocumentWithLines> = {},
): ErpDocumentWithLines {
  return {
    id: "Q-doc",
    doc_type: "Q",
    doc_no: "Q11510009",
    doc_date: "2026-10-01",
    status: "posted",
    customer_id: "cust-1",
    vendor_id: null,
    warehouse_id: null,
    to_warehouse_id: null,
    source_doc_id: null,
    party_name: "伍虹企業",
    party_tax_id: null,
    party_contact: null,
    party_phone: null,
    party_address: null,
    sales_rep: "謝億興",
    sales_rep_id: null,
    tax_type: "excluded",
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    amount_untaxed: 0,
    tax_amount: 0,
    total_amount: 0,
    total_twd: 0,
    invoice_no: null,
    expected_date: null,
    note: null,
    posted_at: null,
    posted_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: null,
    created_by: null,
    lines,
    ...patch,
  };
}

/** 伍虹報價：兩組品項，各接一個小計；第二組含折扣。 */
function wuhongLines(): Line[] {
  return [
    line("a", 1, "item", {
      item_id: "i1",
      description: "乾燥機\nAL-010N",
      qty: 1,
      unit_price: 320000,
      amount: 320000,
    }),
    line("b", 2, "item", {
      item_id: "i2",
      qty: 2,
      unit_price: 4000,
      amount: 8000,
    }),
    line("c", 3, "subtotal", { description: "總價款" }),
    line("d", 4, "item", {
      item_id: "i3",
      qty: 1,
      unit_price: 10000,
      amount: 10000,
    }),
    line("e", 5, "discount", { description: "優惠", amount: -1500 }),
    line("f", 6, "note", { description: "交期兩週" }),
    line("g", 7, "subtotal", { description: null }),
  ];
}

describe("computeSubtotals", () => {
  it("小計 = 上一個小計（或開頭）之後到本行前的品項＋折扣行；非小計行為 null", () => {
    expect(computeSubtotals(wuhongLines())).toEqual([
      null,
      null,
      328000,
      null,
      null,
      null,
      8500,
    ]);
  });

  it("品項金額以數量×單價計（草稿行 amount 不可信）、折扣一律負數", () => {
    const lines = [
      newDraftLine("item", { qty: 3, unit_price: 100.5, amount: 999 }),
      newDraftLine("discount", { amount: 50 }),
      newDraftLine("subtotal"),
    ];
    expect(computeSubtotals(lines)).toEqual([null, null, 251.5]);
  });

  it("連續小計：第二個小計為 0；開頭的小計為 0", () => {
    const lines = [
      newDraftLine("subtotal"),
      newDraftLine("item", { qty: 1, unit_price: 10 }),
      newDraftLine("subtotal"),
      newDraftLine("subtotal"),
    ];
    expect(computeSubtotals(lines)).toEqual([0, null, 10, 0]);
  });

  it("小計行本身的 amount 不會被加進下一個小計", () => {
    const lines = [
      newDraftLine("item", { qty: 1, unit_price: 100 }),
      newDraftLine("subtotal", { amount: 100 }),
      newDraftLine("item", { qty: 1, unit_price: 5 }),
      newDraftLine("subtotal"),
    ];
    expect(computeSubtotals(lines)).toEqual([null, 100, null, 5]);
  });

  it("subtotalLabel：空白時預設「小計」", () => {
    expect(subtotalLabel(null)).toBe("小計");
    expect(subtotalLabel("  ")).toBe("小計");
    expect(subtotalLabel(" 總價款 ")).toBe("總價款");
  });
});

describe("合計／稅額排除小計行", () => {
  it("calcLineAmount(subtotal) 一律 0（即使 amount 有值）", () => {
    expect(calcLineAmount({ line_type: "subtotal", amount: 328000 })).toBe(0);
    expect(
      calcLineAmount({ line_type: "subtotal", qty: 2, unit_price: 5 }),
    ).toBe(0);
  });

  it("加入小計行不改變合計、稅額、總計", () => {
    const base = [
      newDraftLine("item", { qty: 1, unit_price: 320000 }),
      newDraftLine("item", { qty: 2, unit_price: 4000 }),
    ];
    const withSubtotal = [
      ...base,
      // 刻意放入非 0 的 amount / qty，模擬髒資料。
      newDraftLine("subtotal", { amount: 328000, qty: 1, unit_price: 328000 }),
    ];
    const opts = {
      taxType: "excluded" as const,
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    };
    const a = calcDocumentTotals({ lines: base, ...opts });
    const b = calcDocumentTotals({ lines: withSubtotal, ...opts });
    expect(b).toEqual(a);
    expect(b.amount_untaxed).toBe(328000);
    expect(b.tax_amount).toBe(16400);
    expect(b.total_amount).toBe(344400);
  });
});

describe("草稿：新增小計行與驗證", () => {
  it("newDraftLine('subtotal')：標題預設「小計」、數量 0", () => {
    const l = newDraftLine("subtotal");
    expect(l.description).toBe("小計");
    expect(l.qty).toBe(0);
    expect(l.amount).toBe(0);
    expect(
      newDraftLine("subtotal", { description: "總價款" }).description,
    ).toBe("總價款");
  });

  function draft(docType: DocType, lines: DraftDocument["lines"]) {
    return {
      id: null,
      doc_type: docType,
      doc_date: "2026-10-01",
      customer_id: "cust-1",
      vendor_id: docType === "P" ? "v1" : null,
      warehouse_id: null,
      to_warehouse_id: null,
      source_doc_id: null,
      sales_rep: null,
      tax_type: "excluded",
      tax_rate: 0.05,
      currency: "TWD",
      exchange_rate: 1,
      invoice_no: null,
      expected_date: null,
      note: null,
      lines,
    } satisfies DraftDocument;
  }

  it("報價單可存小計行；其他單別不行", () => {
    const lines = [
      newDraftLine("item", { item_id: "i1", qty: 1, unit_price: 1 }),
      newDraftLine("subtotal"),
    ];
    expect(validateDraftDocument(draft("Q", lines))).toBeNull();
    expect(validateDraftDocument(draft("S", lines))).toMatch(/小計/);
    expect(validateDraftDocument(draft("P", lines))).toMatch(/小計/);
  });
});

describe("報價轉銷貨：小計行轉為備註，銷貨合計不變", () => {
  it("subtotalNoteText：標題＋當時金額（台幣 NT$、外幣幣別前綴）", () => {
    expect(subtotalNoteText("總價款", 328000, "TWD")).toBe("總價款 NT$328,000");
    expect(subtotalNoteText("", 12.5, "usd")).toBe("小計 USD 12.50");
  });

  it("小計 → note（保留標題與金額說明）、不帶來源行；合計與報價一致", () => {
    const q = quote(wuhongLines());
    const s = quoteToSaleDraft(q, { docDate: "2026-10-08", warehouseId: "w" });
    expect(s.lines.map((l) => l.line_type)).toEqual([
      "item",
      "item",
      "note",
      "item",
      "discount",
      "note",
      "note",
    ]);
    expect(s.lines[2]).toMatchObject({
      description: "總價款 NT$328,000",
      qty: 0,
      unit_price: 0,
      amount: 0,
      item_id: null,
      source_line_id: null,
    });
    expect(s.lines[6].description).toBe("小計 NT$8,500");
    expect(s.lines.some((l) => l.line_type === "subtotal")).toBe(false);
    // 多行品名規格原樣帶入
    expect(s.lines[0].description).toBe("乾燥機\nAL-010N");

    const opts = {
      taxType: q.tax_type,
      taxRate: 0.05,
      currency: "TWD",
      exchangeRate: 1,
    };
    const qTotals = calcDocumentTotals({ lines: q.lines, ...opts });
    const sTotals = calcDocumentTotals({ lines: s.lines, ...opts });
    expect(sTotals).toEqual(qTotals);
    expect(sTotals.amount_untaxed).toBe(336500);
    expect(validateDraftDocument(s)).toBeNull();
  });
});

describe("列印：小計行與多行品名規格", () => {
  const items = new Map([
    ["i1", { code: "LM-AL010N", name: "乾燥機", unit: "台" }],
    ["i2", { code: "NAD-0012", name: "濾心", unit: "個" }],
    ["i3", { code: "SVC", name: "安裝", unit: "式" }],
  ]);

  it("buildPrintLines：小計行顯示標題與計算金額；品名保留換行", () => {
    const out = buildPrintLines({ doc_type: "Q", lines: wuhongLines() }, items);
    expect(out[0].name).toBe("乾燥機\nAL-010N");
    expect(out[2]).toMatchObject({
      kind: "subtotal",
      name: "總價款",
      amount: 328000,
      qty: null,
      unitPrice: null,
      code: "",
    });
    expect(out[6]).toMatchObject({
      kind: "subtotal",
      name: "小計",
      amount: 8500,
    });
  });

  function printLine(patch: Partial<PrintLine>): PrintLine {
    return {
      key: "x",
      kind: "item",
      code: "",
      name: "",
      reason: "",
      qty: 1,
      unit: "",
      unitPrice: 1,
      amount: 1,
      serials: [],
      ...patch,
    };
  }

  it("printLineRows：多行品名每行至少一列（含空行）", () => {
    expect(printLineRows(printLine({ name: "A\nB\nC" }), 48)).toBe(3);
    expect(printLineRows(printLine({ name: "A\n\nC" }), 48)).toBe(3);
    expect(printLineRows(printLine({ name: "A\r\nB" }), 48)).toBe(2);
  });

  it("printLineRows：盤點調整原因多行時，取品名與原因較多者", () => {
    expect(
      printLineRows(printLine({ name: "油", reason: "盤點\n破損\n報廢" }), 48),
    ).toBe(3);
    expect(
      printLineRows(
        printLine({ name: "油", reason: "a\nb", serials: ["S1"] }),
        48,
      ),
    ).toBe(2 + 1);
  });

  it("分頁：多行品名依列數計入，不會塞爆一頁", () => {
    // 每行 5 列 → 第一頁 22 列只能放 4 行（20 列），最後一頁需保留 4 列給合計。
    const lines = Array.from({ length: 6 }, (_, i) =>
      printLine({ key: `l${i}`, name: "1\n2\n3\n4\n5" }),
    );
    const pages = paginateLines(lines, {
      ...DOC_PRINT_ROWS,
      rowsOf: (l) => printLineRows(l),
    });
    expect(pages.map((p) => p.lines.length)).toEqual([4, 2]);
    for (const p of pages) {
      const used = p.lines.reduce((s, l) => s + printLineRows(l), 0);
      expect(used).toBeLessThanOrEqual(DOC_PRINT_ROWS.firstPageRows);
    }
  });
});
