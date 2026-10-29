import { describe, it, expect } from "vitest";
import {
  presetRange,
  rangeLabel,
} from "@/components/erp/meeting/tracking/_shim/date-range";
import {
  trackingFilterSummary,
  trackingHref,
  trackingReportTitle,
} from "@/components/erp/meeting/tracking/report";
import { ownerChoices } from "@/components/erp/meeting/tracking/TrackingFilterFields";
import { parseTrackingFilters } from "@/lib/erp/tracking/filters";
import { REPAIR_STATUS_LABELS } from "@/lib/erp/tracking/types";
import type { EmployeeOption } from "@/lib/employees/types";

// 週報追蹤（#272）：報表工具列暫代版的日期區間、報表標題／摘要／連結、負責人選項。測試資料全為虛構。

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

describe("日期區間快速選項（暫代版）", () => {
  it("週一為一週開始", () => {
    // 2026-10-29 為星期四
    expect(presetRange("this_week", "2026-10-29")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(presetRange("last_week", "2026-10-29")).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
    });
    // 星期日屬於前一個星期一開始的那週
    expect(presetRange("this_week", "2026-11-01").from).toBe("2026-10-26");
  });
  it("本月／上月（含跨年）", () => {
    expect(presetRange("this_month", "2026-02-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(presetRange("last_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
  it("標題區間", () => {
    expect(rangeLabel("2026-11-01", "2026-11-07")).toBe("11/01~11/07");
    expect(rangeLabel("2026-11-01", "")).toBe("11/01~");
    expect(rangeLabel("", "")).toBe("");
  });
});

describe("報表標題、摘要與連結", () => {
  it("標題：類別 + 區間", () => {
    expect(
      trackingReportTitle(
        "delivery",
        parseTrackingFilters("delivery", {
          from: "2026-11-01",
          to: "2026-11-07",
        }),
      ),
    ).toBe("交機進度 11/01~11/07");
    expect(
      trackingReportTitle("repairs", parseTrackingFilters("repairs", {})),
    ).toBe("進廠維修");
  });
  it("摘要：狀態、負責人、關鍵字、列印日期", () => {
    const f = parseTrackingFilters("repairs", {
      status: "vendor",
      owner: E1,
      q: "異音",
    });
    expect(
      trackingFilterSummary(
        f,
        REPAIR_STATUS_LABELS,
        employees,
        "未指定",
        "2026-10-29",
      ),
    ).toBe(
      "送廠商檢修｜負責人：測試師傅｜關鍵字：異音｜列印日期 民國115/10/29",
    );
    expect(
      trackingFilterSummary(
        parseTrackingFilters("repairs", { owner: "none" }),
        REPAIR_STATUS_LABELS,
        employees,
        "負責人未指定",
      ),
    ).toBe("未結案｜負責人未指定");
  });
  it("連結保留篩選、加上額外參數", () => {
    const f = parseTrackingFilters("machine-issues", {
      q: "面板",
      status: "all",
    });
    expect(trackingHref("machine-issues", f, { print: "1" })).toBe(
      "/admin/erp/meeting/machine-issues?q=%E9%9D%A2%E6%9D%BF&status=all&print=1",
    );
    expect(trackingHref("delivery", parseTrackingFilters("delivery", {}))).toBe(
      "/admin/erp/meeting/delivery",
    );
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
