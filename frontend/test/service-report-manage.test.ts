// 機台維護報告單「管理」頁（#193）的純函式：列表查詢參數解析 / 序列化、
// 依狀態決定的操作按鈕（spec §4.4）。
import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  parseReportListParams,
  reportListHref,
  SERVICE_REPORTS_PATH,
  toIsoDateParam,
  type ReportListQuery,
} from "@/app/admin/(protected)/service-reports/_components/list-params";
import {
  actionsForStatus,
  needsEditConfirm,
  REPORT_ACTION_LABELS,
  shouldOfferRefresh,
} from "@/app/admin/(protected)/service-reports/_components/report-actions";
import {
  SR_NOT_FOUND_MESSAGE,
  SR_STALE_MESSAGE,
} from "@/lib/service-report/errors";

const EMPTY: ReportListQuery = {
  q: "",
  status: "",
  from: "",
  to: "",
  page: 1,
};

describe("toIsoDateParam", () => {
  it("接受西元 ISO 並補零", () => {
    expect(toIsoDateParam("2026-09-15")).toBe("2026-09-15");
    expect(toIsoDateParam("2026-9-5")).toBe("2026-09-05");
  });

  it("民國日期轉西元", () => {
    expect(toIsoDateParam("115/09/15")).toBe("2026-09-15");
    expect(toIsoDateParam("115-9-5")).toBe("2026-09-05");
    expect(toIsoDateParam("112.4.20")).toBe("2023-04-20");
  });

  it("空值與不合法格式回空字串", () => {
    expect(toIsoDateParam("")).toBe("");
    expect(toIsoDateParam(null)).toBe("");
    expect(toIsoDateParam(undefined)).toBe("");
    expect(toIsoDateParam("昨天")).toBe("");
    expect(toIsoDateParam("2026-13-01")).toBe("");
    expect(toIsoDateParam("2026-09-45")).toBe("");
    expect(toIsoDateParam("1900-01-01")).toBe("");
    expect(toIsoDateParam("115/13/01")).toBe("");
  });
});

describe("parseReportListParams", () => {
  it("空 searchParams → 預設值", () => {
    expect(parseReportListParams({})).toEqual(EMPTY);
  });

  it("解析全部欄位（日期可為民國）", () => {
    expect(
      parseReportListParams({
        q: "  X11509  ",
        status: "printed",
        from: "115/09/01",
        to: "2026-09-30",
        page: "3",
      }),
    ).toEqual({
      q: "X11509",
      status: "printed",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 3,
    });
  });

  it("陣列參數取第一個值", () => {
    expect(parseReportListParams({ status: ["voided", "draft"] }).status).toBe(
      "voided",
    );
  });

  it("不合法狀態視為全部", () => {
    expect(parseReportListParams({ status: "archived" }).status).toBe("");
    expect(parseReportListParams({ status: "toString" }).status).toBe("");
  });

  it("頁碼 clamp：至少 1、非數字回 1、上限 100000", () => {
    expect(parseReportListParams({ page: "0" }).page).toBe(1);
    expect(parseReportListParams({ page: "-5" }).page).toBe(1);
    expect(parseReportListParams({ page: "abc" }).page).toBe(1);
    expect(parseReportListParams({ page: "2.7" }).page).toBe(2);
    expect(parseReportListParams({ page: "999999999" }).page).toBe(100000);
  });

  it("關鍵字截斷到 100 字", () => {
    expect(parseReportListParams({ q: "a".repeat(200) }).q).toHaveLength(100);
  });
});

describe("reportListHref", () => {
  it("無條件時只回基底路徑", () => {
    expect(reportListHref(EMPTY)).toBe(SERVICE_REPORTS_PATH);
  });

  it("省略空值與 page=1", () => {
    expect(reportListHref({ ...EMPTY, q: "台積", page: 1 })).toBe(
      `${SERVICE_REPORTS_PATH}?q=%E5%8F%B0%E7%A9%8D`,
    );
  });

  it("序列化後再解析可還原（round-trip）", () => {
    const query: ReportListQuery = {
      q: "X11509",
      status: "completed",
      from: "2026-09-01",
      to: "2026-09-30",
      page: 4,
    };
    const href = reportListHref(query);
    const sp = Object.fromEntries(
      new URL(href, "https://example.com").searchParams.entries(),
    );
    expect(parseReportListParams(sp)).toEqual(query);
  });

  it("可覆寫頁碼（分頁連結）", () => {
    const query: ReportListQuery = { ...EMPTY, status: "draft", page: 2 };
    expect(reportListHref(query, 1)).toBe(
      `${SERVICE_REPORTS_PATH}?status=draft`,
    );
    expect(reportListHref(query, 3)).toBe(
      `${SERVICE_REPORTS_PATH}?status=draft&page=3`,
    );
  });
});

describe("hasActiveFilters", () => {
  it("有任一條件即為 true", () => {
    expect(hasActiveFilters(EMPTY)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY, page: 3 })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY, status: "draft" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY, from: "2026-09-01" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY, to: "2026-09-30" })).toBe(true);
  });
});

describe("actionsForStatus（spec §4.4）", () => {
  it("draft 未列印：編輯 / 列印 / 作廢 / 刪除", () => {
    expect(actionsForStatus("draft", 0)).toEqual([
      "edit",
      "print",
      "void",
      "delete",
    ]);
  });

  it("draft 已列印過：不可刪除", () => {
    expect(actionsForStatus("draft", 1)).toEqual(["edit", "print", "void"]);
  });

  it("printed：編輯 / 列印 / 回填結果 / 結案 / 作廢，且不可刪除", () => {
    const keys = actionsForStatus("printed", 1);
    expect(keys).toEqual(["edit", "print", "fill", "complete", "void"]);
    expect(keys).not.toContain("delete");
    expect(keys).not.toContain("reopen");
  });

  it("printed 即使 print_count 為 0 也不給刪除", () => {
    expect(actionsForStatus("printed", 0)).not.toContain("delete");
  });

  it("completed：編輯 / 列印 / 重新開啟 / 作廢", () => {
    const keys = actionsForStatus("completed", 2);
    expect(keys).toEqual(["edit", "print", "reopen", "void"]);
    expect(keys).not.toContain("complete");
    expect(keys).not.toContain("delete");
  });

  it("voided：唯讀，沒有任何動作", () => {
    expect(actionsForStatus("voided", 0)).toEqual([]);
    expect(actionsForStatus("voided", 3)).toEqual([]);
  });

  it("每個動作都有中文標籤", () => {
    for (const status of ["draft", "printed", "completed", "voided"] as const) {
      for (const key of actionsForStatus(status, 1)) {
        expect(REPORT_ACTION_LABELS[key]).toBeTruthy();
      }
    }
  });
});

describe("needsEditConfirm", () => {
  it("只有已結案需要二次確認", () => {
    expect(needsEditConfirm("completed")).toBe(true);
    expect(needsEditConfirm("draft")).toBe(false);
    expect(needsEditConfirm("printed")).toBe(false);
    expect(needsEditConfirm("voided")).toBe(false);
  });
});

describe("shouldOfferRefresh", () => {
  it("狀態衝突類錯誤提供重新整理", () => {
    expect(shouldOfferRefresh(SR_STALE_MESSAGE)).toBe(true);
    expect(shouldOfferRefresh(SR_NOT_FOUND_MESSAGE)).toBe(true);
    expect(shouldOfferRefresh("只有已列印的報告單可以結案")).toBe(true);
    expect(shouldOfferRefresh("只有已結案的報告單可以重新開啟")).toBe(true);
    expect(shouldOfferRefresh("報告單已作廢")).toBe(true);
    expect(
      shouldOfferRefresh("只有未列印過的草稿可以刪除，其他請改用作廢"),
    ).toBe(true);
  });

  it("其他錯誤不提供", () => {
    expect(shouldOfferRefresh("作廢原因必填")).toBe(false);
    expect(shouldOfferRefresh("操作失敗，請檢查網路連線後再試一次。")).toBe(
      false,
    );
    expect(shouldOfferRefresh(null)).toBe(false);
    expect(shouldOfferRefresh("")).toBe(false);
  });
});
