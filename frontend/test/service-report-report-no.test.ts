import { describe, it, expect } from "vitest";
import {
  formatReportNo,
  isValidReportNo,
  normalizeReportNo,
} from "@/lib/service-report/report-no";

describe("formatReportNo（X + 民國年月 + 流水號）", () => {
  it("紙本範例 X11509009", () => {
    expect(formatReportNo("2026-09-15", 9)).toBe("X11509009");
    expect(formatReportNo("2026-07-01", 10)).toBe("X11507010");
  });
  it("流水號補足 3 位；> 999 自然 4 位", () => {
    expect(formatReportNo("2026-01-31", 1)).toBe("X11501001");
    expect(formatReportNo("2026-12-01", 999)).toBe("X11512999");
    expect(formatReportNo("2026-12-01", 1000)).toBe("X115121000");
  });
  it("日期或流水號錯誤丟錯", () => {
    expect(() => formatReportNo("2026/09/15", 1)).toThrow();
    expect(() => formatReportNo("2026-09-15", 0)).toThrow();
    expect(() => formatReportNo("2026-09-15", 1.5)).toThrow();
  });
});

describe("isValidReportNo / normalizeReportNo", () => {
  it("合法：X + 5 位 + ≥ 3 位", () => {
    expect(isValidReportNo("X11509009")).toBe(true);
    expect(isValidReportNo("X115091000")).toBe(true);
  });
  it("不合法", () => {
    for (const s of [
      "",
      "X1150900",
      "11509009",
      "S11509009",
      "x11509009",
      "X11509A09",
      " X11509009",
    ]) {
      expect(isValidReportNo(s)).toBe(false);
    }
  });
  it("正規化：去空白、轉大寫、null → 空字串", () => {
    expect(normalizeReportNo("  x11509009 ")).toBe("X11509009");
    expect(normalizeReportNo(null)).toBe("");
    expect(normalizeReportNo(undefined)).toBe("");
    expect(isValidReportNo(normalizeReportNo(" x11509009"))).toBe(true);
  });
});
