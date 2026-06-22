import { describe, it, expect } from "vitest";
import { parseAnalyticsConfig, isLikelyGa4Id } from "@/lib/analytics/config";

describe("analytics config — parseAnalyticsConfig", () => {
  it("完整設定 → trim 後採用", () => {
    expect(
      parseAnalyticsConfig({
        ga4_id: "  G-ABC12345 ",
        gsc_verification: " token-xyz ",
      }),
    ).toEqual({ ga4Id: "G-ABC12345", gscVerification: "token-xyz" });
  });

  it("空字串 / 空白 → null（未設定）", () => {
    expect(
      parseAnalyticsConfig({ ga4_id: "  ", gsc_verification: "" }),
    ).toEqual({ ga4Id: null, gscVerification: null });
  });

  it("null / undefined value → 全 null（安全退回）", () => {
    expect(parseAnalyticsConfig(null)).toEqual({
      ga4Id: null,
      gscVerification: null,
    });
    expect(parseAnalyticsConfig(undefined)).toEqual({
      ga4Id: null,
      gscVerification: null,
    });
  });

  it("非字串型別 → null", () => {
    expect(
      parseAnalyticsConfig({
        ga4_id: 123 as unknown as string,
        gsc_verification: {} as unknown as string,
      }),
    ).toEqual({ ga4Id: null, gscVerification: null });
  });

  it("只設定其中一項 → 另一項為 null", () => {
    expect(parseAnalyticsConfig({ ga4_id: "G-ONLY1234" })).toEqual({
      ga4Id: "G-ONLY1234",
      gscVerification: null,
    });
  });
});

describe("analytics config — isLikelyGa4Id", () => {
  it("G- 前綴 + 英數 → true", () => {
    expect(isLikelyGa4Id("G-ABC12345")).toBe(true);
    expect(isLikelyGa4Id("  g-abcd1 ")).toBe(true);
  });

  it("非 G- 前綴 / 過短 → false", () => {
    expect(isLikelyGa4Id("UA-12345-1")).toBe(false);
    expect(isLikelyGa4Id("G-AB")).toBe(false);
    expect(isLikelyGa4Id("")).toBe(false);
  });
});
