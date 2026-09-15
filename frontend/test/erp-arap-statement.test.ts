import { describe, it, expect } from "vitest";

// lib/erp/statement.ts：月結對帳單純函式 + 期間 / 對象參數。
import {
  buildStatement,
  isIsoDate,
  parseStatementParty,
  previousMonthRange,
  signedDocAmount,
  statementPrintHref,
  taipeiToday,
  type StatementDocInput,
  type StatementPaymentInput,
} from "@/lib/erp/statement";

const doc = (
  id: string,
  doc_type: StatementDocInput["doc_type"],
  doc_date: string,
  total_twd: number,
  patch: Partial<StatementDocInput> = {},
): StatementDocInput => ({
  id,
  doc_type,
  doc_no: `${doc_type}-${id}`,
  doc_date,
  total_twd,
  status: "posted",
  ...patch,
});

const pay = (
  id: string,
  pay_date: string,
  amount: number,
  patch: Partial<StatementPaymentInput> = {},
): StatementPaymentInput => ({
  id,
  doc_no: `RC-${id}`,
  pay_date,
  method: "transfer",
  amount,
  status: "posted",
  ...patch,
});

describe("signedDocAmount", () => {
  it("S / I 為正、SR / PR 為負（不論輸入正負）", () => {
    expect(signedDocAmount("S", 100)).toBe(100);
    expect(signedDocAmount("I", -100)).toBe(100);
    expect(signedDocAmount("SR", 100)).toBe(-100);
    expect(signedDocAmount("PR", -100)).toBe(-100);
  });
});

describe("buildStatement", () => {
  const from = "2026-09-01";
  const to = "2026-09-30";

  it("期初 = 起日前單據 − 起日前收付款；期末 = 期初 + 本期單據 − 本期收付款", () => {
    const s = buildStatement({
      openingDocs: [
        doc("a", "S", "2026-07-10", 50000),
        doc("b", "SR", "2026-08-05", 5000),
      ],
      openingPayments: [pay("p0", "2026-08-20", 30000)],
      docs: [doc("c", "S", "2026-09-11", 20000)],
      payments: [pay("p1", "2026-09-20", 10000)],
      from,
      to,
    });
    expect(s.opening).toBe(15000);
    expect(s.documentsTotal).toBe(20000);
    expect(s.paymentsTotal).toBe(10000);
    expect(s.closing).toBe(25000);
    expect(s.rows.map((r) => r.balance)).toEqual([35000, 25000]);
  });

  it("SR / PR 為負數並減少餘額", () => {
    const s = buildStatement({
      openingDocs: [],
      openingPayments: [],
      docs: [
        doc("i", "I", "2026-09-02", 12000),
        doc("pr", "PR", "2026-09-03", 2000),
      ],
      payments: [],
      from,
      to,
      partyType: "vendor",
    });
    expect(s.rows.map((r) => r.charge)).toEqual([12000, -2000]);
    expect(s.closing).toBe(10000);
  });

  it("作廢單據與作廢收付款不列入（期初與本期皆排除）", () => {
    const s = buildStatement({
      openingDocs: [
        doc("a", "S", "2026-08-01", 9999, { status: "voided" }),
        doc("b", "S", "2026-08-02", 1000),
      ],
      openingPayments: [pay("p0", "2026-08-03", 500, { status: "voided" })],
      docs: [
        doc("c", "S", "2026-09-05", 8888, { status: "voided" }),
        doc("d", "S", "2026-09-06", 2000, { status: "draft" }),
      ],
      payments: [pay("p1", "2026-09-07", 700, { status: "voided" })],
      from,
      to,
    });
    expect(s.opening).toBe(1000);
    expect(s.rows).toHaveLength(0);
    expect(s.closing).toBe(1000);
  });

  it("跨月：落在期間外的列不列入本期；起日前的列才計入期初", () => {
    const s = buildStatement({
      openingDocs: [
        doc("a", "S", "2026-08-31", 1000),
        // 起日當天不屬於期初
        doc("x", "S", "2026-09-01", 99999),
      ],
      openingPayments: [],
      docs: [
        doc("b", "S", "2026-09-01", 2000),
        doc("c", "S", "2026-09-30", 3000),
        doc("d", "S", "2026-10-01", 4000),
        doc("e", "S", "2026-08-31", 5000),
      ],
      payments: [],
      from,
      to,
    });
    expect(s.opening).toBe(1000);
    expect(s.rows.map((r) => r.id)).toEqual(["b", "c"]);
    expect(s.closing).toBe(6000);
  });

  it("依日期排序，同日單據在收付款前；票號票期列入摘要", () => {
    const s = buildStatement({
      openingDocs: [],
      openingPayments: [],
      docs: [doc("s2", "S", "2026-09-15", 100)],
      payments: [
        pay("p2", "2026-09-15", 50, {
          method: "check",
          check_no: "AB123",
          check_due_date: "2026-10-15",
        }),
        pay("p1", "2026-09-02", 10),
      ],
      from,
      to,
    });
    expect(s.rows.map((r) => r.id)).toEqual(["p1", "s2", "p2"]);
    expect(s.rows[2].description).toContain("票號 AB123");
    expect(s.rows[2].description).toContain("民國115/10/15");
    expect(s.rows[1].description).toContain("銷貨單");
  });

  it("情境：09/02 訂金 70,000 → 09/11 S 235,000 → 票 165,000，期末 0", () => {
    const s = buildStatement({
      openingDocs: [],
      openingPayments: [],
      docs: [doc("s", "S", "2026-09-11", 235000, { doc_no: "S11509047" })],
      payments: [
        pay("dep", "2026-09-02", 70000),
        pay("chq", "2026-09-12", 165000, {
          method: "check",
          check_no: "CK001",
          check_due_date: "2026-10-12",
        }),
      ],
      from,
      to,
    });
    expect(s.rows.map((r) => [r.doc_no, r.balance])).toEqual([
      ["RC-dep", -70000],
      ["S11509047", 165000],
      ["RC-chq", 0],
    ]);
    expect(s.closing).toBe(0);
  });
});

describe("期間 / 對象參數", () => {
  it("previousMonthRange：上個月 1 日～月底（含跨年、閏年）", () => {
    expect(previousMonthRange("2026-09-15")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(previousMonthRange("2026-01-05")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(previousMonthRange("2028-03-01")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("taipeiToday 以台北時區換日", () => {
    expect(taipeiToday(new Date("2026-09-14T16:30:00Z"))).toBe("2026-09-15");
  });

  it("isIsoDate 檢查格式與天數", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026/02/01")).toBe(false);
  });

  it("parseStatementParty / statementPrintHref", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(parseStatementParty(`customer:${id}`)).toEqual({
      type: "customer",
      id,
    });
    expect(parseStatementParty(`vendor:${id}`)?.type).toBe("vendor");
    expect(parseStatementParty(`admin:${id}`)).toBeNull();
    expect(parseStatementParty("customer:not-a-uuid")).toBeNull();
    expect(
      statementPrintHref({ type: "vendor", id }, "2026-08-01", "2026-08-31"),
    ).toBe(
      `/admin/erp/print/statement?party=vendor%3A${id}&from=2026-08-01&to=2026-08-31`,
    );
  });
});
