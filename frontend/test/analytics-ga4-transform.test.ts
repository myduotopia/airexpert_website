import { describe, it, expect } from "vitest";
import {
  parseScalarMetric,
  parseTopPages,
  parseNamedRows,
} from "@/lib/analytics/ga4";

describe("parseScalarMetric（單列多指標的第 i 個）", () => {
  it("讀 rows[0].metricValues[i]，缺 → 0", () => {
    const resp = {
      rows: [{ metricValues: [{ value: "178" }, { value: "236" }] }],
    };
    expect(parseScalarMetric(resp, 0)).toBe(178);
    expect(parseScalarMetric(resp, 1)).toBe(236);
    expect(parseScalarMetric({ rows: [] }, 0)).toBe(0);
    expect(parseScalarMetric({}, 0)).toBe(0);
  });
});

describe("parseTopPages（pagePath + pageTitle + views + avgTime）", () => {
  it("轉出並帶頁名，缺 title 退回 path", () => {
    const resp = {
      rows: [
        {
          dimensionValues: [{ value: "/products/x" }, { value: "商品 X" }],
          metricValues: [{ value: "50" }, { value: "42.5" }],
        },
        {
          dimensionValues: [{ value: "/p" }, { value: "" }],
          metricValues: [{ value: "9" }, { value: "1" }],
        },
      ],
    };
    const out = parseTopPages(resp);
    expect(out[0]).toEqual({
      path: "/products/x",
      title: "商品 X",
      views: 50,
      avgTimeSec: 42.5,
    });
    expect(out[1].title).toBe("/p"); // title 空 → 退回 path
  });
});

describe("parseNamedRows（單維度 + 單指標 → label/value）", () => {
  it("組 sessionSourceMedium/deviceCategory 皆適用", () => {
    const resp = {
      rows: [
        {
          dimensionValues: [{ value: "google / organic" }],
          metricValues: [{ value: "120" }],
        },
        {
          dimensionValues: [{ value: "(direct) / (none)" }],
          metricValues: [{ value: "60" }],
        },
      ],
    };
    expect(parseNamedRows(resp)).toEqual([
      { label: "google / organic", value: 120 },
      { label: "(direct) / (none)", value: 60 },
    ]);
  });
});
