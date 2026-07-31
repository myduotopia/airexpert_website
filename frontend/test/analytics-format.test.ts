// frontend/test/analytics-format.test.ts
import { describe, it, expect } from "vitest";
import { pctChange, formatPct, prettyPagePath } from "@/lib/analytics/format";

describe("pctChange（期間變化比例）", () => {
  it("由 100 → 120 = +0.2", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
  });
  it("上期為 0、本期 > 0 → null（無法計算，UI 顯示『新增』）", () => {
    expect(pctChange(5, 0)).toBeNull();
  });
  it("兩期皆 0 → 0", () => {
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("formatPct", () => {
  it("正值加正號、一位小數", () => {
    expect(formatPct(0.123)).toBe("+12.3%");
    expect(formatPct(-0.05)).toBe("-5.0%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("prettyPagePath（路徑→中文頁名）", () => {
  it("首頁", () => {
    expect(prettyPagePath("/")).toBe("首頁");
  });
  it("已知區段轉中文並帶 slug", () => {
    expect(prettyPagePath("/products/oil-free")).toBe("商品：oil-free");
    expect(prettyPagePath("/news/2026-summer")).toBe("最新消息：2026-summer");
  });
  it("未知路徑原樣回傳（去除 query）", () => {
    expect(prettyPagePath("/whatever?utm=x")).toBe("/whatever");
  });
});
