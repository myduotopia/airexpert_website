// frontend/test/analytics-insights.test.ts
import { describe, it, expect } from "vitest";
import {
  findOpportunities,
  slugFromLandingUrl,
  MIN_IMPRESSIONS,
  MAX_CTR,
} from "@/lib/analytics/insights";
import type { GscPageRow } from "@/lib/analytics/types";

const row = (over: Partial<GscPageRow>): GscPageRow => ({
  page: "https://airexpert.com.tw/products/x",
  clicks: 1,
  impressions: 200,
  ctr: 0.005,
  position: 22,
  ...over,
});

describe("門檻常數", () => {
  it("曝光 > 100、CTR < 1%", () => {
    expect(MIN_IMPRESSIONS).toBe(100);
    expect(MAX_CTR).toBe(0.01);
  });
});

describe("findOpportunities", () => {
  it("挑出曝光>100 且 CTR<1%，依曝光遞減", () => {
    const out = findOpportunities([
      row({ page: "https://a/products/low", impressions: 300, ctr: 0.004 }),
      row({ page: "https://a/products/hi-ctr", impressions: 300, ctr: 0.05 }), // CTR 太高，排除
      row({ page: "https://a/products/low-imp", impressions: 80, ctr: 0.001 }), // 曝光不足，排除
      row({ page: "https://a/products/mid", impressions: 150, ctr: 0.009 }),
    ]);
    expect(out.map((o) => o.impressions)).toEqual([300, 150]);
  });

  it("邊界值不納入（曝光=100 或 CTR=0.01 皆排除）", () => {
    const out = findOpportunities([
      row({ impressions: 100, ctr: 0.004 }),
      row({ impressions: 500, ctr: 0.01 }),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("slugFromLandingUrl", () => {
  it("取最後一段路徑為 slug", () => {
    expect(
      slugFromLandingUrl("https://airexpert.com.tw/products/oil-free"),
    ).toBe("oil-free");
  });
  it("首頁 / 無 slug → 空字串", () => {
    expect(slugFromLandingUrl("https://airexpert.com.tw/")).toBe("");
  });
  it("壞字串不丟錯 → 空字串", () => {
    expect(slugFromLandingUrl("not a url")).toBe("");
  });
});
