import { describe, it, expect } from "vitest";

// 階段判定與料件套用（spec §5.4 / §6.2 / §8）。

import {
  applyStageToParts,
  hasFilledParts,
  isStageReached,
  nextStage,
  normalizePartName,
  sortStages,
  stageLabel,
  stagePartQty,
  STAGE_PARTS_OVERFLOW_MESSAGE,
} from "@/lib/service-report/plan/stage";
import type {
  PlanPart,
  ServicePlanStage,
} from "@/lib/service-report/plan/types";
import { defaultParts } from "@/lib/service-report/types";

function stage(
  id: string,
  hours: number,
  label = "基礎保養",
  parts: PlanPart[] = [],
): ServicePlanStage {
  return { id, plan_id: "p1", hours, label, parts };
}

const S2000 = stage("s2", 2000);
const S4000 = stage("s4", 4000);
const S6000 = stage("s6", 6000, "年度保養");

describe("nextStage", () => {
  it("依時數由小到大取第一個未開過的階段", () => {
    expect(nextStage([S6000, S2000, S4000], [])?.id).toBe("s2");
    expect(nextStage([S6000, S2000, S4000], ["s2"])?.id).toBe("s4");
    expect(nextStage([S6000, S2000, S4000], new Set(["s2", "s4"]))?.id).toBe(
      "s6",
    );
  });

  it("全部開過 / 無階段 → null", () => {
    expect(nextStage([S2000, S4000], ["s2", "s4"])).toBeNull();
    expect(nextStage([], [])).toBeNull();
    expect(nextStage(null)).toBeNull();
  });

  it("sortStages 不動到來源陣列", () => {
    const src = [S6000, S2000];
    expect(sortStages(src).map((s) => s.id)).toEqual(["s2", "s6"]);
    expect(src.map((s) => s.id)).toEqual(["s6", "s2"]);
  });
});

describe("stageLabel / isStageReached", () => {
  it("顯示文字", () => {
    expect(stageLabel(S4000)).toBe("4000 小時 基礎保養");
    expect(stageLabel({ hours: 4000, label: "  " })).toBe("4000 小時");
  });

  it("是否已達門檻", () => {
    expect(isStageReached(S4000, 4000)).toBe(true);
    expect(isStageReached(S4000, 3999)).toBe(false);
    expect(isStageReached(S4000, null)).toBe(false);
  });
});

describe("normalizePartName / stagePartQty", () => {
  it("全形、空白、大小寫視為相同品名", () => {
    expect(normalizePartName("空氣濾清器（外）")).toBe(
      normalizePartName("空氣濾清器(外)"),
    );
    expect(normalizePartName(" Oil  Filter ")).toBe("oilfilter");
  });

  it("數量＝qty + unit", () => {
    expect(stagePartQty({ name: "油", qty: "1", unit: "桶" })).toBe("1桶");
    expect(stagePartQty({ name: "油", qty: "1" })).toBe("1");
    expect(stagePartQty({ name: "油", qty: "", unit: "桶" })).toBe("桶");
  });
});

describe("applyStageToParts", () => {
  const parts: PlanPart[] = [
    { name: "螺旋專用油", qty: "1", unit: "桶" },
    { name: "機油濾清器", qty: "1", unit: "只" },
  ];

  it("依品名比對既有列填數量，不動其他列", () => {
    const { parts: out, overflow } = applyStageToParts(
      defaultParts(),
      stage("s", 4000, "基礎保養", parts),
    );
    expect(out[0]).toEqual({ no: 1, name: "螺旋專用油", qty: "1桶" });
    expect(out[1]).toEqual({ no: 2, name: "機油濾清器", qty: "1只" });
    expect(out[2].qty).toBe("");
    expect(out).toHaveLength(10);
    expect(overflow).toEqual([]);
  });

  it("品名不在既有列 → 依序填入空白列", () => {
    const { parts: out, overflow } = applyStageToParts(
      defaultParts(),
      stage("s", 4000, "基礎保養", [
        { name: "冷卻水塔清洗", qty: "1", unit: "式" },
        { name: "皮帶", qty: "2" },
      ]),
    );
    // defaultParts 第 8、9 列為空白
    expect(out[7]).toEqual({ no: 8, name: "冷卻水塔清洗", qty: "1式" });
    expect(out[8]).toEqual({ no: 9, name: "皮帶", qty: "2" });
    expect(overflow).toEqual([]);
  });

  it("不覆寫：已填數量的列保持原樣，只填空白列", () => {
    const base = defaultParts().map((p) =>
      p.no === 1 ? { ...p, qty: "手動 2 桶" } : p,
    );
    const { parts: out } = applyStageToParts(
      base,
      stage("s", 4000, "基礎保養", parts),
      { overwrite: false },
    );
    expect(out[0].qty).toBe("手動 2 桶");
    expect(out[1].qty).toBe("1只");
  });

  it("覆寫：已填數量的列被蓋掉", () => {
    const base = defaultParts().map((p) =>
      p.no === 1 ? { ...p, qty: "手動 2 桶" } : p,
    );
    const { parts: out } = applyStageToParts(
      base,
      stage("s", 4000, "基礎保養", parts),
      { overwrite: true },
    );
    expect(out[0].qty).toBe("1桶");
  });

  it("超過 10 列 → overflow 回報，不動既有列", () => {
    const many: PlanPart[] = Array.from({ length: 4 }, (_, i) => ({
      name: `新料件${i + 1}`,
      qty: "1",
    }));
    const { parts: out, overflow } = applyStageToParts(
      defaultParts(),
      stage("s", 4000, "基礎保養", many),
    );
    // 只有 2 個空白列可用
    expect(out[7].name).toBe("新料件1");
    expect(out[8].name).toBe("新料件2");
    expect(overflow.map((p) => p.name)).toEqual(["新料件3", "新料件4"]);
    expect(STAGE_PARTS_OVERFLOW_MESSAGE).toBe("料件超過 10 列，請手動調整");
  });

  it("空品名略過；不動到來源陣列", () => {
    const base = defaultParts();
    const { parts: out } = applyStageToParts(
      base,
      stage("s", 4000, "基礎保養", [{ name: "  ", qty: "1" }, ...parts]),
    );
    expect(out[0].qty).toBe("1桶");
    expect(base[0].qty).toBe("");
  });

  it("hasFilledParts 判斷是否需要詢問覆寫", () => {
    expect(hasFilledParts(defaultParts())).toBe(false);
    expect(
      hasFilledParts(
        defaultParts().map((p) => (p.no === 3 ? { ...p, qty: "1" } : p)),
      ),
    ).toBe(true);
  });
});
