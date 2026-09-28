import { describe, it, expect } from "vitest";

// 機台 → 方案比對（spec §5.3 / §8）：覆寫優先、馬力正規化、多方案衝突。

import { matchPlan, normalizeHpTag } from "@/lib/service-report/plan/match";
import type { ServicePlan } from "@/lib/service-report/plan/types";

function plan(over: Partial<ServicePlan> & { id: string }): ServicePlan {
  return {
    name: `方案 ${over.id}`,
    hp_tags: [],
    active: true,
    note: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  };
}

describe("normalizeHpTag", () => {
  it("大小寫 / 空白 / HP / 前導零 / 全形", () => {
    for (const t of ["20HP", "20hp", " 20 hp ", "HP20", "020HP", "２０ＨＰ"]) {
      expect(normalizeHpTag(t)).toBe("20");
    }
    expect(normalizeHpTag("20馬力")).toBe("20");
    expect(normalizeHpTag("7.5HP")).toBe("7.5");
    expect(normalizeHpTag("")).toBe("");
    expect(normalizeHpTag(null)).toBe("");
  });
});

describe("matchPlan", () => {
  const p20 = plan({ id: "p20", name: "B 20HP 空壓機", hp_tags: ["20HP"] });
  const p20b = plan({ id: "p20b", name: "A 20 匹", hp_tags: ["20"] });
  const p30 = plan({ id: "p30", name: "30HP", hp_tags: ["30HP", "30"] });
  const stopped = plan({
    id: "off",
    name: "停用的 20HP",
    hp_tags: ["20"],
    active: false,
  });

  it("依馬力比對（正規化後相同即算）", () => {
    const r = matchPlan({ id: "m1", horsepower: " 20 hp " }, [p30, p20]);
    expect(r.plan?.id).toBe("p20");
    expect(r.source).toBe("hp");
    expect(r.conflicts).toEqual([]);
  });

  it("停用方案不參與馬力比對", () => {
    const r = matchPlan({ id: "m1", horsepower: "20HP" }, [stopped]);
    expect(r.plan).toBeNull();
    expect(r.source).toBeNull();
  });

  it("多方案相符 → 取名稱排序第一並回 conflicts", () => {
    const r = matchPlan({ id: "m1", horsepower: "20" }, [p20, p20b]);
    expect(r.plan?.id).toBe("p20b"); // 「A 20 匹」排在「B 20HP 空壓機」前
    expect(r.conflicts.map((p) => p.id)).toEqual(["p20b", "p20"]);
  });

  it("逐台指定優先，且即使方案已停用也照用", () => {
    const r = matchPlan({ id: "m1", horsepower: "20" }, [p20, stopped], {
      m1: "off",
    });
    expect(r.plan?.id).toBe("off");
    expect(r.source).toBe("override");
    expect(r.conflicts).toEqual([]);
    // Map 形式亦可
    expect(
      matchPlan(
        { id: "m1", horsepower: "20" },
        [p20, stopped],
        new Map([["m1", "off"]]),
      ).plan?.id,
    ).toBe("off");
  });

  it("指定的方案已不存在 → 退回馬力比對", () => {
    const r = matchPlan({ id: "m1", horsepower: "20HP" }, [p20], {
      m1: "gone",
    });
    expect(r.plan?.id).toBe("p20");
    expect(r.source).toBe("hp");
  });

  it("沒有馬力或比不到 → 無方案", () => {
    expect(matchPlan({ id: "m1", horsepower: null }, [p20]).plan).toBeNull();
    expect(matchPlan({ id: "m1", horsepower: "50HP" }, [p20]).plan).toBeNull();
  });
});
