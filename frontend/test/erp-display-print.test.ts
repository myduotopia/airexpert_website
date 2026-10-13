import { describe, it, expect } from "vitest";
// #241：ERP 顯示與列印小修（A-3、A-5、A-7、A-8、B-09）的純邏輯。
// A-2（報價小計行轉銷貨備註文字）見 erp-subtotal-multiline.test.ts。
import { canAllocateMore } from "@/app/admin/(protected)/erp/collections/_components/allocation";
import { calcDocumentTotals } from "@/lib/erp/calc";
import { docStatusLabel, totalsSummaryRows } from "@/lib/erp/display";
import {
  COMPANY_INFO,
  companyContactLine,
  needsSaleBalance,
  salePaymentRows,
} from "@/lib/erp/print";
import { DOC_TYPES, type DocType } from "@/lib/erp/types";

describe("A-5 單據狀態文字：報價單已過帳顯示「已確認」", () => {
  it("報價單 Q：posted → 已確認；草稿 / 作廢不變", () => {
    expect(docStatusLabel("posted", "Q")).toBe("已確認");
    expect(docStatusLabel("draft", "Q")).toBe("草稿");
    expect(docStatusLabel("voided", "Q")).toBe("已作廢");
  });

  it.each(DOC_TYPES.filter((t) => t !== "Q"))(
    "其他單別 %s：posted → 已過帳",
    (t: DocType) => {
      expect(docStatusLabel("posted", t)).toBe("已過帳");
      expect(docStatusLabel("draft", t)).toBe("草稿");
      expect(docStatusLabel("voided", t)).toBe("已作廢");
    },
  );

  it("未指定單別：維持已過帳", () => {
    expect(docStatusLabel("posted")).toBe("已過帳");
    expect(docStatusLabel("posted", null)).toBe("已過帳");
  });
});

describe("A-3 列印表頭聯絡資訊：傳真與 LINE@ 之間有分隔", () => {
  it("服務專線、傳真、LINE@ 三段以全形空白分隔", () => {
    expect(companyContactLine()).toBe(
      `服務專線 ${COMPANY_INFO.phone}　傳真 ${COMPANY_INFO.fax}　${COMPANY_INFO.line}`,
    );
    expect(companyContactLine()).not.toContain(
      `${COMPANY_INFO.fax}${COMPANY_INFO.line}`,
    );
  });
});

describe("A-7 銷貨單詳情頁已收款／未收餘額（與列印同一來源）", () => {
  it("只有已過帳銷貨單需要讀沖銷餘額", () => {
    expect(needsSaleBalance({ doc_type: "S", status: "posted" })).toBe(true);
    expect(needsSaleBalance({ doc_type: "S", status: "draft" })).toBe(false);
    expect(needsSaleBalance({ doc_type: "S", status: "voided" })).toBe(false);
    expect(needsSaleBalance({ doc_type: "Q", status: "posted" })).toBe(false);
    expect(needsSaleBalance({ doc_type: "SR", status: "posted" })).toBe(false);
  });

  it("詳情頁與列印共用 salePaymentRows：作廢後不顯示", () => {
    const balance = { allocated: 75000, outstanding: 175950 };
    expect(
      salePaymentRows(
        { doc_type: "S", status: "posted", currency: "TWD" },
        balance,
      ),
    ).toEqual([
      { label: "已收款", amount: 75000 },
      { label: "未收餘額", amount: 175950 },
    ]);
    expect(
      salePaymentRows(
        { doc_type: "S", status: "voided", currency: "TWD" },
        balance,
      ),
    ).toBeNull();
  });
});

describe("A-8 收付款詳情頁：預收／預付為 0 時不顯示補沖銷", () => {
  it("已過帳且未沖銷餘額 > 0 才顯示", () => {
    expect(canAllocateMore({ status: "posted", unallocated: 5000 })).toBe(true);
    expect(canAllocateMore({ status: "posted", unallocated: 0.01 })).toBe(true);
  });

  it("餘額為 0（含浮點殘差）、負數或已作廢 → 不顯示", () => {
    expect(canAllocateMore({ status: "posted", unallocated: 0 })).toBe(false);
    expect(canAllocateMore({ status: "posted", unallocated: 0.001 })).toBe(
      false,
    );
    expect(canAllocateMore({ status: "posted", unallocated: -10 })).toBe(false);
    expect(canAllocateMore({ status: "voided", unallocated: 5000 })).toBe(
      false,
    );
  });
});

describe("B-09 編輯頁合計區：標籤與數字一致", () => {
  const lines = [
    {
      line_type: "item" as const,
      item_id: "i1",
      qty: 1,
      unit_price: 12000,
      amount: 12000,
    },
  ];

  function rows(
    taxType: "excluded" | "included" | "exempt",
    currency = "TWD",
    exchangeRate = 1,
  ) {
    const totals = calcDocumentTotals({
      lines,
      taxType,
      taxRate: 0.05,
      currency,
      exchangeRate,
    });
    return totalsSummaryRows(totals, { taxType, taxRate: 0.05, currency });
  }

  it("內含稅：合計（未稅）11,429、稅額（內含 5%）571、總計 12,000", () => {
    expect(rows("included")).toEqual([
      { key: "untaxed", label: "合計（未稅）", amount: 11429, currency: "TWD" },
      { key: "tax", label: "稅額（內含 5%）", amount: 571, currency: "TWD" },
      {
        key: "total",
        label: "總計",
        amount: 12000,
        currency: "TWD",
        strong: true,
      },
    ]);
  });

  it("外加稅：合計（未稅）12,000、稅額（外加 5%）600、總計 12,600", () => {
    expect(rows("excluded").map((r) => [r.label, r.amount])).toEqual([
      ["合計（未稅）", 12000],
      ["稅額（外加 5%）", 600],
      ["總計", 12600],
    ]);
  });

  it("免稅：稅額標示免稅、為 0", () => {
    expect(rows("exempt").map((r) => [r.label, r.amount])).toEqual([
      ["合計（未稅）", 12000],
      ["稅額（免稅）", 0],
      ["總計", 12000],
    ]);
  });

  it("外幣：總計帶幣別、另列折合台幣", () => {
    const out = rows("included", "USD", 30);
    expect(out.map((r) => r.key)).toEqual(["untaxed", "tax", "total", "twd"]);
    expect(out[2]).toMatchObject({ currency: "USD", showCurrency: true });
    expect(out[3]).toEqual({
      key: "twd",
      label: "折合台幣",
      amount: 360000,
      currency: "TWD",
    });
  });
});
