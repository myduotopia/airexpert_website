import { describe, it, expect } from "vitest";
import {
  isValidIsoDate,
  normalizeReportInput,
  validateReportInput,
  validateVoidReason,
} from "@/lib/service-report/validate";
import {
  defaultParts,
  emptySheetData,
  type ServiceReportInput,
} from "@/lib/service-report/types";

const UUID = "11111111-2222-4333-8444-555555555555";

function valid(over: Partial<ServiceReportInput> = {}): ServiceReportInput {
  return {
    ...emptySheetData(),
    report_no: "",
    report_date: "2026-09-15",
    customer_id: null,
    machine_id: null,
    note: null,
    ...over,
  };
}

describe("isValidIsoDate", () => {
  it("實際存在的日期", () => {
    expect(isValidIsoDate("2026-09-15")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
  });
  it("格式錯 / 不存在的日期 / 民國元年前", () => {
    for (const v of [
      "",
      "2026-9-15",
      "2026-02-30",
      "2026-13-01",
      "1900-01-01",
      null,
      20260915,
    ]) {
      expect(isValidIsoDate(v)).toBe(false);
    }
  });
});

describe("validateReportInput", () => {
  it("最小合法輸入（新增、單號留空＝自動取號）", () => {
    expect(validateReportInput(valid())).toBeNull();
  });

  it("完整合法輸入", () => {
    expect(
      validateReportInput(
        valid({
          id: UUID,
          report_no: " x11509009 ",
          time_slot: "afternoon",
          customer_id: UUID,
          machine_id: UUID,
          machine_state: "running",
          service_items: ["routine", "periodic"],
          suggestions: ["motor"],
          summary: "更換油品",
          results: {
            compressor: { run_hours: "22278", fan: "normal" },
            dryer: { tank_drain: "abnormal" },
            filter_consumable: "replace",
          },
        }),
      ),
    ).toBeNull();
  });

  it("非物件", () => {
    expect(validateReportInput(null)).toBe("資料格式不正確");
    expect(validateReportInput("x")).toBe("資料格式不正確");
  });

  it("維護日期必填且有效", () => {
    expect(validateReportInput(valid({ report_date: "" }))).toBe(
      "請輸入維護日期",
    );
    expect(validateReportInput(valid({ report_date: "2026-02-30" }))).toBe(
      "維護日期不正確",
    );
  });

  it("派工單號：有填需合法；既有單不可空白", () => {
    expect(validateReportInput(valid({ report_no: "X1150" }))).toContain(
      "派工單號格式不正確",
    );
    expect(validateReportInput(valid({ report_no: "S11509009" }))).toContain(
      "派工單號格式不正確",
    );
    expect(validateReportInput(valid({ id: UUID, report_no: "  " }))).toBe(
      "請輸入派工單號",
    );
    expect(
      validateReportInput(valid({ report_no: "X11509" + "1".repeat(20) })),
    ).toContain("不可超過");
  });

  it("id / 客戶 / 機台 須為 UUID", () => {
    expect(validateReportInput(valid({ id: "abc" }))).toBe("找不到報告單");
    expect(validateReportInput(valid({ customer_id: "abc" }))).toBe(
      "客戶選擇不正確",
    );
    expect(validateReportInput(valid({ machine_id: "abc" }))).toBe(
      "機台選擇不正確",
    );
  });

  it("列舉欄位", () => {
    expect(validateReportInput(valid({ time_slot: "night" as never }))).toBe(
      "時段選項不正確",
    );
    expect(validateReportInput(valid({ machine_state: "off" as never }))).toBe(
      "機台狀態選項不正確",
    );
  });

  it("服務項目 / 建議事項須為子集合", () => {
    expect(
      validateReportInput(valid({ service_items: ["routine", "x"] as never })),
    ).toBe("服務項目選項不正確");
    expect(
      validateReportInput(valid({ service_items: "routine" as never })),
    ).toBe("服務項目格式不正確");
    expect(
      validateReportInput(valid({ suggestions: ["engine"] as never })),
    ).toBe("建議事項選項不正確");
  });

  it("更換料件固定 10 列、編號 1–10", () => {
    expect(
      validateReportInput(valid({ parts: defaultParts().slice(0, 9) })),
    ).toBe("更換料件必須為 10 列");
    const swapped = defaultParts();
    swapped[0] = { ...swapped[0], no: 2 };
    expect(validateReportInput(valid({ parts: swapped }))).toBe(
      "更換料件編號不正確",
    );
    const long = defaultParts();
    long[3] = { ...long[3], name: "字".repeat(51) };
    expect(validateReportInput(valid({ parts: long }))).toContain(
      "第 4 列品名",
    );
    const badQty = defaultParts();
    badQty[9] = { ...badQty[9], qty: 3 as never };
    expect(validateReportInput(valid({ parts: badQty }))).toContain("第 10 列");
  });

  it("檢查結果列舉與長度", () => {
    expect(
      validateReportInput(
        valid({ results: { compressor: { fan: "ok" as never } } }),
      ),
    ).toBe("空壓機檢查選項不正確");
    expect(
      validateReportInput(
        valid({ results: { dryer: { total_hours: "1".repeat(51) } } }),
      ),
    ).toContain("不可超過 50 字");
    expect(
      validateReportInput(
        valid({ results: { filter_consumable: "maybe" as never } }),
      ),
    ).toBe("過濾耗材選項不正確");
    expect(validateReportInput(valid({ results: [] as never }))).toBe(
      "檢查結果格式不正確",
    );
  });

  it("文字長度上限（修護記要 2000）", () => {
    expect(
      validateReportInput(valid({ summary: "a".repeat(2000) })),
    ).toBeNull();
    expect(validateReportInput(valid({ summary: "a".repeat(2001) }))).toBe(
      "修護記要及建議不可超過 2000 字",
    );
    expect(validateReportInput(valid({ address: 123 as never }))).toBe(
      "地址格式不正確",
    );
  });
});

describe("normalizeReportInput", () => {
  it("去空白（空 → null）、單號正規化、去重排序、剔除未知欄位", () => {
    const out = normalizeReportInput({
      ...valid({
        id: UUID,
        report_no: " x11509009 ",
        customer_name: "  金凱  ",
        phone: "   ",
        service_items: ["repair", "routine", "repair"],
        suggestions: ["rotor", "transmission"],
        results: {
          compressor: { run_hours: " 100 ", fan: "normal", current: "" },
          dryer: { total_hours: " " },
          filter_consumable: "none",
          extra: "x",
        } as never,
        parts: defaultParts().map((p) => ({ ...p, qty: ` ${p.no} ` })),
      }),
      status: "voided",
      print_count: 99,
    } as never);
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("print_count");
    expect(out.report_no).toBe("X11509009");
    expect(out.customer_name).toBe("金凱");
    expect(out.phone).toBeNull();
    expect(out.service_items).toEqual(["routine", "repair"]);
    expect(out.suggestions).toEqual(["transmission", "rotor"]);
    expect(out.results).toEqual({
      compressor: { run_hours: "100", fan: "normal" },
      filter_consumable: "none",
    });
    expect(out.parts[0]).toEqual({ no: 1, name: "螺旋專用油", qty: "1" });
  });

  it("空單號保持空字串（代表待取號）", () => {
    expect(normalizeReportInput(valid()).report_no).toBe("");
  });
});

describe("validateVoidReason", () => {
  it("必填與長度", () => {
    expect(validateVoidReason("")).toBe("請輸入作廢原因");
    expect(validateVoidReason("   ")).toBe("請輸入作廢原因");
    expect(validateVoidReason(undefined)).toBe("請輸入作廢原因");
    expect(validateVoidReason("客戶取消")).toBeNull();
    expect(validateVoidReason("a".repeat(501))).toContain("不可超過");
  });
});
