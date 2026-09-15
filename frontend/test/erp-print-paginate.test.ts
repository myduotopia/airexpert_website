import { describe, it, expect } from "vitest";
import {
  DOC_PRINT_ROWS,
  estimateTextRows,
  paginateLines,
  printLineRows,
  textUnits,
  type PrintLine,
} from "@/lib/erp/print";

// 列印分頁（spec §7）：每頁重複表頭、頁次「1 / 2」、總計只在最後一頁。

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginateLines", () => {
  it("無明細 → 一頁空頁", () => {
    const pages = paginateLines([], { firstPageRows: 10, otherPageRows: 10 });
    expect(pages).toEqual([
      { pageNo: 1, pageCount: 1, isFirst: true, isLast: true, lines: [] },
    ]);
  });

  it("放得下 → 單頁", () => {
    const pages = paginateLines(range(5), {
      firstPageRows: 10,
      otherPageRows: 10,
      lastPageReserve: 3,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].lines).toEqual([1, 2, 3, 4, 5]);
    expect(pages[0].isLast).toBe(true);
  });

  it("超過一頁 → 分頁、頁次與 isLast 正確", () => {
    const pages = paginateLines(range(25), {
      firstPageRows: 10,
      otherPageRows: 12,
    });
    expect(pages.map((p) => p.lines.length)).toEqual([10, 12, 3]);
    expect(pages.map((p) => `${p.pageNo} / ${p.pageCount}`)).toEqual([
      "1 / 3",
      "2 / 3",
      "3 / 3",
    ]);
    expect(pages.map((p) => p.isLast)).toEqual([false, false, true]);
    expect(pages.map((p) => p.isFirst)).toEqual([true, false, false]);
  });

  it("機號子列計入列數，且一行不拆到兩頁", () => {
    // 每行列數：1、1、4（品項 + 3 機號）、1
    const rows = [1, 1, 4, 1];
    const pages = paginateLines([0, 1, 2, 3], {
      firstPageRows: 5,
      otherPageRows: 5,
      rowsOf: (i) => rows[i],
    });
    expect(pages.map((p) => p.lines)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("最後一頁放不下總計保留列 → 最後一行移到新頁，與總計同頁", () => {
    const pages = paginateLines(range(10), {
      firstPageRows: 10,
      otherPageRows: 10,
      lastPageReserve: 2,
    });
    expect(pages.map((p) => p.lines.length)).toEqual([9, 1]);
    expect(pages[1].isLast).toBe(true);
  });

  it("最後一頁只有一行且放不下總計 → 另起一頁只放總計", () => {
    const pages = paginateLines(["big"], {
      firstPageRows: 10,
      otherPageRows: 10,
      rowsOf: () => 9,
      lastPageReserve: 2,
    });
    expect(pages.map((p) => p.lines)).toEqual([["big"], []]);
    expect(pages.map((p) => p.isLast)).toEqual([false, true]);
  });

  it("單行超過整頁預算 → 獨佔一頁（不遺失資料）", () => {
    const pages = paginateLines(["a", "huge", "b"], {
      firstPageRows: 5,
      otherPageRows: 5,
      rowsOf: (s) => (s === "huge" ? 12 : 1),
    });
    expect(pages.map((p) => p.lines)).toEqual([["a"], ["huge"], ["b"]]);
  });

  it("S11509047 情境：明細 + 機號超過一頁 → 2 頁，總計只在第 2 頁", () => {
    const lines: PrintLine[] = range(18).map((i) => ({
      key: `l${i}`,
      kind: "item",
      code: `P${i}`,
      name: `品名 ${i}`,
      reason: "",
      qty: 1,
      unit: "台",
      unitPrice: 100,
      amount: 100,
      serials: i <= 3 ? [`26-PM1506001${i}`] : [],
    }));
    // 18 行 + 3 機號 = 21 列；首頁 22 列但需保留總計 4 列 → 分成 2 頁。
    const pages = paginateLines(lines, {
      ...DOC_PRINT_ROWS,
      rowsOf: (l) => printLineRows(l),
    });
    expect(pages).toHaveLength(2);
    expect(pages[0].lines).toHaveLength(17);
    expect(pages[1].lines.map((l) => l.key)).toEqual(["l18"]);
    expect(pages.filter((p) => p.isLast).map((p) => p.pageNo)).toEqual([2]);
    expect(pages.map((p) => `${p.pageNo} / ${p.pageCount}`)).toEqual([
      "1 / 2",
      "2 / 2",
    ]);
  });
});

describe("列高估算", () => {
  it("textUnits：全形 2、半形 1", () => {
    expect(textUnits("AB12")).toBe(4);
    expect(textUnits("空壓機")).toBe(6);
    expect(textUnits("PM15 空壓機（變頻）")).toBe(5 + 6 + 8);
  });

  it("estimateTextRows：依寬度換行、至少 1 列、換行字元另起一列", () => {
    expect(estimateTextRows("", 10)).toBe(1);
    expect(estimateTextRows("abcdefghij", 10)).toBe(1);
    expect(estimateTextRows("abcdefghijk", 10)).toBe(2);
    expect(estimateTextRows("空壓機空壓機", 10)).toBe(2);
    expect(estimateTextRows("a\nb", 10)).toBe(2);
  });

  it("printLineRows：品名列數 + 機號數", () => {
    const line: PrintLine = {
      key: "x",
      kind: "item",
      code: "A",
      name: "a".repeat(60),
      reason: "",
      qty: 2,
      unit: "台",
      unitPrice: 1,
      amount: 2,
      serials: ["S1", "S2"],
    };
    expect(printLineRows(line, 48)).toBe(2 + 2);
  });
});
