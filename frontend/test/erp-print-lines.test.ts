import { describe, it, expect } from "vitest";
import {
  buildPrintLines,
  formatUnitPrice,
  PRINT_DOC_TITLE,
  printDocKind,
  rocShort,
  watermarkText,
  type PrintItemInfo,
} from "@/lib/erp/print";
import {
  DOC_TYPES,
  type DocType,
  type ErpDocumentWithLines,
} from "@/lib/erp/types";

type Line = ErpDocumentWithLines["lines"][number];

function line(overrides: Partial<Line>): Line {
  return {
    id: "line",
    document_id: "doc",
    line_no: 1,
    line_type: "item",
    item_id: null,
    description: null,
    qty: 0,
    unit_price: 0,
    amount: 0,
    unit_cost: null,
    source_line_id: null,
    serial_nos: null,
    serials: [],
    ...overrides,
  };
}

const items = new Map<string, PrintItemInfo>([
  ["i1", { code: "AB-37", name: "漢鐘空壓機 37kW", unit: "台" }],
  ["i2", { code: "F-01", name: "油過濾器", unit: "個" }],
]);

describe("buildPrintLines", () => {
  it("銷貨單：品項 / 機號 / 折扣 / 備註", () => {
    const lines = buildPrintLines(
      {
        doc_type: "S",
        lines: [
          line({
            id: "a",
            item_id: "i1",
            description: "PM37 變頻",
            qty: 1,
            unit_price: 224070,
            amount: 224070,
            serials: [{ id: "s1", serial_no: "26-PM15060010", status: "sold" }],
          }),
          line({
            id: "b",
            item_id: "i2",
            qty: 2,
            unit_price: 350,
            amount: 700,
          }),
          line({ id: "c", line_type: "discount", amount: -770 }),
          line({
            id: "d",
            line_type: "note",
            description: "備庫 / 預轉華淨科技",
          }),
        ],
      },
      items,
    );
    expect(lines[0]).toMatchObject({
      kind: "item",
      code: "AB-37",
      name: "PM37 變頻",
      qty: 1,
      unit: "台",
      unitPrice: 224070,
      amount: 224070,
      serials: ["26-PM15060010"],
    });
    // description 空 → 品項名稱
    expect(lines[1]).toMatchObject({ name: "油過濾器", serials: [] });
    expect(lines[2]).toMatchObject({
      kind: "discount",
      name: "折扣",
      amount: -770,
      qty: null,
    });
    expect(lines[3]).toMatchObject({
      kind: "note",
      name: "備庫 / 預轉華淨科技",
      amount: null,
    });
  });

  it("進貨單草稿：新機號取自 serial_nos（去空白）", () => {
    const [l] = buildPrintLines(
      {
        doc_type: "I",
        lines: [line({ item_id: "i1", serial_nos: [" SN-1 ", "", "SN-2"] })],
      },
      items,
    );
    expect(l.serials).toEqual(["SN-1", "SN-2"]);
  });

  it("盤點調整單：品名為品項名稱，description 為調整原因", () => {
    const [l] = buildPrintLines(
      {
        doc_type: "A",
        lines: [line({ item_id: "i2", qty: -1, description: "盤虧：破損" })],
      },
      items,
    );
    expect(l).toMatchObject({
      name: "油過濾器",
      reason: "盤虧：破損",
      qty: -1,
    });
  });

  it("找不到品項 → 空編號，不丟錯", () => {
    const [l] = buildPrintLines(
      {
        doc_type: "T",
        lines: [line({ item_id: "missing", description: "X" })],
      },
      items,
    );
    expect(l).toMatchObject({ code: "", name: "X", unit: "" });
  });
});

describe("列印輔助", () => {
  it("每個單別都有列印標題與分類", () => {
    for (const t of DOC_TYPES) expect(PRINT_DOC_TITLE[t]).toBeTruthy();
    expect(PRINT_DOC_TITLE.S).toBe("客戶銷貨單");
    expect(PRINT_DOC_TITLE.P).toBe("廠商採購單");
    const kinds = Object.fromEntries(
      DOC_TYPES.map((t: DocType) => [t, printDocKind(t)]),
    );
    expect(kinds).toEqual({
      Q: "customer",
      P: "vendor",
      I: "vendor",
      PR: "vendor",
      S: "customer",
      SR: "customer",
      T: "stock",
      A: "stock",
    });
  });

  it("浮水印：草稿 / 作廢；已過帳無", () => {
    expect(watermarkText("draft")).toBe("草稿");
    expect(watermarkText("voided")).toBe("作廢");
    expect(watermarkText("posted")).toBeNull();
  });

  it("rocShort", () => {
    expect(rocShort("2026-09-15")).toBe("115/09/15");
    expect(rocShort(null)).toBe("");
    expect(rocShort("bad")).toBe("");
  });

  it("formatUnitPrice：台幣整數不帶小數、外幣 2 位", () => {
    expect(formatUnitPrice(224070, "TWD")).toBe("224,070");
    expect(formatUnitPrice(12.5, "TWD")).toBe("12.50");
    expect(formatUnitPrice(1200, "USD")).toBe("1,200.00");
  });
});
