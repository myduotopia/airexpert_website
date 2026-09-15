import { describe, it, expect } from "vitest";
import {
  calcDocumentTotals,
  calcLineAmount,
  currencyDecimals,
  roundHalfAwayFromZero,
} from "@/lib/erp/calc";

// 單據稅額試算（spec §5.1）。須與 SQL 過帳重算一致。

const item = (qty: number, unit_price: number) => ({
  line_type: "item" as const,
  qty,
  unit_price,
});
const discount = (amount: number) => ({
  line_type: "discount" as const,
  amount,
});
const note = { line_type: "note" as const, qty: 5, unit_price: 99 };

describe("roundHalfAwayFromZero（同 Postgres round）", () => {
  it("四捨五入遠離 0，且不受浮點誤差影響", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(1.005, 2)).toBe(1.01);
    expect(roundHalfAwayFromZero(223809.5238)).toBe(223810);
    expect(Object.is(roundHalfAwayFromZero(-0.2), 0)).toBe(true);
  });

  it("TWD 取整數、外幣 2 位", () => {
    expect(currencyDecimals("TWD")).toBe(0);
    expect(currencyDecimals("twd")).toBe(0);
    expect(currencyDecimals("USD")).toBe(2);
  });
});

describe("calcLineAmount", () => {
  it("item = round(qty × unit_price, 2)", () => {
    expect(calcLineAmount(item(3, 12.345))).toBe(37.04);
    expect(calcLineAmount(item(2, 97500))).toBe(195000);
  });
  it("discount 一律為負數（輸入正負皆可）", () => {
    expect(calcLineAmount(discount(38000))).toBe(-38000);
    expect(calcLineAmount(discount(-38000))).toBe(-38000);
  });
  it("note 恆為 0", () => {
    expect(calcLineAmount(note)).toBe(0);
  });
});

describe("calcDocumentTotals", () => {
  const base = { taxRate: 0.05, currency: "TWD", exchangeRate: 1 };

  it("外加 5%：213,400 → 稅 10,670、總計 224,070", () => {
    const t = calcDocumentTotals({
      ...base,
      taxType: "excluded",
      lines: [item(1, 200000), item(2, 6700)],
    });
    expect(t).toEqual({
      subtotal: 213400,
      amount_untaxed: 213400,
      tax_amount: 10670,
      total_amount: 224070,
      total_twd: 224070,
    });
  });

  it("內含 5%（S11509047）：含折扣行合計 235,000 → 未稅 223,810、稅 11,190", () => {
    const t = calcDocumentTotals({
      ...base,
      taxType: "included",
      lines: [
        item(1, 195000),
        item(1, 50000),
        item(1, 20000),
        item(1, 8000),
        discount(38000),
        note,
      ],
    });
    expect(t.subtotal).toBe(235000);
    expect(t.total_amount).toBe(235000);
    expect(t.amount_untaxed).toBe(223810);
    expect(t.tax_amount).toBe(11190);
    expect(t.total_twd).toBe(235000);
  });

  it("免稅：稅 0、總計 = 未稅 = 合計", () => {
    const t = calcDocumentTotals({
      ...base,
      taxType: "exempt",
      lines: [item(1, 235000)],
    });
    expect(t.amount_untaxed).toBe(235000);
    expect(t.tax_amount).toBe(0);
    expect(t.total_amount).toBe(235000);
  });

  it("TWD 稅額四捨五入到整數（1,010 × 5% = 50.5 → 51）", () => {
    const t = calcDocumentTotals({
      ...base,
      taxType: "excluded",
      lines: [item(1, 1010)],
    });
    expect(t.tax_amount).toBe(51);
    expect(t.total_amount).toBe(1061);
  });

  it("折扣行抵減合計後再計稅", () => {
    const t = calcDocumentTotals({
      ...base,
      taxType: "excluded",
      lines: [item(2, 1000), discount(-500)],
    });
    expect(t.amount_untaxed).toBe(1500);
    expect(t.tax_amount).toBe(75);
    expect(t.total_amount).toBe(1575);
  });

  it("外幣 USD：稅額取 2 位，total_twd = round(total × 匯率, 0)", () => {
    const t = calcDocumentTotals({
      taxType: "excluded",
      taxRate: 0.05,
      currency: "USD",
      exchangeRate: 30.123,
      lines: [item(1, 10.25)],
    });
    expect(t.tax_amount).toBe(0.51);
    expect(t.total_amount).toBe(10.76);
    expect(t.total_twd).toBe(324);
  });

  it("外幣內含：未稅取 2 位", () => {
    const t = calcDocumentTotals({
      taxType: "included",
      taxRate: 0.05,
      currency: "USD",
      exchangeRate: 31.5,
      lines: [item(1, 1000)],
    });
    expect(t.amount_untaxed).toBe(952.38);
    expect(t.tax_amount).toBe(47.62);
    expect(t.total_twd).toBe(31500);
  });

  it("無明細 → 全為 0", () => {
    const t = calcDocumentTotals({ ...base, taxType: "excluded", lines: [] });
    expect(t.total_amount).toBe(0);
    expect(t.total_twd).toBe(0);
  });
});
