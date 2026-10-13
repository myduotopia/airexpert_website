import { describe, it, expect } from "vitest";
import {
  ADJUST_NAME_UNITS_PER_ROW,
  DOC_PRINT_COL_MM,
  DOC_PRINT_ROWS,
  docPrintColumns,
  estimateTextRows,
  NAME_UNITS_PER_ROW,
  paginateLines,
  PRINT_TABLE_WIDTH_MM,
  printLineRows,
  printNameUnitsPerRow,
  CODE_UNITS_PER_ROW,
  REASON_UNITS_PER_ROW,
  textUnits,
  type PrintLine,
} from "@/lib/erp/print";
import { DOC_TYPES } from "@/lib/erp/types";

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

  it("printLineRows：產品編號過長（自由輸入文字）折行時以較多列數計", () => {
    const base: PrintLine = {
      key: "x",
      kind: "item",
      code: "",
      name: "乾燥機",
      reason: "",
      qty: 1,
      unit: "",
      unitPrice: 1,
      amount: 1,
      serials: [],
    };
    // 產品編號欄約 14 個半形字一列（#248 N-7：36mm，Inter 10pt 實測 14 字代碼不折行）
    expect(CODE_UNITS_PER_ROW).toBe(14);
    expect(printLineRows({ ...base, code: "LM-AL010N" })).toBe(1);
    expect(printLineRows({ ...base, code: "TOK-0360-01" })).toBe(1);
    expect(printLineRows({ ...base, code: "NAD-0402-CKD" })).toBe(1);
    expect(printLineRows({ ...base, code: "AM3-A-42012-04" })).toBe(1);
    expect(printLineRows({ ...base, code: "C65N22B24Y4399" })).toBe(1);
    expect(printLineRows({ ...base, code: "AM3-A-42012-04X" })).toBe(2);
    expect(printLineRows({ ...base, code: "冷凍式乾燥機含" })).toBe(1);
    expect(printLineRows({ ...base, code: "冷凍式乾燥機含安裝工程" })).toBe(2);
    expect(
      printLineRows({
        ...base,
        code: "冷凍式乾燥機含安裝工程",
        serials: ["S1"],
      }),
    ).toBe(3);
  });
});

// #248 N-7：產品編號欄由 28mm 加寬到 36mm（A4 直式），12–14 字代碼同一行顯示；品名欄取剩餘寬度，
// 列數估算常數須與欄寬一致（10pt 中文字寬 ≈ 3.528mm＝2 單位，儲存格內距＋框線約 3.6mm）。
describe("明細欄寬（DOC_PRINT_COL_MM / docPrintColumns）", () => {
  const CJK_MM = (10 * 25.4) / 72; // 10pt
  const CELL_MM = 3.6; // 左右內距 1.5mm×2＋框線（實測 A 單品名欄 20 字即折行）
  /** 欄寬 mm 可容納的寬度單位（半個中文字）。 */
  const fits = (units: number, mm: number) =>
    (units / 2) * CJK_MM + CELL_MM <= mm;

  it("產品編號欄 36mm，所有單別相同", () => {
    expect(DOC_PRINT_COL_MM.code).toBe(36);
    for (const t of DOC_TYPES) expect(docPrintColumns(t).code).toBe(36);
  });

  it("各單別欄寬合計 = A4 直式可用寬度 186mm", () => {
    expect(PRINT_TABLE_WIDTH_MM).toBe(186);
    for (const t of DOC_TYPES) {
      const c = docPrintColumns(t);
      expect(
        c.code +
          c.name +
          c.qty +
          (c.unitPrice ?? 0) +
          (c.amount ?? 0) +
          (c.reason ?? 0),
      ).toBe(186);
    }
  });

  it("有金額的單別（報價、銷貨、銷退、採購、進貨、進退）：數量 20、單價 22、金額 26、品名 82", () => {
    for (const t of ["Q", "S", "SR", "P", "I", "PR"] as const) {
      expect(docPrintColumns(t)).toEqual({
        code: 36,
        name: 82,
        qty: 20,
        unitPrice: 22,
        amount: 26,
        reason: null,
      });
    }
  });

  it("調撥：數量 24、無金額；盤點調整另有調整原因 52", () => {
    expect(docPrintColumns("T")).toEqual({
      code: 36,
      name: 126,
      qty: 24,
      unitPrice: null,
      amount: null,
      reason: null,
    });
    expect(docPrintColumns("A")).toEqual({
      code: 36,
      name: 74,
      qty: 24,
      unitPrice: null,
      amount: null,
      reason: 52,
    });
  });

  it("品名列數估算：有金額單別 44 單位（22 個中文字）、盤點調整 38 單位（19 個中文字）", () => {
    expect(NAME_UNITS_PER_ROW).toBe(44);
    expect(ADJUST_NAME_UNITS_PER_ROW).toBe(38);
    for (const t of DOC_TYPES) {
      expect(printNameUnitsPerRow(t)).toBe(
        t === "A" ? ADJUST_NAME_UNITS_PER_ROW : NAME_UNITS_PER_ROW,
      );
    }
  });

  it("估算常數不超過實際欄寬（估算偏保守，不會少算列數）", () => {
    for (const t of DOC_TYPES) {
      const c = docPrintColumns(t);
      expect(fits(printNameUnitsPerRow(t), c.name)).toBe(true);
      if (c.reason) expect(fits(REASON_UNITS_PER_ROW, c.reason)).toBe(true);
    }
    // 估算也不過度保守：多 2 單位（1 個中文字）就超出有金額單別的品名欄
    expect(fits(NAME_UNITS_PER_ROW + 2, docPrintColumns("S").name)).toBe(false);
    expect(fits(ADJUST_NAME_UNITS_PER_ROW + 2, docPrintColumns("A").name)).toBe(
      false,
    );
  });

  it("品名 23 個中文字在有金額單別估 2 列、22 個估 1 列", () => {
    const line: PrintLine = {
      key: "x",
      kind: "item",
      code: "NAD-0402-CKD",
      name: "空".repeat(22),
      reason: "",
      qty: 1,
      unit: "台",
      unitPrice: 1,
      amount: 1,
      serials: [],
    };
    expect(printLineRows(line, printNameUnitsPerRow("I"))).toBe(1);
    expect(
      printLineRows(
        { ...line, name: "空".repeat(23) },
        printNameUnitsPerRow("I"),
      ),
    ).toBe(2);
    expect(
      printLineRows(
        { ...line, name: "空".repeat(20) },
        printNameUnitsPerRow("A"),
      ),
    ).toBe(2);
  });
});
