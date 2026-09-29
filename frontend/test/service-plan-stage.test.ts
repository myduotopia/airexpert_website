import { describe, it, expect } from "vitest";

// 階段判定與料件套用（spec §5.4 / §6.2 / §8）。

import {
  applyStageToParts,
  cycleLength,
  hasFilledParts,
  isHoursReached,
  lastMilestone,
  milestoneKey,
  milestoneLabel,
  milestoneOptions,
  milestoneStage,
  nextMilestone,
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

const PLAN = [S6000, S2000, S4000];
/** 任意階段組合（不是 2000 的倍數，也不是等差）：一輪 9000。 */
const ODD = [
  stage("a", 3000, "A 保養"),
  stage("b", 1500, "B 保養"),
  stage("c", 9000, "C 保養"),
];

describe("sortStages", () => {
  it("不動到來源陣列", () => {
    const src = [S6000, S2000];
    expect(sortStages(src).map((s) => s.id)).toEqual(["s2", "s6"]);
    expect(src.map((s) => s.id)).toEqual(["s6", "s2"]);
  });
});

describe("cycleLength", () => {
  it("一輪＝最大階段時數（順序無關）", () => {
    expect(cycleLength(PLAN)).toBe(6000);
    expect(cycleLength(ODD)).toBe(9000);
    expect(cycleLength([S2000])).toBe(2000);
  });

  it("無階段 → 0", () => {
    expect(cycleLength([])).toBe(0);
    expect(cycleLength(null)).toBe(0);
  });
});

describe("milestoneStage", () => {
  it("餘數對到階段；餘數 0 對到最大階段", () => {
    expect(milestoneStage(PLAN, 2000)?.id).toBe("s2");
    expect(milestoneStage(PLAN, 20000)?.id).toBe("s2"); // 20000 % 6000 = 2000
    expect(milestoneStage(PLAN, 22000)?.id).toBe("s4"); // 22000 % 6000 = 4000
    expect(milestoneStage(PLAN, 24000)?.id).toBe("s6"); // 餘 0 → 6000 年度保養
    expect(milestoneStage(PLAN, 6000)?.id).toBe("s6");
  });

  it("任意階段組合（1500／3000／9000）", () => {
    expect(milestoneStage(ODD, 10500)?.id).toBe("b"); // 10500 % 9000 = 1500
    expect(milestoneStage(ODD, 21000)?.id).toBe("a"); // 21000 % 9000 = 3000
    expect(milestoneStage(ODD, 12000)?.id).toBe("a"); // 12000 % 9000 = 3000
    expect(milestoneStage(ODD, 18000)?.id).toBe("c"); // 餘 0 → 9000
  });

  it("不是里程碑（對不到階段）/ 無階段 → null", () => {
    expect(milestoneStage(PLAN, 3000)).toBeNull();
    expect(milestoneStage(PLAN, 0)).toBeNull();
    expect(milestoneStage([], 2000)).toBeNull();
  });
});

describe("lastMilestone / nextMilestone", () => {
  const at = (hours: number | null) => [
    lastMilestone(PLAN, hours)?.milestone ?? null,
    nextMilestone(PLAN, hours)?.milestone ?? null,
  ];

  it("22278 小時 → 已達 22000、下一個 24000", () => {
    expect(at(22278)).toEqual([22000, 24000]);
    expect(lastMilestone(PLAN, 22278)?.stage.id).toBe("s4");
    expect(nextMilestone(PLAN, 22278)?.stage.id).toBe("s6");
  });

  it("剛好落在里程碑上 → 該里程碑算已達", () => {
    expect(at(22000)).toEqual([22000, 24000]);
    expect(at(24000)).toEqual([24000, 26000]);
    expect(at(2000)).toEqual([2000, 4000]);
    expect(at(6000)).toEqual([6000, 8000]);
  });

  it("還沒到第一個里程碑 → 已達 null、下一個 2000", () => {
    expect(at(1500)).toEqual([null, 2000]);
    expect(at(0)).toEqual([null, 2000]);
    expect(at(1999)).toEqual([null, 2000]);
  });

  it("沒有時數 → 已達 null、下一個第一個里程碑", () => {
    expect(at(null)).toEqual([null, 2000]);
  });

  it("跑很遠也不會漏（第 100 輪）", () => {
    expect(at(600_123)).toEqual([600_000, 602_000]);
  });

  it("任意階段組合（1500／3000／9000，一輪 9000）", () => {
    expect([
      lastMilestone(ODD, 10000)?.milestone,
      nextMilestone(ODD, 10000)?.milestone,
    ]).toEqual([9000, 10500]);
    expect(lastMilestone(ODD, 10000)?.stage.id).toBe("c");
    expect(nextMilestone(ODD, 10500)?.milestone).toBe(12000);
  });

  it("無階段 → null", () => {
    expect(lastMilestone([], 5000)).toBeNull();
    expect(nextMilestone(null, 5000)).toBeNull();
  });
});

describe("milestoneOptions", () => {
  it("涵蓋已達與下一個里程碑，數量＝階段數", () => {
    expect(milestoneOptions(PLAN, 22278).map((m) => m.milestone)).toEqual([
      20000, 22000, 24000,
    ]);
    expect(milestoneOptions(PLAN, 24000).map((m) => m.milestone)).toEqual([
      22000, 24000, 26000,
    ]);
  });

  it("時數還低 / 沒有時數 → 從第一個里程碑往後補", () => {
    expect(milestoneOptions(PLAN, 1500).map((m) => m.milestone)).toEqual([
      2000, 4000, 6000,
    ]);
    expect(milestoneOptions(PLAN, null).map((m) => m.milestone)).toEqual([
      2000, 4000, 6000,
    ]);
  });

  it("只有一個階段時仍同時給已達與下一個", () => {
    expect(milestoneOptions([S2000], 5000).map((m) => m.milestone)).toEqual([
      4000, 6000,
    ]);
  });

  it("無階段 → 空陣列", () => {
    expect(milestoneOptions([], 100)).toEqual([]);
  });
});

describe("milestoneLabel / milestoneKey / isHoursReached", () => {
  it("顯示文字用里程碑、名稱用階段原文", () => {
    expect(milestoneLabel(22000, S4000)).toBe("22000 小時 基礎保養");
    expect(milestoneLabel(24000, S6000)).toBe("24000 小時 年度保養");
    expect(milestoneLabel(22000, { label: "  " })).toBe("22000 小時");
    expect(stageLabel(S4000)).toBe("4000 小時 基礎保養");
  });

  it("已開過的鍵同時含階段 id 與里程碑", () => {
    expect(milestoneKey("s4", 22000)).toBe("s4@22000");
    expect(milestoneKey("s4", 22000)).not.toBe(milestoneKey("s4", 4000));
    expect(milestoneKey("s4", 22000)).not.toBe(milestoneKey("s2", 22000));
  });

  it("是否已達門檻", () => {
    expect(isHoursReached(22000, 22000)).toBe(true);
    expect(isHoursReached(22000, 21999)).toBe(false);
    expect(isHoursReached(22000, null)).toBe(false);
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
