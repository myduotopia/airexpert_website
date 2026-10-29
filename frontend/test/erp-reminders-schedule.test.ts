import { describe, it, expect } from "vitest";
import {
  CHECK_LEAD_DAYS,
  LOOKBACK_DAYS,
  badgeCount,
  buildReminderItems,
  daysLeftLabel,
  dueDatesBetween,
  filterReminderItems,
  pendingDueDates,
  recurrenceLabel,
  urgencyOf,
  type CheckDueInput,
  type ReminderRuleRow,
} from "@/lib/erp/reminders/schedule";

// 提醒事項（#274）到期計算、排序、色標、篩選。資料全為虛構。

function rule(p: Partial<ReminderRuleRow> = {}): ReminderRuleRow {
  return {
    id: "r1",
    vendor_id: "v1",
    vendor_name: "測試廠商甲",
    title: "匯款",
    kind: "monthly",
    day_of_month: 10,
    weekday: null,
    month: null,
    once_date: null,
    start_date: "2026-10-01",
    lead_days: 7,
    active: true,
    source: "auto",
    source_text: "每月10號匯款",
    note: null,
    ...p,
  };
}
const none = new Set<string>();
const dates = (r: ReminderRuleRow, today: string, handled = none) =>
  pendingDueDates(r, today, handled).map((x) => [x.dueDate, x.daysLeft]);

describe("每月 10 日、提前 7 天（驗收情境）", () => {
  it("每月 3 日開始出現，剩 7 天", () => {
    // 起算日 2026-10-01：10/10 未處理 → 11/2 仍顯示為逾期
    expect(dates(rule(), "2026-11-02")).toEqual([["2026-10-10", -23]]);
    // 10/10 已處理 → 11/2 沒有任何提醒；11/3 出現 11/10（剩 7 天）
    const done = new Set(["2026-10-10"]);
    expect(dates(rule(), "2026-11-02", done)).toEqual([]);
    expect(dates(rule(), "2026-11-03", done)).toEqual([["2026-11-10", 7]]);
  });

  it("10 日當天為今天到期；11 日起逾期且持續顯示", () => {
    const done = new Set(["2026-10-10"]);
    expect(dates(rule(), "2026-11-10", done)).toEqual([["2026-11-10", 0]]);
    expect(dates(rule(), "2026-11-12", done)).toEqual([["2026-11-10", -2]]);
    expect(dates(rule(), "2026-11-30", done)).toEqual([["2026-11-10", -20]]);
  });

  it("標記完成後消失，下個月再出現", () => {
    const done = new Set(["2026-10-10", "2026-11-10"]);
    expect(dates(rule(), "2026-11-12", done)).toEqual([]);
    expect(dates(rule(), "2026-12-03", done)).toEqual([["2026-12-10", 7]]);
  });

  it("提前天數邊界：剩 8 天不出現、剩 7 天出現", () => {
    const done = new Set(["2026-10-10"]);
    expect(dates(rule(), "2026-11-02", done)).toEqual([]);
    expect(dates(rule(), "2026-11-03", done)).toEqual([["2026-11-10", 7]]);
    expect(dates(rule({ lead_days: 0 }), "2026-11-09", done)).toEqual([]);
    expect(dates(rule({ lead_days: 0 }), "2026-11-10", done)).toEqual([
      ["2026-11-10", 0],
    ]);
  });

  it(`逾期最多往回看 ${LOOKBACK_DAYS} 天`, () => {
    // 今天 2026-12-15：往回 60 天 = 2026-10-16 → 10/10 不列、11/10、12/10 列
    expect(dates(rule(), "2026-12-15")).toEqual([
      ["2026-11-10", -35],
      ["2026-12-10", -5],
    ]);
    expect(dates(rule({ day_of_month: 16 }), "2026-12-15")).toEqual([
      ["2026-10-16", -60],
      ["2026-11-16", -29],
      ["2026-12-16", 1],
    ]);
  });

  it("起算日之前的到期不列（新建立的規則不會一次冒出過去的逾期）", () => {
    expect(dates(rule({ start_date: "2026-11-11" }), "2026-11-12")).toEqual([]);
    expect(dates(rule({ start_date: "2026-11-10" }), "2026-11-12")).toEqual([
      ["2026-11-10", -2],
    ]);
  });

  it("停用的規則不產生提醒", () => {
    expect(dates(rule({ active: false }), "2026-11-10")).toEqual([]);
  });
});

describe("月底與小月", () => {
  it("月底（-1）＝當月最後一天", () => {
    expect(
      dueDatesBetween(rule({ day_of_month: -1 }), "2026-01-01", "2026-04-30"),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("31 日遇小月取當月最後一天", () => {
    expect(
      dueDatesBetween(rule({ day_of_month: 31 }), "2026-01-01", "2026-06-30"),
    ).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ]);
  });
  it("閏年 2 月：29、30、31 日與月底皆為 2/29", () => {
    for (const d of [29, 30, 31, -1]) {
      expect(
        dueDatesBetween(rule({ day_of_month: d }), "2028-02-01", "2028-02-29"),
        String(d),
      ).toEqual(["2028-02-29"]);
    }
    expect(
      dueDatesBetween(rule({ day_of_month: 29 }), "2027-02-01", "2027-02-28"),
    ).toEqual(["2027-02-28"]);
  });
  it("小月月底當天為今天到期", () => {
    expect(
      dates(rule({ day_of_month: 31, start_date: "2026-01-01" }), "2026-04-30"),
    ).toEqual([
      ["2026-03-31", -30],
      ["2026-04-30", 0],
    ]);
  });
});

describe("跨年、每週、每年、單次", () => {
  it("跨年：12/28 看 1/3 的每月 3 日", () => {
    expect(
      dates(rule({ day_of_month: 3, start_date: "2026-12-04" }), "2026-12-28"),
    ).toEqual([["2027-01-03", 6]]);
  });
  it("每週三（weekday 3）", () => {
    // 2026-11-04 為星期三
    expect(
      dueDatesBetween(
        rule({ kind: "weekly", day_of_month: null, weekday: 3 }),
        "2026-11-01",
        "2026-11-20",
      ),
    ).toEqual(["2026-11-04", "2026-11-11", "2026-11-18"]);
    expect(
      dueDatesBetween(
        rule({ kind: "weekly", day_of_month: null, weekday: 0 }),
        "2026-11-01",
        "2026-11-08",
      ),
    ).toEqual(["2026-11-01", "2026-11-08"]);
  });
  it("每年：跨年視窗、2/29 在平年取 2/28", () => {
    const y = rule({ kind: "yearly", month: 1, day_of_month: 2 });
    expect(dates(y, "2026-12-28")).toEqual([["2027-01-02", 5]]);
    const leap = rule({ kind: "yearly", month: 2, day_of_month: 29 });
    expect(dueDatesBetween(leap, "2027-01-01", "2028-12-31")).toEqual([
      "2027-02-28",
      "2028-02-29",
    ]);
  });
  it("單次：不受起算日限制；逾期亦受 60 天回看上限", () => {
    const once = rule({
      kind: "once",
      day_of_month: null,
      once_date: "2026-11-05",
      start_date: "2026-11-20",
    });
    expect(dates(once, "2026-11-01")).toEqual([["2026-11-05", 4]]);
    expect(dates(once, "2026-11-25")).toEqual([["2026-11-05", -20]]);
    expect(dates(once, "2027-01-05")).toEqual([]);
    expect(dates(once, "2026-10-28")).toEqual([]);
  });
});

describe("色標與文字", () => {
  it.each([
    [-5, "overdue", "逾期 5 天"],
    [-1, "overdue", "逾期 1 天"],
    [0, "urgent", "今天到期"],
    [3, "urgent", "剩 3 天"],
    [4, "soon", "剩 4 天"],
    [7, "soon", "剩 7 天"],
    [8, "later", "剩 8 天"],
  ] as const)("%d 天 → %s／%s", (d, u, label) => {
    expect(urgencyOf(d)).toBe(u);
    expect(daysLeftLabel(d)).toBe(label);
  });

  it("週期文字", () => {
    expect(recurrenceLabel(rule())).toBe("每月 10 日");
    expect(recurrenceLabel(rule({ day_of_month: -1 }))).toBe("每月月底");
    expect(recurrenceLabel(rule({ day_of_month: 31 }))).toBe(
      "每月 31 日（小月為月底）",
    );
    expect(
      recurrenceLabel(rule({ kind: "weekly", day_of_month: null, weekday: 0 })),
    ).toBe("每週日");
    expect(
      recurrenceLabel(rule({ kind: "yearly", month: 3, day_of_month: 15 })),
    ).toBe("每年 3 月 15 日");
    expect(
      recurrenceLabel(
        rule({ kind: "once", day_of_month: null, once_date: "2026-11-05" }),
      ),
    ).toBe("單次 民國115/11/05");
  });
});

function check(p: Partial<CheckDueInput> = {}): CheckDueInput {
  return {
    id: "p1",
    direction: "out",
    kind: "payment",
    doc_no: "PM11510001",
    check_no: "AB0001",
    check_due_date: "2026-11-05",
    amount: 12000,
    bank: "測試銀行",
    customer_id: null,
    vendor_id: "v2",
    party_name: "測試廠商乙",
    ...p,
  };
}

describe("清單：排序、支票、篩選、徽章", () => {
  const today = "2026-11-03";
  const rules = [
    rule({ id: "a", title: "匯款", day_of_month: 10 }), // 11/10 剩 7、10/10 逾期 24
    rule({
      id: "b",
      title: "對帳",
      day_of_month: 4,
      source: "manual",
      vendor_id: null,
      vendor_name: null,
    }), // 11/4 剩 1、10/4 逾期 30
    rule({ id: "c", title: "請款", day_of_month: 1, active: false }),
  ];
  const handled = [{ rule_id: "a", due_date: "2026-10-10" }];
  const checks = [
    check(),
    check({
      id: "p2",
      direction: "in",
      doc_no: "RC11510001",
      check_no: "CD0002",
      check_due_date: "2026-10-30",
      customer_id: "c1",
      vendor_id: null,
      party_name: "測試客戶丙",
    }),
    check({ id: "p3", check_due_date: "2026-11-11" }), // 剩 8 天：超出支票提前天數
  ];
  const items = buildReminderItems({ today, rules, handled, checks });

  it("逾期最前（逾期越久越前），再依剩餘天數由少到多；停用與已處理不列", () => {
    expect(items.map((i) => [i.key, i.daysLeft, i.urgency])).toEqual([
      ["rule:b:2026-10-04", -30, "overdue"],
      ["check:p2", -4, "overdue"],
      ["rule:b:2026-11-04", 1, "urgent"],
      ["check:p1", 2, "urgent"],
      ["rule:a:2026-11-10", 7, "soon"],
    ]);
    expect(CHECK_LEAD_DAYS).toBe(7);
  });

  it("支票項目：收票／開票、連到收付款單、唯讀、對象連到廠商或客戶", () => {
    const p1 = items.find((i) => i.key === "check:p1")!;
    expect(p1).toMatchObject({
      source: "check",
      title: "開票到期",
      ruleId: null,
      href: "/admin/erp/disbursements/p1",
      party: {
        name: "測試廠商乙",
        href: "/admin/erp/vendors/v2",
      },
    });
    expect(p1.detail).toContain("AB0001");
    const p2 = items.find((i) => i.key === "check:p2")!;
    expect(p2.title).toBe("收票到期");
    expect(p2.party?.href).toBe("/admin/erp/customers/c1");
  });

  it("規則項目：對象連到廠商頁；無對象為 null", () => {
    const a = items.find((i) => i.ruleId === "a")!;
    expect(a.party).toEqual({
      key: "vendor:v1",
      name: "測試廠商甲",
      href: "/admin/erp/vendors/v1",
    });
    expect(items.find((i) => i.ruleId === "b")!.party).toBeNull();
  });

  it("篩選：緊急程度、來源、對象、關鍵字", () => {
    const keys = (f: Parameters<typeof filterReminderItems>[1]) =>
      filterReminderItems(items, f).map((i) => i.key);
    expect(keys({ urgency: "overdue" })).toEqual([
      "rule:b:2026-10-04",
      "check:p2",
    ]);
    expect(keys({ urgency: "soon" })).toEqual(["rule:a:2026-11-10"]);
    expect(keys({ source: "check" })).toEqual(["check:p2", "check:p1"]);
    expect(keys({ source: "manual" })).toEqual([
      "rule:b:2026-10-04",
      "rule:b:2026-11-04",
    ]);
    expect(keys({ party: "vendor:v1" })).toEqual(["rule:a:2026-11-10"]);
    expect(keys({ q: "客戶丙" })).toEqual(["check:p2"]);
    expect(keys({ q: "ab0001" })).toEqual(["check:p1"]);
    expect(keys({ q: "對帳", urgency: "urgent" })).toEqual([
      "rule:b:2026-11-04",
    ]);
    expect(keys({})).toEqual(items.map((i) => i.key));
  });

  it("徽章數量 = 逾期 + 3 天內", () => {
    expect(badgeCount(items)).toBe(4);
    // 邊界：剩 3 天算、剩 4 天不算
    const at = (d: number) => ({ ...items[0], daysLeft: d });
    expect(badgeCount([at(3), at(4), at(0), at(-1)])).toBe(3);
    expect(badgeCount([])).toBe(0);
  });
});
