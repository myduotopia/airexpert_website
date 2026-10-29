import { describe, it, expect } from "vitest";
import {
  MEETING_RANGE_PRESETS,
  MEETING_RANGE_PRESETS_WITH_ALL,
  meetingRangeLabel,
  meetingReportTitle,
  parseMeetingRange,
  presetRange,
} from "@/lib/erp/meeting/date-range";
import { meetingCsvFilename } from "@/lib/erp/meeting/csv";
import { meetingPrintHref, meetingTabHref } from "@/lib/erp/meeting/params";
import {
  trackingFilterSummary,
  trackingPeriodText,
  trackingReportTitle,
} from "@/components/erp/meeting/tracking/report";
import { ownerChoices } from "@/components/erp/meeting/tracking/TrackingFilterFields";
import {
  parseTrackingFilters,
  trackingQuery,
} from "@/lib/erp/tracking/filters";
import { REPAIR_STATUS_LABELS } from "@/lib/erp/tracking/types";
import type { EmployeeOption } from "@/lib/employees/types";

// 週報追蹤（#272）整合 #271 週報共用元件後的行為：期間「全部」（range=all）、報表標題／期間／摘要、
// 列印與子頁籤連結、負責人選項；並確認維護完成紀錄（未傳 allowAll）的期間行為不變。測試資料全為虛構。

const TODAY = "2026-10-29"; // 星期四
const E1 = "22222222-2222-4222-8222-222222222222";
const E2 = "33333333-3333-4333-8333-333333333333";
const E3 = "44444444-4444-4444-8444-444444444444";
const employees: EmployeeOption[] = [
  { id: E1, code: null, name: "測試師傅", roles: ["technician"], active: true },
  { id: E2, code: null, name: "測試業務", roles: ["sales"], active: true },
  {
    id: E3,
    code: null,
    name: "離職師傅",
    roles: ["technician"],
    active: false,
  },
];

describe("期間「全部」（#271 共用 date-range 的 allowAll）", () => {
  it("allowAll：預設全部、接受 range=all、起訖為空", () => {
    expect(parseMeetingRange({}, TODAY, { allowAll: true })).toEqual({
      preset: "all",
      from: "",
      to: "",
      error: null,
    });
    expect(
      parseMeetingRange({ range: "all" }, TODAY, { allowAll: true }).preset,
    ).toBe("all");
    expect(
      parseMeetingRange({ range: "last_month" }, TODAY, { allowAll: true }),
    ).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("維護完成紀錄（未傳 allowAll）行為不變：預設本週、range=all 視為不合法 → 本週（不提示）", () => {
    const thisWeek = {
      preset: "this_week",
      from: "2026-10-26",
      to: "2026-11-01",
      error: null,
    };
    expect(parseMeetingRange({}, TODAY)).toEqual(thisWeek);
    // 從追蹤清單切到維護完成紀錄時會帶著 range=all（MeetingTabs 保留期間參數）
    expect(parseMeetingRange({ range: "all" }, TODAY)).toEqual(thisWeek);
    const bad = parseMeetingRange(
      { range: "custom", from: "2026-10-15", to: "2026-10-01" },
      TODAY,
    );
    expect(bad.preset).toBe("this_week");
    expect(bad.error).toMatch(/已改顯示本週/);
  });

  it("工具列選項：預設清單不含「全部」，追蹤清單用的清單把「全部」放第一個", () => {
    expect(MEETING_RANGE_PRESETS.map((p) => p.key)).not.toContain("all");
    expect(MEETING_RANGE_PRESETS_WITH_ALL[0]).toEqual({
      key: "all",
      label: "全部",
    });
    expect(MEETING_RANGE_PRESETS_WITH_ALL.slice(1)).toEqual(
      MEETING_RANGE_PRESETS,
    );
  });

  it("presetRange(all) 為空區間；標題／CSV 檔名在不限日期時不出現空白區間", () => {
    expect(presetRange("all", TODAY)).toEqual({ from: "", to: "" });
    expect(meetingRangeLabel({ from: "", to: "" })).toBe("");
    expect(meetingReportTitle("交機進度", { from: "", to: "" })).toBe(
      "交機進度",
    );
    expect(meetingCsvFilename("交機進度", { from: "", to: "" })).toBe(
      "交機進度_全部期間.csv",
    );
    // 有日期時與 #271 相同
    expect(
      meetingReportTitle("維護完成紀錄", {
        from: "2026-10-26",
        to: "2026-11-01",
      }),
    ).toBe("維護完成紀錄 10/26~11/01");
  });
});

describe("報表標題、期間、摘要與連結", () => {
  it("標題：類別 + 區間；不限日期只有類別", () => {
    expect(
      trackingReportTitle(
        "delivery",
        parseTrackingFilters(
          "delivery",
          { range: "custom", from: "2026-11-01", to: "2026-11-07" },
          TODAY,
        ),
      ),
    ).toBe("交機進度 11/01~11/07");
    expect(
      trackingReportTitle(
        "repairs",
        parseTrackingFilters("repairs", {}, TODAY),
      ),
    ).toBe("進廠維修");
  });

  it("期間文字", () => {
    expect(trackingPeriodText(parseTrackingFilters("repairs", {}, TODAY))).toBe(
      "不限日期",
    );
    expect(
      trackingPeriodText(
        parseTrackingFilters("repairs", { range: "this_week" }, TODAY),
      ),
    ).toBe("115/10/26 ～ 115/11/01");
  });

  it("摘要：狀態、負責人、關鍵字", () => {
    const f = parseTrackingFilters(
      "repairs",
      { status: "vendor", owner: E1, q: "異音" },
      TODAY,
    );
    expect(
      trackingFilterSummary(f, REPAIR_STATUS_LABELS, employees, "未指定"),
    ).toBe("送廠商檢修｜負責人：測試師傅｜關鍵字：異音");
    expect(
      trackingFilterSummary(
        parseTrackingFilters("repairs", { owner: "none" }, TODAY),
        REPAIR_STATUS_LABELS,
        employees,
        "負責人未指定",
      ),
    ).toBe("未結案｜負責人未指定");
  });

  it("列印與返回連結：#271 的獨立列印路由，條件與清單相同", () => {
    const f = parseTrackingFilters(
      "machine-issues",
      { q: "面板", status: "all" },
      TODAY,
    );
    const query = trackingQuery(f);
    expect(meetingPrintHref("machine-issues", query)).toBe(
      "/admin/erp/print/meeting/machine-issues?range=all&q=%E9%9D%A2%E6%9D%BF&status=all",
    );
    expect(meetingTabHref("delivery")).toBe("/admin/erp/meeting/delivery");
  });
});

describe("負責人選項", () => {
  it("只列在職且有指定角色者；目前篩選中的停用員工仍列出", () => {
    expect(
      ownerChoices(employees, ["technician"], "").map((e) => e.id),
    ).toEqual([E1]);
    expect(
      ownerChoices(employees, ["sales", "technician"], "").map((e) => e.id),
    ).toEqual([E1, E2]);
    expect(
      ownerChoices(employees, ["technician"], E3).map((e) => e.id),
    ).toEqual([E1, E3]);
  });
});
