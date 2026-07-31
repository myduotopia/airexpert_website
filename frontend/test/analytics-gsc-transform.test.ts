import { describe, it, expect } from "vitest";
import { parseGscRows, sumGscTotals } from "@/lib/analytics/gsc";

const resp = {
  rows: [
    {
      keys: ["空壓機"],
      clicks: 2,
      impressions: 67,
      ctr: 0.0298,
      position: 20.9,
    },
    { keys: ["勁賀"], clicks: 7, impressions: 39, ctr: 0.179, position: 4.1 },
  ],
};

describe("parseGscRows（單維度）", () => {
  it("keys[0] → label，帶四指標", () => {
    const out = parseGscRows(resp, "query");
    expect(out[0]).toEqual({
      query: "空壓機",
      clicks: 2,
      impressions: 67,
      ctr: 0.0298,
      position: 20.9,
    });
  });
  it("dimension=page → 以 page 命名", () => {
    const out = parseGscRows(
      {
        rows: [
          {
            keys: ["https://a/p"],
            clicks: 1,
            impressions: 10,
            ctr: 0.1,
            position: 3,
          },
        ],
      },
      "page",
    );
    expect(out[0].page).toBe("https://a/p");
  });
  it("空回應 → []", () => {
    expect(parseGscRows({}, "query")).toEqual([]);
  });
});

describe("sumGscTotals（彙總 clicks/impressions，加權 ctr/position）", () => {
  it("clicks/impressions 相加，ctr=clicks/impr，position 以曝光加權平均", () => {
    const t = sumGscTotals(resp.rows);
    expect(t.clicks).toBe(9);
    expect(t.impressions).toBe(106);
    expect(t.ctr).toBeCloseTo(9 / 106);
    // 加權平均排名 = (20.9*67 + 4.1*39) / 106
    expect(t.position).toBeCloseTo((20.9 * 67 + 4.1 * 39) / 106);
  });
  it("空 → 全 0", () => {
    expect(sumGscTotals([])).toEqual({
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: 0,
    });
  });
});
