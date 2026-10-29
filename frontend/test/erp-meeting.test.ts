import { describe, it, expect } from "vitest";

// ERP 週報（#271）：日期區間、CSV、處理進度摘要、技師欄位與合計、篩選、網址參數。
import {
  MEETING_RANGE_MAX_DAYS,
  addDays,
  meetingRangeLabel,
  meetingReportTitle,
  parseMeetingRange,
  presetRange,
  validateCustomRange,
  weekStart,
} from "@/lib/erp/meeting/date-range";
import {
  meetingCsvFile,
  meetingCsvFilename,
  safeFilename,
} from "@/lib/erp/meeting/csv";
import {
  buildMaintenanceTable,
  filterMaintenanceRows,
  formatShare,
  maintenanceCsvRows,
  maintenanceProgress,
  maintenanceTechnicianOptions,
  rocShortDate,
  rowTechnicians,
  type MaintenanceSourceRow,
} from "@/lib/erp/meeting/maintenance";
import {
  MEETING_TABS,
  firstParam,
  keywordParam,
  meetingPrintHref,
  meetingQuery,
  meetingTabHref,
} from "@/lib/erp/meeting/params";

// 2026-10-29 是週四
const TODAY = "2026-10-29";

describe("date-range：預設區間（台灣日期、週一開始）", () => {
  it("weekStart：任一天 → 該週週一；週日屬於前一個週一", () => {
    expect(weekStart("2026-10-29")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // 週日
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
  });

  it("本週／上週：週一～週日", () => {
    expect(presetRange("this_week", TODAY)).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(presetRange("last_week", TODAY)).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
    });
  });

  it("跨年的週：2027-01-01（週五）本週從 2026-12-28 起", () => {
    expect(presetRange("this_week", "2027-01-01")).toEqual({
      from: "2026-12-28",
      to: "2027-01-03",
    });
  });

  it("本月／上月：含月底天數與閏年、一月的上月是去年十二月", () => {
    expect(presetRange("this_month", TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(presetRange("last_month", TODAY)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetRange("last_month", "2028-03-15")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
    expect(presetRange("last_month", "2027-01-10")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("addDays 跨月跨年", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("today 格式錯誤直接丟錯（呼叫端應傳 taipeiToday()）", () => {
    expect(() => presetRange("this_week", "2026/10/29")).toThrow();
  });
});

describe("date-range：網址參數解析", () => {
  it("未帶或不認得的 range → 本週", () => {
    expect(parseMeetingRange({}, TODAY)).toEqual({
      preset: "this_week",
      from: "2026-10-26",
      to: "2026-11-01",
      error: null,
    });
    expect(parseMeetingRange({ range: "bogus" }, TODAY).preset).toBe(
      "this_week",
    );
  });

  it("預設區間忽略 from / to", () => {
    const r = parseMeetingRange(
      { range: "last_month", from: "2020-01-01", to: "2020-01-02" },
      TODAY,
    );
    expect(r).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("自訂：合法時沿用；不合法退回本週並帶提示", () => {
    expect(
      parseMeetingRange(
        { range: "custom", from: "2026-10-01", to: "2026-10-15" },
        TODAY,
      ),
    ).toEqual({
      preset: "custom",
      from: "2026-10-01",
      to: "2026-10-15",
      error: null,
    });
    for (const bad of [
      { from: "2026-10-15", to: "2026-10-01" },
      { from: "2026-02-30", to: "2026-03-01" },
      { from: "", to: "2026-10-01" },
      { from: "2024-01-01", to: "2026-10-01" },
    ]) {
      const r = parseMeetingRange({ range: "custom", ...bad }, TODAY);
      expect(r.preset, JSON.stringify(bad)).toBe("this_week");
      expect(r.from).toBe("2026-10-26");
      expect(r.error).toMatch(/自訂區間不正確/);
    }
  });

  it("validateCustomRange：最長一年（含端點相差 366 天）", () => {
    expect(validateCustomRange("2026-01-01", "2026-01-01")).toBeNull();
    expect(
      validateCustomRange(
        "2026-01-01",
        addDays("2026-01-01", MEETING_RANGE_MAX_DAYS),
      ),
    ).toBeNull();
    expect(
      validateCustomRange(
        "2026-01-01",
        addDays("2026-01-01", MEETING_RANGE_MAX_DAYS + 1),
      ),
    ).toMatch(/最長一年/);
  });

  it("標題：同年 MM/DD~MM/DD；跨年加民國年", () => {
    expect(meetingRangeLabel({ from: "2026-10-26", to: "2026-11-01" })).toBe(
      "10/26~11/01",
    );
    expect(meetingRangeLabel({ from: "2026-12-28", to: "2027-01-03" })).toBe(
      "115/12/28~116/01/03",
    );
    expect(
      meetingReportTitle("維護完成紀錄", {
        from: "2026-10-26",
        to: "2026-11-01",
      }),
    ).toBe("維護完成紀錄 10/26~11/01");
  });
});

describe("params：子頁籤與查詢字串", () => {
  it("四個子頁籤依序", () => {
    expect(MEETING_TABS.map((t) => t.key)).toEqual([
      "delivery",
      "repairs",
      "machine-issues",
      "maintenance",
    ]);
  });

  it("meetingQuery：預設區間只帶 range；自訂帶起訖；空白參數省略", () => {
    expect(
      meetingQuery(
        { preset: "this_week", from: "x", to: "y" },
        { q: "  空壓 ", tech: "", none: null },
      ),
    ).toBe("range=this_week&q=%E7%A9%BA%E5%A3%93");
    expect(
      meetingQuery({ preset: "custom", from: "2026-10-01", to: "2026-10-15" }),
    ).toBe("range=custom&from=2026-10-01&to=2026-10-15");
  });

  it("連結：子頁籤與列印頁", () => {
    expect(meetingTabHref("maintenance")).toBe(
      "/admin/erp/meeting/maintenance",
    );
    expect(meetingPrintHref("maintenance", "range=last_week")).toBe(
      "/admin/erp/print/meeting/maintenance?range=last_week",
    );
  });

  it("firstParam／keywordParam：陣列取第一個、去空白、關鍵字最長 100 字", () => {
    expect(firstParam(["a ", "b"])).toBe("a");
    expect(firstParam(undefined)).toBe("");
    expect(keywordParam("x".repeat(150))).toHaveLength(100);
  });
});

describe("csv：UTF-8 BOM、跳脫、檔名", () => {
  it("BOM + CRLF；逗號、引號、換行跳脫；公式開頭加 '", () => {
    const f = meetingCsvFile(
      "維護完成紀錄",
      { from: "2026-10-26", to: "2026-11-01" },
      ["日期", "說明"],
      [
        ["115/10/27", '含,逗號"引號'],
        ["115/10/28", "=SUM(A1)"],
        ["115/10/29", "兩\n行"],
      ],
    );
    expect(f.filename).toBe("維護完成紀錄_2026-10-26_2026-11-01.csv");
    expect(f.content.charCodeAt(0)).toBe(0xfeff);
    expect(f.content).toBe(
      "﻿日期,說明\r\n" +
        '115/10/27,"含,逗號""引號"\r\n' +
        "115/10/28,'=SUM(A1)\r\n" +
        '115/10/29,"兩\n行"\r\n',
    );
  });

  it("檔名移除路徑與保留字元", () => {
    expect(safeFilename('a/b\\c:d*?"<>|')).toBe("a_b_c_d_");
    expect(
      meetingCsvFilename("交機/進度", { from: "2026-10-01", to: "2026-10-31" }),
    ).toBe("交機_進度_2026-10-01_2026-10-31.csv");
  });
});

// ── 維護完成紀錄 ──────────────────────────────────────────────

const TECH_A = "00000000-0000-0000-0000-0000000000a1";
const TECH_B = "00000000-0000-0000-0000-0000000000b1";
const TECH_C = "00000000-0000-0000-0000-0000000000c1";

function src(
  id: string,
  patch: Partial<MaintenanceSourceRow> = {},
): MaintenanceSourceRow {
  return {
    id,
    report_no: `X115100${id}`,
    report_date: "2026-10-27",
    customer_name: "測試客戶",
    summary: null,
    equipment: null,
    model: null,
    service_items: [],
    results: {},
    parts: [],
    suggestions: [],
    technician: null,
    technicians: [],
    ...patch,
  };
}

const tech = (
  employee_id: string,
  name: string,
  share: number,
  code: string | null = null,
  is_primary = false,
) => ({ employee_id, name, code, share, is_primary });

describe("處理進度摘要", () => {
  it("例檢無異常：例檢OK 時 溫 型號", () => {
    expect(
      maintenanceProgress(
        src("1", {
          service_items: ["routine"],
          results: {
            compressor: { run_hours: "2209", temperature: " 84 " },
            dryer: { cooling_fan: "normal" },
          },
          model: "AM3-37A-E30",
        }),
      ),
    ).toBe("例檢OK 時2209 溫84 AM3-37A-E30");
  });

  it("異常項目取代 OK；多個服務項目以 / 連接", () => {
    expect(
      maintenanceProgress(
        src("1", {
          service_items: ["routine", "repair"],
          results: {
            compressor: { inverter_fan: "abnormal", fan: "normal" },
            dryer: { refrigerant_high: "abnormal" },
          },
        }),
      ),
    ).toBe("例檢/查修 異常：變頻器風扇、冷媒高壓");
  });

  it("更換料件（有數量才列、不含工資）、過濾耗材、建議事項；無型號用設備", () => {
    expect(
      maintenanceProgress(
        src("1", {
          service_items: ["periodic"],
          parts: [
            { no: 1, name: "螺旋專用油", qty: "1桶" },
            { no: 2, name: "機油濾清器", qty: "" },
            { no: 3, name: "空氣濾清器(外)", qty: "1" },
            { no: 10, name: "維護及保養工資", qty: "1" },
          ],
          results: { filter_consumable: "replace" },
          suggestions: ["rotor"],
          equipment: "TEST 50HP 空壓機",
        }),
      ),
    ).toBe(
      "定保OK 換螺旋專用油、空氣濾清器(外) 過濾耗材建議更換 建議壓縮轉子年度歲修 TEST 50HP 空壓機",
    );
  });

  it("什麼都沒填：OK；建議加裝過濾設備；未知代碼略過", () => {
    expect(maintenanceProgress(src("1"))).toBe("OK");
    expect(
      maintenanceProgress(
        src("1", {
          service_items: ["bogus"],
          results: { filter_consumable: "suggest_install" },
          suggestions: ["bogus"],
        }),
      ),
    ).toBe("OK 建議加裝過濾設備");
  });

  it("results／parts 為 null 也不出錯", () => {
    expect(
      maintenanceProgress(
        src("1", { results: null, parts: null, service_items: null }),
      ),
    ).toBe("OK");
  });
});

describe("技師欄位與合計", () => {
  const rows = [
    src("1", {
      technicians: [
        tech(TECH_B, "測試師傅乙", 0.5, "T02", true),
        tech(TECH_A, "測試師傅甲", 0.5, "T01"),
      ],
    }),
    src("2", { technicians: [tech(TECH_A, "測試師傅甲", 1, "T01", true)] }),
    src("3", {
      technicians: [
        tech(TECH_C, "測試師傅丙", 0.34, null, true),
        tech(TECH_A, "測試師傅甲", 0.33, "T01"),
        tech(TECH_B, "測試師傅乙", 0.33, "T02"),
      ],
    }),
    // 舊資料：只有維護人員文字
    src("4", { technician: "  老 張 " }),
    // 沒有任何技師
    src("5"),
  ];

  it("欄位：區間內出現過的技師，主檔依代號（無代號在後）、舊資料文字最後", () => {
    const table = buildMaintenanceTable(rows);
    expect(table.columns.map((c) => c.name)).toEqual([
      "測試師傅甲",
      "測試師傅乙",
      "測試師傅丙",
      "老 張",
    ]);
    expect(table.columns[3]).toMatchObject({ legacy: true, key: "name:老 張" });
  });

  it("每列比例、空白為空；表尾合計無浮點誤差", () => {
    const table = buildMaintenanceTable(rows);
    expect(table.rows[0].shares).toEqual({ [TECH_B]: 0.5, [TECH_A]: 0.5 });
    expect(table.rows[3].shares).toEqual({ "name:老 張": 1 });
    expect(table.rows[4].shares).toEqual({});
    expect(table.totals).toEqual({
      [TECH_A]: 1.83,
      [TECH_B]: 0.83,
      [TECH_C]: 0.34,
      "name:老 張": 1,
    });
  });

  it("許多 0.1 累加仍精確", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      src(String(i), { technicians: [tech(TECH_A, "甲", 0.1)] }),
    );
    expect(buildMaintenanceTable(many).totals[TECH_A]).toBe(1);
  });

  it("沒有資料：沒有技師欄、合計為空", () => {
    expect(buildMaintenanceTable([])).toEqual({
      columns: [],
      rows: [],
      totals: {},
    });
  });

  it("share 為字串（numeric 經 JSON）也能計算", () => {
    const r = rowTechnicians({
      technician: null,
      technicians: [
        { ...tech(TECH_A, "甲", 0), share: "0.50" as unknown as number },
      ],
    });
    expect(r[0].share).toBe(0.5);
  });

  it("formatShare：去尾零、0 與非數字為空", () => {
    expect(formatShare(1)).toBe("1");
    expect(formatShare(0.5)).toBe("0.5");
    expect(formatShare(0.33)).toBe("0.33");
    expect(formatShare(1.8300000000000003)).toBe("1.83");
    expect(formatShare(0)).toBe("");
    expect(formatShare(undefined)).toBe("");
  });

  it("技師篩選選項＝區間內全部技師（篩選前）", () => {
    expect(maintenanceTechnicianOptions(rows).map((c) => c.key)).toEqual([
      TECH_A,
      TECH_B,
      TECH_C,
      "name:老 張",
    ]);
  });
});

describe("篩選", () => {
  const rows = [
    src("1", {
      customer_name: "甲公司",
      summary: "排水器不排水",
      technicians: [tech(TECH_A, "甲", 1)],
    }),
    src("2", {
      customer_name: "乙公司",
      summary: "異音",
      model: "SP50VH5",
      technicians: [tech(TECH_B, "乙", 0.5), tech(TECH_A, "甲", 0.5)],
    }),
    src("3", { customer_name: "丙公司", technician: "老張" }),
  ];

  it("關鍵字：客戶、損壞狀況、處理進度（含型號）、不分大小寫", () => {
    const ids = (q: string) =>
      filterMaintenanceRows(rows, { q }).map((r) => r.id);
    expect(ids("乙公司")).toEqual(["2"]);
    expect(ids("排水")).toEqual(["1"]);
    expect(ids("sp50")).toEqual(["2"]);
    expect(ids("  ")).toEqual(["1", "2", "3"]);
    expect(ids("不存在")).toEqual([]);
  });

  it("技師：任一技師符合即列；舊資料文字以 name: key 篩選", () => {
    expect(
      filterMaintenanceRows(rows, { tech: TECH_A }).map((r) => r.id),
    ).toEqual(["1", "2"]);
    expect(
      filterMaintenanceRows(rows, { tech: TECH_B }).map((r) => r.id),
    ).toEqual(["2"]);
    expect(
      filterMaintenanceRows(rows, { tech: "name:老張" }).map((r) => r.id),
    ).toEqual(["3"]);
  });

  it("技師＋關鍵字同時套用；篩選後欄位只含出現的技師（無代號依姓名筆畫排序）", () => {
    const filtered = filterMaintenanceRows(rows, { tech: TECH_B, q: "異音" });
    expect(filtered.map((r) => r.id)).toEqual(["2"]);
    expect(buildMaintenanceTable(filtered).columns.map((c) => c.key)).toEqual([
      TECH_B,
      TECH_A,
    ]);
  });
});

describe("維護完成紀錄 CSV", () => {
  it("欄位：日期（民國）、單號、客戶、損壞、各技師、處理進度；最後一列合計", () => {
    const table = buildMaintenanceTable([
      src("1", {
        report_date: "2026-10-27",
        customer_name: "甲公司",
        summary: "異音",
        service_items: ["routine"],
        technicians: [
          tech(TECH_A, "甲", 0.5, "T01"),
          tech(TECH_B, "乙", 0.5, "T02"),
        ],
      }),
      src("2", {
        report_date: "2026-10-28",
        customer_name: "乙公司",
        technician: "老張",
      }),
    ]);
    const { headers, rows } = maintenanceCsvRows(table);
    expect(headers).toEqual([
      "日期",
      "派工單號",
      "客戶簡稱",
      "損壞狀況",
      "甲",
      "乙",
      "老張（未建檔）",
      "處理進度",
    ]);
    expect(rows[0]).toEqual([
      "115/10/27",
      "X1151001",
      "甲公司",
      "異音",
      "0.5",
      "0.5",
      "",
      "例檢OK",
    ]);
    expect(rows[1].slice(4, 7)).toEqual(["", "", "1"]);
    expect(rows[2]).toEqual(["合計", "2 筆", "", "", "0.5", "0.5", "1", ""]);
  });

  it("rocShortDate", () => {
    expect(rocShortDate("2026-01-05")).toBe("115/01/05");
  });
});
