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
    readings: STEADY,
    todayIso: TODAY,
  };

  it("已達門檻 → due（最優先、無預估日期）", () => {
    const r = reminderFor({ ...base, stage: stage(1000) });
    expect(r?.status).toBe("due");
    expect(r?.due_date).toBeNull();
    expect(r?.stage_label).toBe("1000 小時 基礎保養");
    expect(r?.latest_hours).toBe(1100);
    expect(r?.machine_label).toBe("2-AB-123");
  });

  it("14 天內預估到期 → upcoming（含邊界第 14 天）", () => {
    expect(reminderFor({ ...base, stage: stage(1200) })).toMatchObject({
      status: "upcoming",
      due_date: "2026-09-21",
    });
    expect(reminderFor({ ...base, stage: stage(1240) })).toMatchObject({
      status: "upcoming",
      due_date: "2026-09-25", // = 今天 + 14
    });
  });

  it("超過 14 天 → 不列入", () => {
    expect(reminderFor({ ...base, stage: stage(1250) })).toBeNull();
  });

  it("無法推估（資料不足）時只靠「已達門檻」", () => {
    const few = [R("2026-09-11", 1100)];
    expect(
      reminderFor({ ...base, readings: few, stage: stage(1200) }),
    ).toBeNull();
    expect(
      reminderFor({ ...base, readings: few, stage: stage(1000) })?.status,
    ).toBe("due");
  });

  it("完全沒有可用抄表 → 不列入", () => {
    expect(
      reminderFor({ ...base, readings: [], stage: stage(100) }),
    ).toBeNull();
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
