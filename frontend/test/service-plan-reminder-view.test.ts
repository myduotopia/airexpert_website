import { describe, it, expect } from "vitest";

// 列表頁「保養到期提醒」區塊的顯示轉換（spec §6.1）：徽章文字與色調、民國抄表日、
// 階段文字、開立報告單連結、前 5 筆 / 其餘收摺的切分。純函式，無 DB。

import {
  REMINDER_CUSTOMER_MAX,
  REMINDER_VISIBLE_COUNT,
  formatHours,
  newReportHref,
  reminderStatusText,
  rocShortDate,
  splitReminders,
  toReminderRow,
} from "@/app/admin/(protected)/service-reports/_components/reminder-view";
import type { StageReminder } from "@/lib/service-report/plan/types";

function reminder(patch: Partial<StageReminder> = {}): StageReminder {
  return {
    machine_id: "11111111-1111-4111-8111-111111111111",
    customer_id: "22222222-2222-4222-8222-222222222222",
    customer_name: "鼎佑電子",
    machine_label: "2-AB123",
    plan_id: "33333333-3333-4333-8333-333333333333",
    plan_name: "20HP 空壓機保養",
    stage_id: "44444444-4444-4444-8444-444444444444",
    stage_hours: 4000,
    stage_name: "基礎保養",
    stage_label: "4000 小時 基礎保養",
    latest_hours: 22278,
    latest_date: "2026-09-11",
    latest_source: "record",
    status: "due",
    due_date: null,
    ...patch,
  };
}

describe("formatHours", () => {
  it("加千分位並附單位", () => {
    expect(formatHours(22278)).toBe("22,278 小時");
    expect(formatHours(0)).toBe("0 小時");
    expect(formatHours(999)).toBe("999 小時");
    expect(formatHours(1000)).toBe("1,000 小時");
    expect(formatHours(1234567)).toBe("1,234,567 小時");
  });

  it("小數四捨五入，非數字回破折號", () => {
    expect(formatHours(4000.6)).toBe("4,001 小時");
    expect(formatHours(Number.NaN)).toBe("—");
  });
});

describe("rocShortDate", () => {
  it("西元 ISO → 民國短式（不帶「民國」）", () => {
    expect(rocShortDate("2026-10-12")).toBe("115/10/12");
    expect(rocShortDate("2026-01-05")).toBe("115/01/05");
  });

  it("空值回破折號", () => {
    expect(rocShortDate(null)).toBe("—");
    expect(rocShortDate("")).toBe("—");
  });
});

describe("reminderStatusText", () => {
  it("已達門檻不顯示日期", () => {
    expect(reminderStatusText("due", null)).toBe("已達門檻");
    expect(reminderStatusText("due", "2026-10-12")).toBe("已達門檻");
  });

  it("即將到期顯示預估民國日期", () => {
    expect(reminderStatusText("upcoming", "2026-10-12")).toBe(
      "預計 115/10/12 到期",
    );
  });

  it("缺預估日期時退回通用標籤", () => {
    expect(reminderStatusText("upcoming", null)).toBe("即將到期");
    expect(reminderStatusText("upcoming", "")).toBe("即將到期");
    expect(reminderStatusText("upcoming", "not-a-date")).toBe("即將到期");
  });
});

describe("newReportHref", () => {
  it("帶 machineId 與 stageId", () => {
    expect(newReportHref("m-1", "s-1")).toBe(
      "/admin/service-reports/new?machineId=m-1&stageId=s-1",
    );
  });

  it("特殊字元會被編碼", () => {
    expect(newReportHref("a b", "c&d")).toBe(
      "/admin/service-reports/new?machineId=a+b&stageId=c%26d",
    );
  });
});

describe("toReminderRow", () => {
  it("已達門檻：警示色、無預估日期、民國抄表日與階段文字", () => {
    const row = toReminderRow(reminder());
    expect(row.status).toBe("due");
    expect(row.statusText).toBe("已達門檻");
    expect(row.statusTone).toBe("warning");
    expect(row.hoursText).toBe("22,278 小時");
    expect(row.readAtText).toBe("民國115/09/11");
    expect(row.stageText).toBe("4000 小時 基礎保養");
    expect(row.machineLabel).toBe("2-AB123");
    expect(row.href).toBe(
      "/admin/service-reports/new?machineId=11111111-1111-4111-8111-111111111111&stageId=44444444-4444-4444-8444-444444444444",
    );
    expect(row.key).toBe(
      "11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444",
    );
  });

  it("即將到期：一般提示色、顯示預估日期", () => {
    const row = toReminderRow(
      reminder({
        status: "upcoming",
        due_date: "2026-10-12",
        latest_hours: 3850,
      }),
    );
    expect(row.statusText).toBe("預計 115/10/12 到期");
    expect(row.statusTone).toBe("info");
    expect(row.hoursText).toBe("3,850 小時");
  });

  it("即將到期但沒有預估日期時仍可顯示（不丟例外）", () => {
    const row = toReminderRow(reminder({ status: "upcoming", due_date: null }));
    expect(row.statusText).toBe("即將到期");
    expect(row.statusTone).toBe("info");
  });

  it("超長客戶名稱截斷並保留完整名稱", () => {
    const long = "超勁賀空壓科技股份有限公司台中營運處第二廠";
    const row = toReminderRow(reminder({ customer_name: long }));
    expect(row.truncated).toBe(true);
    expect(row.customerTitle).toBe(long);
    expect(row.customerName).toBe(`${long.slice(0, REMINDER_CUSTOMER_MAX)}…`);
    expect(row.customerName.length).toBe(REMINDER_CUSTOMER_MAX + 1);
  });

  it("剛好等於上限的名稱不截斷", () => {
    const exact = "字".repeat(REMINDER_CUSTOMER_MAX);
    const row = toReminderRow(reminder({ customer_name: exact }));
    expect(row.truncated).toBe(false);
    expect(row.customerName).toBe(exact);
  });

  it("空白客戶名稱有替代文字", () => {
    const row = toReminderRow(reminder({ customer_name: "   " }));
    expect(row.customerName).toBe("（未命名客戶）");
    expect(row.truncated).toBe(false);
  });
});

describe("splitReminders", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("預設顯示前 5 筆", () => {
    expect(REMINDER_VISIBLE_COUNT).toBe(5);
  });

  it("0 筆", () => {
    expect(splitReminders(items(0))).toEqual({ head: [], rest: [] });
  });

  it("3 筆全部直接顯示", () => {
    expect(splitReminders(items(3))).toEqual({ head: [0, 1, 2], rest: [] });
  });

  it("5 筆剛好不需要展開", () => {
    const { head, rest } = splitReminders(items(5));
    expect(head).toEqual([0, 1, 2, 3, 4]);
    expect(rest).toEqual([]);
  });

  it("9 筆：前 5 顯示、後 4 收摺", () => {
    const { head, rest } = splitReminders(items(9));
    expect(head).toEqual([0, 1, 2, 3, 4]);
    expect(rest).toEqual([5, 6, 7, 8]);
    expect(head.length + rest.length).toBe(9);
  });

  it("不改動來源陣列、不重新排序", () => {
    const src = [3, 1, 2];
    const { head } = splitReminders(src, 2);
    expect(head).toEqual([3, 1]);
    expect(src).toEqual([3, 1, 2]);
  });
});
