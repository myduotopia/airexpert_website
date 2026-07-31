// frontend/test/analytics-ranges.test.ts
import { describe, it, expect } from "vitest";
import {
  computeRange,
  taipeiTodayYmd,
  RANGE_DAYS,
} from "@/lib/analytics/ranges";

describe("computeRange（本期／上期日期字串）", () => {
  it("7 天、延遲 1（GA4）：本期結束為昨天，兩期等長且相鄰", () => {
    const r = computeRange("2026-07-24", 7, 1);
    expect(r.current).toEqual({
      startDate: "2026-07-17",
      endDate: "2026-07-23",
    });
    expect(r.previous).toEqual({
      startDate: "2026-07-10",
      endDate: "2026-07-16",
    });
  });

  it("30 天、延遲 3（GSC）：結束日往前推 3 天", () => {
    const r = computeRange("2026-07-24", 30, 3);
    expect(r.current.endDate).toBe("2026-07-21");
    expect(r.current.startDate).toBe("2026-06-22");
    expect(r.previous.endDate).toBe("2026-06-21");
    expect(r.previous.startDate).toBe("2026-05-23");
  });

  it("跨月／跨年邊界正確（以 Date.UTC 進位）", () => {
    const r = computeRange("2026-01-02", 7, 1);
    expect(r.current).toEqual({
      startDate: "2025-12-26",
      endDate: "2026-01-01",
    });
  });
});

describe("taipeiTodayYmd（注入 now，時區 Asia/Taipei）", () => {
  it("UTC 深夜換算為台北隔日", () => {
    // 2026-07-24T16:30Z = 台北 2026-07-25 00:30
    expect(taipeiTodayYmd(new Date("2026-07-24T16:30:00Z"))).toBe("2026-07-25");
  });
});

describe("RANGE_DAYS", () => {
  it("僅允許 7 / 30 / 90", () => {
    expect(RANGE_DAYS).toEqual([7, 30, 90]);
  });
});
