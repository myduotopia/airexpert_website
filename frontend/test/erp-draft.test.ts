import { describe, it, expect } from "vitest";
import {
  draftDocumentFromRow,
  linesMissingItem,
  newDraftDocument,
  newDraftLine,
  parseSerialLines,
  salesRepFromCustomer,
} from "@/lib/erp/draft";
import { quoteToSaleDraft, saleToReturnDraft } from "@/lib/erp/queries/sales";
import { formatMoney, formatQty } from "@/lib/erp/format";
import { validateDraftDocument } from "@/lib/erp/validate";
import type { ErpDocumentWithLines } from "@/lib/erp/types";

// 草稿建構 / 驗證 / 顯示格式等純函式。

describe("newDraftDocument / newDraftLine", () => {
  it("T / A 預設免稅，其餘外加 5%、TWD", () => {
    expect(newDraftDocument("S", "2026-09-15").tax_type).toBe("excluded");
    expect(newDraftDocument("T", "2026-09-15").tax_type).toBe("exempt");
    expect(newDraftDocument("A", "2026-09-15").tax_type).toBe("exempt");
    const d = newDraftDocument("P", "2026-09-15");
    expect(d.tax_rate).toBe(0.05);
    expect(d.currency).toBe("TWD");
    expect(d.exchange_rate).toBe(1);
  });

  it("每行有唯一 key；item 預設數量 1", () => {
    const a = newDraftLine();
    const b = newDraftLine("discount");
    expect(a.key).not.toBe(b.key);
    expect(a.qty).toBe(1);
    expect(b.qty).toBe(0);
  });
});

describe("draftDocumentFromRow", () => {
  it("依 line_no 排序並帶出已選機號 id", () => {
    const row = {
      ...newDraftDocument("S", "2026-09-15"),
      id: "doc-1",
      doc_no: null,
      status: "draft",
      lines: [
        {
          id: "l2",
          line_no: 2,
          line_type: "note",
          item_id: null,
          description: "備庫",
          qty: 0,
          unit_price: 0,
          amount: 0,
          serial_nos: null,
          source_line_id: null,
          serials: [],
        },
        {
          id: "l1",
          line_no: 1,
          line_type: "item",
          item_id: "item-1",
          description: "ALH-15AI",
          qty: 1,
          unit_price: 195000,
          amount: 195000,
          serial_nos: null,
          source_line_id: null,
          serials: [{ id: "ser-1", serial_no: "26-PM1", status: "in_stock" }],
        },
      ],
    } as unknown as ErpDocumentWithLines;
    const d = draftDocumentFromRow(row);
    expect(d.id).toBe("doc-1");
    expect(d.lines.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(d.lines[0].serial_ids).toEqual(["ser-1"]);
    expect(d.lines[1].serial_nos).toEqual([]);
  });
});

describe("parseSerialLines", () => {
  it("每行一個，去空白 / 空行 / 重複（不分大小寫）", () => {
    expect(parseSerialLines(" 26-A1 \n\n26-a1\r\n26-A2\n")).toEqual([
      "26-A1",
      "26-A2",
    ]);
  });
});

describe("validateDraftDocument", () => {
  const ok = () => ({
    ...newDraftDocument("S", "2026-09-15"),
    customer_id: "c1",
    lines: [newDraftLine("item", { item_id: "i1", unit_price: 100 })],
  });

  it("合法草稿回 null", () => {
    expect(validateDraftDocument(ok())).toBeNull();
  });
  it("客戶單據缺客戶、廠商單據缺廠商", () => {
    expect(validateDraftDocument({ ...ok(), customer_id: null })).toBe(
      "請選擇客戶。",
    );
    expect(
      validateDraftDocument({ ...ok(), doc_type: "I", vendor_id: null }),
    ).toBe("請選擇廠商。");
  });
  it("調撥單來源倉 / 目的倉必填且不同", () => {
    const t = { ...newDraftDocument("T", "2026-09-15"), lines: [] };
    expect(validateDraftDocument(t)).toContain("來源倉與目的倉");
    expect(
      validateDraftDocument({
        ...t,
        warehouse_id: "w1",
        to_warehouse_id: "w1",
      }),
    ).toContain("不可相同");
  });
  it("日期、稅率、匯率", () => {
    expect(validateDraftDocument({ ...ok(), doc_date: "" })).toBe(
      "請填寫單據日期。",
    );
    expect(validateDraftDocument({ ...ok(), tax_rate: 5 })).toContain("稅率");
    expect(validateDraftDocument({ ...ok(), exchange_rate: 0 })).toContain(
      "匯率",
    );
  });
  it("報價 / 銷貨的 item 行可只填品名規格；其他單別仍需品項", () => {
    const freeText = [newDraftLine("item", { description: "LS-20 機型保養" })];
    expect(
      validateDraftDocument({ ...ok(), doc_type: "Q", lines: freeText }),
    ).toBeNull();
    expect(validateDraftDocument({ ...ok(), lines: freeText })).toBeNull();
    expect(
      validateDraftDocument({
        ...ok(),
        doc_type: "Q",
        lines: [newDraftLine("item", { item_text: "LS-20" })],
      }),
    ).toBeNull();
    expect(
      validateDraftDocument({
        ...ok(),
        doc_type: "P",
        customer_id: null,
        vendor_id: "v1",
        lines: freeText,
      }),
    ).toBe("第 1 行請選擇品項。");
  });
  it("item 行需品項或品名規格；同單機號不可重複", () => {
    expect(
      validateDraftDocument({ ...ok(), lines: [newDraftLine("item")] }),
    ).toBe("第 1 行請選擇品項或填寫品名規格。");
    expect(
      validateDraftDocument({
        ...ok(),
        lines: [
          newDraftLine("item", { item_id: "i1", serial_ids: ["s1"] }),
          newDraftLine("item", { item_id: "i1", serial_ids: ["s1"] }),
        ],
      }),
    ).toBe("第 2 行機號重複選取。");
    expect(
      validateDraftDocument({
        ...ok(),
        doc_type: "I",
        vendor_id: "v1",
        lines: [
          newDraftLine("item", { item_id: "i1", serial_nos: ["A1", "a1"] }),
        ],
      }),
    ).toContain("重複");
  });
});

describe("formatMoney / formatQty", () => {
  it("千分位，TWD 0 位、外幣 2 位", () => {
    expect(formatMoney(224070)).toBe("224,070");
    expect(formatMoney(-38000)).toBe("-38,000");
    expect(formatMoney(1234.5, { currency: "USD" })).toBe("1,234.50");
    expect(formatMoney(12.345, { decimals: 2 })).toBe("12.35");
    expect(formatMoney(null)).toBe("—");
  });
  it("數量去多餘 0", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(1.5)).toBe("1.5");
    expect(formatQty(1234.125)).toBe("1,234.125");
  });
});

describe("linesMissingItem（#222 報價自由輸入轉銷貨草稿的待選品項行）", () => {
  it("回傳未指定品項、但已有內容的品項行行號（1 起算）", () => {
    const lines = [
      newDraftLine("item", { item_id: "i1", description: "已選" }),
      newDraftLine("item", { description: "AB-37 空壓機" }),
      newDraftLine("note", { description: "備註不算" }),
      newDraftLine("item", { item_text: "LS-20" }),
      newDraftLine("item"), // 全空的新行不提示
      newDraftLine("discount", { amount: -100 }),
    ];
    expect(linesMissingItem(lines)).toEqual([2, 4]);
  });
});

describe("業務（員工主檔，#223）", () => {
  const REP = "11111111-1111-4111-8111-111111111111";

  it("新草稿業務兩欄皆空；從 DB 列帶出 sales_rep_id", () => {
    const d = newDraftDocument("Q", "2026-10-08");
    expect(d.sales_rep).toBeNull();
    expect(d.sales_rep_id).toBeNull();
    const row = {
      ...d,
      id: "doc-1",
      doc_no: null,
      status: "draft",
      sales_rep: "王小明",
      sales_rep_id: REP,
      lines: [],
    } as unknown as ErpDocumentWithLines;
    expect(draftDocumentFromRow(row)).toMatchObject({
      sales_rep: "王小明",
      sales_rep_id: REP,
    });
  });

  it("選客戶：單據未填業務 → 帶客戶預設業務（姓名 + id）", () => {
    expect(
      salesRepFromCustomer(
        { sales_rep: null, sales_rep_id: null },
        { sales_rep: "王小明", sales_rep_id: REP },
      ),
    ).toEqual({ sales_rep: "王小明", sales_rep_id: REP });
  });

  it("選客戶：單據已填業務（含舊資料文字）→ 不動", () => {
    expect(
      salesRepFromCustomer(
        { sales_rep: "舊業務", sales_rep_id: null },
        { sales_rep: "王小明", sales_rep_id: REP },
      ),
    ).toEqual({});
  });

  it("選客戶：客戶沒有預設業務 → 清空（不留孤立 id）", () => {
    expect(
      salesRepFromCustomer(
        { sales_rep: "  ", sales_rep_id: REP },
        { sales_rep: null, sales_rep_id: null },
      ),
    ).toEqual({ sales_rep: null, sales_rep_id: null });
    expect(
      salesRepFromCustomer({ sales_rep: null, sales_rep_id: null }, null),
    ).toEqual({ sales_rep: null, sales_rep_id: null });
  });

  it("報價轉銷貨、銷貨轉銷退：業務姓名與 id 一起帶過去", () => {
    const quote = {
      ...newDraftDocument("Q", "2026-10-08"),
      id: "q1",
      doc_no: "QT1",
      status: "posted",
      customer_id: "c1",
      sales_rep: "王小明",
      sales_rep_id: REP,
      lines: [],
    } as unknown as ErpDocumentWithLines;
    expect(
      quoteToSaleDraft(quote, { docDate: "2026-10-08", warehouseId: null }),
    ).toMatchObject({ sales_rep: "王小明", sales_rep_id: REP });
    const sale = { ...quote, doc_type: "S", id: "s1" } as ErpDocumentWithLines;
    expect(
      saleToReturnDraft(sale, { docDate: "2026-10-08", returnedQtyByLine: {} }),
    ).toMatchObject({ sales_rep: "王小明", sales_rep_id: REP });
  });
});
