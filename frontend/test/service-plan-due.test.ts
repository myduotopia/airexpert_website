import { describe, it, expect } from "vitest";

// 使用速度推估與提醒判定（spec §5.5 / §5.6 / §8）。

import {
  addDaysIso,
  daysBetweenIso,
  estimateDue,
  machineLabel,
  reminderFor,
  sortReminders,
} from "@/lib/service-report/plan/due";
import { milestoneKey } from "@/lib/service-report/plan/stage";
import type {
  HoursReading,
  ServicePlanStage,
  StageReminder,
} from "@/lib/service-report/plan/types";

const R = (
  date: string,
  hours: number,
  source: HoursReading["source"] = "record",
): HoursReading => ({ date, hours, source });

const TODAY = "2026-09-11";
const MACHINE = {
  id: "m1",
  customer_id: "c1",
  customer_name: "鼎佑電子",
  machine_no: "2",
  serial_no: "AB-123",
  model: "AE-20",
};
const PLAN = { id: "p1", name: "20HP 空壓機" };

function stage(hours: number, label = "基礎保養"): ServicePlanStage {
  return { id: `s${hours}`, plan_id: "p1", hours, label, parts: [] };
}

/** 正式站的方案：2000／4000 基礎保養、6000 年度保養（一輪 6000）。 */
const STAGES = [stage(2000), stage(4000), stage(6000, "年度保養")];

/** 已開過的鍵：同階段但不同里程碑不算同一次保養。 */
const issuedKey = (hours: number, milestone: number) =>
  milestoneKey(`s${hours}`, milestone);

/** 10 天內跑 100 小時 → 每天 10 小時。 */
const STEADY = [R("2026-09-01", 1000), R("2026-09-11", 1100)];

describe("日期工具", () => {
  it("加天數 / 相差天數", () => {
    expect(addDaysIso("2026-09-11", 14)).toBe("2026-09-25");
    expect(addDaysIso("2026-12-25", 10)).toBe("2027-01-04");
    expect(daysBetweenIso("2026-09-01", "2026-09-11")).toBe(10);
    expect(daysBetweenIso("2026-09-11", "2026-09-01")).toBe(-10);
  });
});

describe("estimateDue", () => {
  it("正常推估：rate = 增加時數 / 天數", () => {
    const e = estimateDue(STEADY, 1200, TODAY);
    expect(e).not.toBeNull();
    expect(e?.rate).toBe(10);
    expect(e?.spanDays).toBe(10);
    expect(e?.daysToTarget).toBe(10);
    expect(e?.dueDate).toBe("2026-09-21");
  });

  it("資料不足：少於 2 筆、首尾未滿 7 天、時數沒增加 → null", () => {
    expect(estimateDue([R("2026-09-01", 1000)], 1200, TODAY)).toBeNull();
    expect(
      estimateDue([R("2026-09-05", 1000), R("2026-09-10", 1100)], 1200, TODAY),
    ).toBeNull();
    expect(
      estimateDue([R("2026-09-01", 1000), R("2026-09-11", 1000)], 1200, TODAY),
    ).toBeNull();
    expect(estimateDue([], 1200, TODAY)).toBeNull();
  });

  it("時數倒退的抄表被略過", () => {
    const e = estimateDue(
      [R("2026-09-01", 1000), R("2026-09-05", 500), R("2026-09-11", 1100)],
      1200,
      TODAY,
    );
    expect(e?.rate).toBe(10);
    expect(e?.samples).toBe(2);
  });

  it("只取最近 6 筆", () => {
    const readings = Array.from({ length: 8 }, (_, i) =>
      R(`2026-09-${String(i + 1).padStart(2, "0")}`, 1000 + i * 24),
    );
    const e = estimateDue(readings, 2000, TODAY);
    // 最近 6 筆＝09-03 ~ 09-08，共 5 天（< 7 天）→ 無法推估
    expect(e).toBeNull();
  });

  it("速率上下限：0.1 – 24 小時/日", () => {
    const fast = estimateDue(
      [R("2026-09-01", 1000), R("2026-09-08", 2000)],
      3000,
      TODAY,
    );
    expect(fast?.rate).toBe(24);
    const slow = estimateDue(
      [R("2026-01-01", 1000), R("2026-09-01", 1001)],
      1200,
      TODAY,
    );
    expect(slow?.rate).toBe(0.1);
  });

  it("推估日期已過 → 以今天表示", () => {
    const e = estimateDue(
      [R("2026-01-01", 1000), R("2026-02-01", 1300)],
      1310,
      TODAY,
    );
    expect(e?.dueDate).toBe(TODAY);
  });
});

describe("machineLabel", () => {
  it("代號-機號；皆缺時用型號", () => {
    expect(machineLabel(MACHINE)).toBe("2-AB-123");
    expect(
      machineLabel({ machine_no: null, serial_no: null, model: "AE-20" }),
    ).toBe("AE-20");
    expect(
      machineLabel({ machine_no: null, serial_no: null, model: null }),
    ).toBe("（未命名機台）");
  });
});

describe("reminderFor", () => {
  const base = {
    machine: MACHINE,
    plan: PLAN,
    stages: STAGES,
    readings: STEADY,
    todayIso: TODAY,
  };
  /** 22278 小時（正式站實際資料）：10 天跑 100 小時。 */
  const FAR = [R("2026-09-01", 22178), R("2026-09-11", 22278)];

  it("22278 小時 → 只提醒已達的 22000，不回頭補 2000／4000／6000", () => {
    const r = reminderFor({ ...base, readings: FAR });
    expect(r?.status).toBe("due");
    expect(r?.due_date).toBeNull();
    expect(r?.milestone).toBe(22000);
    expect(r?.stage_id).toBe("s4000"); // 22000 % 6000 = 4000
    expect(r?.stage_hours).toBe(4000);
    expect(r?.stage_name).toBe("基礎保養");
    expect(r?.stage_label).toBe("22000 小時 基礎保養");
    expect(r?.latest_hours).toBe(22278);
    expect(r?.machine_label).toBe("2-AB-123");
    expect([2000, 4000, 6000]).not.toContain(r?.milestone);
  });

  it("22000 已開過 → 下一個是 24000 年度保養（餘數 0 對到最大階段）", () => {
    // 距 24000 還有 1722 小時（每天 10 小時）→ 還太遠，不列入
    expect(
      reminderFor({ ...base, readings: FAR, issued: [issuedKey(4000, 22000)] }),
    ).toBeNull();
    // 逼近 24000（10 天後到）→ 以 24000 年度保養列入 upcoming
    const r = reminderFor({
      ...base,
      readings: [R("2026-09-01", 23800), R("2026-09-11", 23900)],
      issued: [issuedKey(4000, 22000)],
    });
    expect(r).toMatchObject({
      status: "upcoming",
      milestone: 24000,
      stage_id: "s6000",
      stage_hours: 6000,
      stage_name: "年度保養",
      stage_label: "24000 小時 年度保養",
      due_date: "2026-09-21",
    });
  });

  it("已開過只認同階段＋同里程碑（同階段的舊里程碑不算）", () => {
    // s4000 的 4000 小時開過，但 22000 沒開過 → 仍要提醒 22000
    const r = reminderFor({
      ...base,
      readings: FAR,
      issued: [issuedKey(4000, 4000), issuedKey(2000, 22000)],
    });
    expect(r?.milestone).toBe(22000);
    expect(r?.status).toBe("due");
  });

  it("14 天內預估到期 → upcoming（含邊界第 14 天）", () => {
    // 1900 小時、每天 10 小時：已達 0 個里程碑？已達 0；下一個 2000 → 10 天後
    const near = [R("2026-09-01", 1800), R("2026-09-11", 1900)];
    expect(reminderFor({ ...base, readings: near, issued: [] })).toMatchObject({
      status: "upcoming",
      milestone: 2000,
      stage_label: "2000 小時 基礎保養",
      due_date: "2026-09-21",
    });
    // 剛好第 14 天：1860 → 2000 還差 140 小時 = 14 天
    expect(
      reminderFor({
        ...base,
        readings: [R("2026-09-01", 1760), R("2026-09-11", 1860)],
      }),
    ).toMatchObject({ status: "upcoming", due_date: "2026-09-25" });
  });

  it("超過 14 天 → 不列入", () => {
    // 1850 → 2000 還差 150 小時 = 15 天
    expect(
      reminderFor({
        ...base,
        readings: [R("2026-09-01", 1750), R("2026-09-11", 1850)],
      }),
    ).toBeNull();
  });

  it("下一個里程碑已開過（提前保養）→ 不再提醒", () => {
    const near = [R("2026-09-01", 1800), R("2026-09-11", 1900)];
    expect(
      reminderFor({ ...base, readings: near, issued: [issuedKey(2000, 2000)] }),
    ).toBeNull();
  });

  it("無法推估（資料不足）時只靠「已達門檻」", () => {
    const few = [R("2026-09-11", 1900)];
    expect(reminderFor({ ...base, readings: few })).toBeNull();
    expect(
      reminderFor({ ...base, readings: [R("2026-09-11", 2100)] })?.status,
    ).toBe("due");
  });

  it("完全沒有可用抄表 / 方案沒有階段 → 不列入", () => {
    expect(reminderFor({ ...base, readings: [] })).toBeNull();
    expect(reminderFor({ ...base, stages: [] })).toBeNull();
  });
});

describe("sortReminders", () => {
  it("due 在前，其次預估日期由近到遠，再依客戶名稱", () => {
    const make = (
      over: Partial<StageReminder> & Pick<StageReminder, "status">,
    ): StageReminder => ({
      machine_id: "m",
      customer_id: "c",
      customer_name: "甲",
      machine_label: "1",
      plan_id: "p1",
      plan_name: "20HP",
      milestone: 2000,
      stage_id: "s",
      stage_hours: 2000,
      stage_name: "基礎保養",
      stage_label: "2000 小時 基礎保養",
      latest_hours: 100,
      latest_date: "2026-09-11",
      latest_source: "record",
      due_date: null,
      ...over,
    });
    const sorted = sortReminders([
      make({ status: "upcoming", due_date: "2026-09-25", customer_name: "乙" }),
      make({ status: "upcoming", due_date: "2026-09-20", customer_name: "丙" }),
      make({ status: "due", customer_name: "丁" }),
      make({ status: "due", customer_name: "乙" }),
    ]);
    expect(sorted.map((r) => [r.status, r.customer_name, r.due_date])).toEqual([
      ["due", "丁", null],
      ["due", "乙", null],
      ["upcoming", "丙", "2026-09-20"],
      ["upcoming", "乙", "2026-09-25"],
    ]);
  });
});
