import { describe, it, expect } from "vitest";
import {
  emptyRuleInput,
  normalizeHandleInput,
  normalizeRuleInput,
  ruleToInput,
  type ReminderRuleInput,
} from "@/lib/erp/reminders/rule-input";

// 提醒規則表單驗證（#274）：只保留該週期的欄位，其餘為 null（符合 0040 約束）。

const base = (p: Partial<ReminderRuleInput>): ReminderRuleInput => ({
  ...emptyRuleInput("2026-11-03", "v1"),
  title: "匯款",
  ...p,
});

describe("normalizeRuleInput", () => {
  it("每月：只留 day_of_month；月底 -1 可", () => {
    const r = normalizeRuleInput(base({ day_of_month: -1, note: "  " }));
    expect(r).toEqual({
      ok: true,
      row: {
        vendor_id: "v1",
        title: "匯款",
        kind: "monthly",
        day_of_month: -1,
        weekday: null,
        month: null,
        once_date: null,
        start_date: "2026-11-03",
        lead_days: 7,
        active: true,
        note: null,
      },
    });
  });

  it("每週／每年／單次：只留各自欄位", () => {
    const w = normalizeRuleInput(base({ kind: "weekly", weekday: 0 }));
    expect(w.ok && [w.row.weekday, w.row.day_of_month, w.row.month]).toEqual([
      0,
      null,
      null,
    ]);
    const y = normalizeRuleInput(
      base({ kind: "yearly", month: 2, day_of_month: 29 }),
    );
    expect(y.ok && [y.row.month, y.row.day_of_month, y.row.weekday]).toEqual([
      2,
      29,
      null,
    ]);
    const o = normalizeRuleInput(
      base({ kind: "once", once_date: "2026-12-01", vendor_id: "" }),
    );
    expect(
      o.ok && [o.row.once_date, o.row.day_of_month, o.row.vendor_id],
    ).toEqual(["2026-12-01", null, null]);
  });

  it.each([
    [{ title: " " }, "title"],
    [{ title: "x".repeat(101) }, "title"],
    [{ lead_days: 91 }, "lead_days"],
    [{ lead_days: "abc" }, "lead_days"],
    [{ lead_days: -1 }, "lead_days"],
    [{ start_date: "" }, "start_date"],
    [{ day_of_month: 0 }, "day_of_month"],
    [{ day_of_month: 32 }, "day_of_month"],
    [{ kind: "weekly", weekday: 7 }, "weekday"],
    [{ kind: "yearly", month: 13 }, "month"],
    [{ kind: "yearly", month: 4, day_of_month: 31 }, "day_of_month"],
    [{ kind: "yearly", month: 2, day_of_month: -1 }, "day_of_month"],
    [{ kind: "once", once_date: "2026-02-30" }, "once_date"],
  ] as [Partial<ReminderRuleInput>, string][])("%o → %s 錯誤", (p, field) => {
    const r = normalizeRuleInput(base(p));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.field).toBe(field);
  });

  it("提前天數可為字串數字", () => {
    const r = normalizeRuleInput(base({ lead_days: "14" }));
    expect(r.ok && r.row.lead_days).toBe(14);
  });
});

describe("normalizeHandleInput", () => {
  it("完成／略過＋備註", () => {
    expect(
      normalizeHandleInput({
        ruleId: "r1",
        dueDate: "2026-11-10",
        status: "skipped",
        note: " 本月免匯 ",
      }),
    ).toEqual({
      ok: true,
      row: {
        rule_id: "r1",
        due_date: "2026-11-10",
        status: "skipped",
        note: "本月免匯",
      },
    });
  });
  it("錯誤：狀態、日期、備註過長", () => {
    expect(
      normalizeHandleInput({ ruleId: "r1", dueDate: "2026-11-10", status: "x" })
        .ok,
    ).toBe(false);
    expect(
      normalizeHandleInput({ ruleId: "r1", dueDate: "11/10", status: "done" })
        .ok,
    ).toBe(false);
    expect(
      normalizeHandleInput({
        ruleId: "r1",
        dueDate: "2026-11-10",
        status: "done",
        note: "x".repeat(501),
      }).ok,
    ).toBe(false);
  });
});

describe("ruleToInput", () => {
  it("既有規則 → 表單；再驗證回同一列", () => {
    const row = {
      vendor_id: "v1",
      title: "送貨",
      kind: "weekly" as const,
      day_of_month: null,
      weekday: 3,
      month: null,
      once_date: null,
      start_date: "2026-10-01",
      lead_days: 2,
      active: false,
      note: null,
    };
    const input = ruleToInput(row, "2026-11-03");
    expect(input.day_of_month).toBe(10);
    expect(normalizeRuleInput(input)).toEqual({ ok: true, row });
  });
});
