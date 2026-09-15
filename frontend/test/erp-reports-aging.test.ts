import { describe, it, expect } from "vitest";

// lib/erp/reports.ts：帳齡、低庫存、到期支票、CSV。
import {
  addDays,
  agingBucket,
  buildAgingReport,
  countLowStock,
  csvCell,
  currentMonthRange,
  daysBetween,
  filterChecksDue,
  paymentHref,
  percentValue,
  toCsv,
  type AgingDocInput,
  type CheckDueInput,
} from "@/lib/erp/reports";

describe("日期工具", () => {
  it("daysBetween / addDays 跨月跨年", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(addDays("2026-02-25", 7)).toBe("2026-03-04");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("currentMonthRange", () => {
    expect(currentMonthRange("2026-09-16")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(currentMonthRange("2028-02-10").to).toBe("2028-02-29");
  });
});

describe("agingBucket 邊界", () => {
  const asOf = "2026-09-30";
  const at = (age: number) => agingBucket(addDays(asOf, -age), asOf);
  it("30/31、60/61、90/91", () => {
    expect(at(0)).toBe("d0_30");
    expect(at(30)).toBe("d0_30");
    expect(at(31)).toBe("d31_60");
    expect(at(60)).toBe("d31_60");
    expect(at(61)).toBe("d61_90");
    expect(at(90)).toBe("d61_90");
    expect(at(91)).toBe("d90p");
  });
  it("未來日期歸 0–30", () => {
    expect(agingBucket("2026-10-05", asOf)).toBe("d0_30");
  });
});

describe("buildAgingReport", () => {
  const d = (
    doc_type: AgingDocInput["doc_type"],
    doc_date: string,
    outstanding: number,
    party = "c1",
  ): AgingDocInput => ({
    doc_type,
    doc_date,
    customer_id: doc_type === "S" || doc_type === "SR" ? party : null,
    vendor_id: doc_type === "I" || doc_type === "PR" ? party : null,
    outstanding,
  });

  it("應收：分區、SR 負數扣減、預收、淨額與合計", () => {
    const r = buildAgingReport(
      [
        d("S", "2026-09-20", 10000),
        d("S", "2026-08-01", 5000), // 60 天
        d("SR", "2026-09-25", -2000),
        d("S", "2026-05-01", 800, "c2"), // >90
        d("I", "2026-09-01", 99999, "v1"), // 非應收，略過
      ],
      [
        { party_id: "c1", balance: 13000, unallocated: 3000 },
        { party_id: "c3", balance: 0, unallocated: 700 },
        { party_id: "c4", balance: 0, unallocated: 0 },
      ],
      "2026-09-30",
      "customer",
    );
    const byId = Object.fromEntries(r.rows.map((x) => [x.party_id, x]));
    expect(Object.keys(byId).sort()).toEqual(["c1", "c2", "c3"]);
    expect(byId.c1).toMatchObject({
      buckets: { d0_30: 8000, d31_60: 5000, d61_90: 0, d90p: 0 },
      outstanding: 13000,
      unallocated: 3000,
      net: 10000,
    });
    expect(byId.c2.buckets.d90p).toBe(800);
    expect(byId.c3).toMatchObject({
      outstanding: 0,
      unallocated: 700,
      net: -700,
    });
    expect(r.totals).toMatchObject({
      buckets: { d0_30: 8000, d31_60: 5000, d61_90: 0, d90p: 800 },
      outstanding: 13800,
      unallocated: 3700,
      net: 10100,
    });
    expect(r.rows[0].party_id).toBe("c1");
  });

  it("應付：取 I / PR，依廠商", () => {
    const r = buildAgingReport(
      [
        d("I", "2026-07-01", 4000, "v1"), // 91 天
        d("PR", "2026-09-29", -500, "v1"),
        d("S", "2026-09-01", 1234, "c1"),
      ],
      [{ party_id: "v1", balance: 3500, unallocated: 1000 }],
      "2026-09-30",
      "vendor",
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      party_id: "v1",
      buckets: { d0_30: -500, d31_60: 0, d61_90: 0, d90p: 4000 },
      outstanding: 3500,
      unallocated: 1000,
      net: 2500,
    });
  });
});

describe("countLowStock", () => {
  it("各倉合計 < 安全存量才算；不追蹤庫存略過；無存量列視為 0", () => {
    const items = [
      { id: "a", track_stock: true, safety_stock: 5 }, // 2+2=4 <5 → low
      { id: "b", track_stock: true, safety_stock: 5 }, // 5 → 不低
      { id: "c", track_stock: true, safety_stock: 1 }, // 無列 0 <1 → low
      { id: "d", track_stock: true, safety_stock: 0 }, // 0 不低
      { id: "e", track_stock: false, safety_stock: 10 },
    ];
    const levels = [
      { item_id: "a", qty: 2 },
      { item_id: "a", qty: 2 },
      { item_id: "b", qty: 3 },
      { item_id: "b", qty: 2 },
    ];
    expect(countLowStock(items, levels)).toBe(2);
  });
});

describe("filterChecksDue", () => {
  const p = (
    id: string,
    check_due_date: string | null,
    patch: Partial<CheckDueInput> = {},
  ): CheckDueInput => ({
    id,
    direction: "in",
    method: "check",
    status: "posted",
    check_status: "pending",
    check_due_date,
    ...patch,
  });
  it("[today, today+7]、未兌現、已過帳的支票，依到期日排序", () => {
    const today = "2026-09-16";
    const rows = filterChecksDue(
      [
        p("late", "2026-09-23"),
        p("edge-out", "2026-09-24"),
        p("past", "2026-09-15"),
        p("today", "2026-09-16", { direction: "out" }),
        p("cash", "2026-09-17", { method: "transfer" }),
        p("voided", "2026-09-17", { status: "voided" }),
        p("cleared", "2026-09-17", { check_status: "cleared" }),
        p("nodate", null),
      ],
      today,
    );
    expect(rows.map((r) => r.id)).toEqual(["today", "late"]);
    expect(paymentHref(rows[0])).toBe("/admin/erp/disbursements/today");
    expect(paymentHref(rows[1])).toBe("/admin/erp/collections/late");
  });
});

describe("CSV", () => {
  it("BOM + CRLF；逗號、引號、換行跳脫", () => {
    const csv = toCsv(
      ["名稱", "金額"],
      [
        ["勁賀, 空壓", 1000],
        ['型號 "A"', -25.5],
        ["多\n行", null],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      '名稱,金額\r\n"勁賀, 空壓",1000\r\n"型號 ""A""",-25.5\r\n"多\n行",\r\n',
    );
  });
  it("公式開頭的文字前加 '；數字不受影響", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-abc")).toBe("'-abc");
    expect(csvCell(-12)).toBe("-12");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });
  it("percentValue", () => {
    expect(percentValue(0.25345)).toBe(25.3);
    expect(percentValue(-0.1)).toBe(-10);
    expect(percentValue(null)).toBeNull();
  });
});
