import { describe, it, expect } from "vitest";

// 機台 → 方案比對（spec §5.3 / §8）：覆寫 > 馬力 > 通用預設 > 無，
// 以及馬力正規化與多方案衝突。

import {
  isDefaultHpTags,
  matchPlan,
  normalizeHpTag,
} from "@/lib/service-report/plan/match";
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

  it("沒有馬力或比不到，且沒有通用預設方案 → 無方案", () => {
    expect(matchPlan({ id: "m1", horsepower: null }, [p20]).plan).toBeNull();
    expect(matchPlan({ id: "m1", horsepower: "50HP" }, [p20]).plan).toBeNull();
  });
});

describe("isDefaultHpTags", () => {
  it("正規化後沒有任何有效標籤才算通用預設", () => {
    expect(isDefaultHpTags([])).toBe(true);
    expect(isDefaultHpTags(null)).toBe(true);
    expect(isDefaultHpTags(undefined)).toBe(true);
    // 只打了「HP」／空白：正規化後是空字串，比對不到任何馬力
    expect(isDefaultHpTags(["HP", " "])).toBe(true);
    expect(isDefaultHpTags(["20HP"])).toBe(false);
    expect(isDefaultHpTags(["HP", "20"])).toBe(false);
  });
});

describe("matchPlan：通用預設方案（未填適用馬力）", () => {
  const p20 = plan({ id: "p20", name: "B 20HP 空壓機", hp_tags: ["20HP"] });
  const dflt = plan({ id: "d1", name: "B 通用預設", hp_tags: [] });
  const dflt2 = plan({ id: "d2", name: "A 另一個通用預設", hp_tags: [] });
  const dfltOff = plan({
    id: "doff",
    name: "停用的通用預設",
    hp_tags: [],
    active: false,
  });

  it("馬力比不到 → 退回通用預設", () => {
    const r = matchPlan({ id: "m1", horsepower: "50HP" }, [p20, dflt]);
    expect(r.plan?.id).toBe("d1");
    expect(r.source).toBe("default");
    expect(r.conflicts).toEqual([]);
  });

  it("馬力空白 / 無法正規化 → 仍套用通用預設", () => {
    for (const hp of [null, "", "   ", "HP", "未知"]) {
      const r = matchPlan({ id: "m1", horsepower: hp }, [p20, dflt]);
      expect(r.plan?.id).toBe("d1");
      expect(r.source).toBe("default");
    }
  });

  it("馬力比得到時優先於通用預設", () => {
    const r = matchPlan({ id: "m1", horsepower: "20" }, [dflt, p20]);
    expect(r.plan?.id).toBe("p20");
    expect(r.source).toBe("hp");
  });

  it("逐台指定優先於通用預設", () => {
    const r = matchPlan({ id: "m1", horsepower: "50HP" }, [dflt, p20], {
      m1: "p20",
    });
    expect(r.plan?.id).toBe("p20");
    expect(r.source).toBe("override");
  });

  it("停用的通用預設不參與比對", () => {
    const r = matchPlan({ id: "m1", horsepower: null }, [dfltOff]);
    expect(r.plan).toBeNull();
    expect(r.source).toBeNull();
    // 但逐台指定到它仍照用（與馬力方案一致）
    const pinned = matchPlan({ id: "m1", horsepower: null }, [dfltOff], {
      m1: "doff",
    });
    expect(pinned.plan?.id).toBe("doff");
    expect(pinned.source).toBe("override");
  });

  it("多個通用預設 → 取名稱排序第一並回 conflicts", () => {
    const r = matchPlan({ id: "m1", horsepower: "50HP" }, [dflt, dflt2]);
    expect(r.plan?.id).toBe("d2"); // 「A 另一個通用預設」排在「B 通用預設」前
    expect(r.source).toBe("default");
    expect(r.conflicts.map((p) => p.id)).toEqual(["d2", "d1"]);
  });

  it("只有標籤都無法正規化的方案也算通用預設", () => {
    const odd = plan({ id: "odd", name: "只打了 HP", hp_tags: ["HP"] });
    const r = matchPlan({ id: "m1", horsepower: "50HP" }, [odd]);
    expect(r.plan?.id).toBe("odd");
    expect(r.source).toBe("default");
  });
});
