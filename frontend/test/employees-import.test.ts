import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

// 員工匯入（#257）純邏輯測試。全部用虛構資料（測試員甲…、Z999999999），不讀任何真實檔案。
//   1. 標題列偵測（含「員工編號」的列）、預設欄位對應、對應錯誤
//   2. 解析：空白列略過、電話正規化、日期（西元／民國／無法解析）、敏感欄位收集
//   3. 職務 → 角色（業務／業務人員／服務／內勤／會計／負責人；其他 → 無角色）
//   4. 比對既有員工：先編號、再正規化姓名；補編號；角色聯集；空白不清除；不變；各種略過原因
//   5. 在職／離職：keep／active／inactive／compare（A = 在職、B = 全部）；離職日 ≤ 今天 → 離職
//   6. 非 hr：敏感欄位丟棄並標示；stripPrivate；planToOps；server 端資料整理
//   7. SheetJS 讀檔（xlsx、csv）
import {
  buildImportPlan,
  collectSheetKeys,
  defaultMapping,
  detectHeaderRow,
  mappingError,
  parseDateCell,
  parseRows,
  planToOps,
  sanitizeImportRequest,
  stripPrivate,
  summarizePlan,
  titleToRoles,
  toSheetKeys,
  type ExistingEmployee,
  type ImportRow,
  type PlanOptions,
} from "@/lib/employees/import";
import { readWorkbook } from "@/lib/employees/sheet";

const TODAY = "2026-10-21";
const HEADER = [
  "員工編號",
  "員工名稱",
  "戶籍地址",
  "身份證號",
  "聯絡人",
  "聯絡電話",
  "職務",
  "學歷",
  "經歷",
  "婚姻",
];

/** 虛構工作表：前面有一列報表標題與一列空白（標題列在第 3 列）。 */
function sheet(rows: string[][]): string[][] {
  return [["員工資料表（測試）"], [], HEADER, ...rows];
}

const SHEET_ALL = sheet([
  [
    "Z01",
    "測試員甲",
    "臺北市測試區虛構路1號",
    "Z999999999",
    "",
    "02 0000 0001",
    "業務",
    "",
    "",
    "未婚",
  ],
  [
    "Z02",
    "測試員乙",
    "",
    "Y888888888",
    "測試聯絡人 0900000000",
    "0900-000-002",
    "服務",
    "",
    "",
    "",
  ],
  [],
  ["Z03", "測試員丙", "", "", "", "", "內勤", "", "", ""],
  ["Z04", "測試員丁", "", "", "", "", "會計", "", "", ""],
  ["Z05", "測試員戊", "", "", "", "", "負責人", "", "", ""],
  ["Z06", "測試員己", "", "", "", "", "業務人員", "", "", ""],
  ["Z07", "測試員庚", "", "", "", "", "", "虛構大學", "虛構公司", ""],
]);
const SHEET_ACTIVE = sheet([
  ["Z01", "測試員甲", "", "", "", "", "業務", "", "", ""],
  ["Z03", "測試員丙", "", "", "", "", "內勤", "", "", ""],
]);

const HR: PlanOptions = { status: "keep", canWritePrivate: true };
const NON_HR: PlanOptions = { status: "keep", canWritePrivate: false };

function rowsOf(grid: string[][]): ImportRow[] {
  const h = detectHeaderRow(grid);
  return parseRows(grid, h, defaultMapping(grid[h]));
}

function existing(
  patch: Partial<ExistingEmployee> & { name: string },
): ExistingEmployee {
  return {
    id: `00000000-0000-0000-0000-${String(Math.abs(hash(patch.name)))
      .padStart(12, "0")
      .slice(0, 12)}`,
    code: null,
    roles: [],
    active: true,
    title: null,
    phone: null,
    hired_on: null,
    left_on: null,
    ...patch,
  };
}
function hash(s: string): number {
  let h = 7;
  for (const c of s) h = (h * 31 + c.codePointAt(0)!) % 1_000_000_007;
  return h;
}

describe("標題列與欄位對應", () => {
  it("偵測含「員工編號」的列（跳過報表標題與空白列）", () => {
    expect(detectHeaderRow(SHEET_ALL)).toBe(2);
    expect(detectHeaderRow([[" 員工 編號 "]])).toBe(0);
    expect(detectHeaderRow([["姓名"], ["電話"]])).toBe(-1);
  });

  it("預設對應：#257 欄位對應表；聯絡人原文為敏感欄位", () => {
    expect(defaultMapping(HEADER)).toEqual([
      "code",
      "name",
      "household_address",
      "national_id",
      "emergency_contact",
      "phone",
      "title",
      "education",
      "experience",
      "marital",
    ]);
    expect(defaultMapping(["員工編號", "備註", "員工編號"])).toEqual([
      "code",
      null,
      null,
    ]);
  });

  it("對應錯誤：缺姓名、重複對應", () => {
    expect(mappingError(["code", null])).toBe("請指定「姓名」欄。");
    expect(mappingError(["name", "name"])).toContain("對應到兩個欄位");
    expect(mappingError(["code", "name"])).toBeNull();
  });
});

describe("parseRows", () => {
  it("略過空白列；列號對照工作表；電話去空白；敏感欄位收集", () => {
    const rows = rowsOf(SHEET_ALL);
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({
      line: 4,
      code: "Z01",
      name: "測試員甲",
      title: "業務",
      phone: "0200000001",
      private: {
        household_address: "臺北市測試區虛構路1號",
        national_id: "Z999999999",
        marital: "未婚",
      },
    });
    expect(rows[1].phone).toBe("0900-000-002");
    expect(rows[1].private.emergency_contact).toBe("測試聯絡人 0900000000");
    expect(rows[2].line).toBe(7);
  });

  it("日期欄：西元、民國、空白、無法解析（提醒並略過此欄）", () => {
    const grid = [
      ["員工編號", "姓名", "到職日", "離職日"],
      ["Z11", "測試員甲", "2020/1/2", ""],
      ["Z12", "測試員乙", "109/03/04", "2021-06-30"],
      ["Z13", "測試員丙", "某天", "2026-02-30"],
    ];
    const rows = parseRows(grid, 0, defaultMapping(grid[0]));
    expect(rows[0]).toMatchObject({ hired_on: "2020-01-02", left_on: null });
    expect(rows[1]).toMatchObject({
      hired_on: "2020-03-04",
      left_on: "2021-06-30",
    });
    expect(rows[2].hired_on).toBeUndefined();
    expect(rows[2].left_on).toBeUndefined();
    expect(rows[2].warnings).toHaveLength(2);
  });

  it("parseDateCell：Excel 序號、年月日", () => {
    expect(parseDateCell("43831")).toBe("2020-01-01");
    expect(parseDateCell("2020年1月2日")).toBe("2020-01-02");
    expect(parseDateCell("")).toBeNull();
    expect(parseDateCell("abc")).toBeUndefined();
  });
});

describe("職務 → 角色", () => {
  it("#257 第 6 點的對應；其他 → 無角色", () => {
    expect(titleToRoles("業務")).toEqual(["sales"]);
    expect(titleToRoles(" 業務人員 ")).toEqual(["sales"]);
    expect(titleToRoles("服務")).toEqual(["technician"]);
    expect(titleToRoles("內勤")).toEqual(["office"]);
    expect(titleToRoles("會計")).toEqual(["office"]);
    expect(titleToRoles("負責人")).toEqual(["manager"]);
    expect(titleToRoles("倉管")).toEqual([]);
    expect(titleToRoles(null)).toEqual([]);
  });
});

describe("buildImportPlan：比對既有員工", () => {
  // 既有：2 位由 0027 回填的業務（只有姓名、沒有編號），1 位已有編號
  const EXISTING = [
    existing({ name: "測試員甲", roles: ["sales"] }),
    existing({ name: "測試員己", roles: ["sales"], phone: "0911" }),
    existing({
      name: "測試員丙",
      code: "Z03",
      roles: ["office"],
      title: "內勤",
    }),
  ];

  it("依姓名對到既有業務 → 補編號；依編號對到 → 不變；其餘新增", () => {
    const plan = buildImportPlan(rowsOf(SHEET_ALL), EXISTING, HR, TODAY);
    const by = (name: string) => plan.find((r) => r.name === name)!;
    expect(by("測試員甲")).toMatchObject({
      action: "update",
      matchedBy: "name",
      employeeId: EXISTING[0].id,
      patch: { code: "Z01", title: "業務" },
      roles: ["sales"],
    });
    expect(by("測試員丙")).toMatchObject({
      action: "unchanged",
      matchedBy: "code",
      patch: {},
    });
    // 業務人員 → sales；既有電話不被空白清除，但編號補上
    expect(by("測試員己").patch).toEqual({ code: "Z06", title: "業務人員" });
    expect(by("測試員乙")).toMatchObject({
      action: "insert",
      roles: ["technician"],
      active: true,
    });
    expect(by("測試員庚")).toMatchObject({
      action: "insert",
      noRole: true,
      roles: [],
    });
    expect(summarizePlan(plan)).toMatchObject({
      insert: 4,
      update: 2,
      unchanged: 1,
      skip: 0,
      noRole: 1,
    });
  });

  it("角色取聯集（不移除既有角色）", () => {
    const ex = [
      existing({ name: "測試員甲", code: "Z01", roles: ["technician"] }),
    ];
    const plan = buildImportPlan(rowsOf(SHEET_ALL).slice(0, 1), ex, HR, TODAY);
    expect(plan[0].patch.roles).toEqual(["sales", "technician"]);
  });

  it("重跑：以匯入後的結果再比對 → 全部不變", () => {
    const rows = rowsOf(SHEET_ALL);
    const first = buildImportPlan(rows, EXISTING, HR, TODAY);
    const after: ExistingEmployee[] = [...EXISTING];
    const ops = planToOps(
      first,
      (() => {
        let n = 0;
        return () =>
          `00000000-0000-0000-0000-0000000009${String(++n).padStart(2, "0")}`;
      })(),
    );
    for (const u of ops.updates) {
      const i = after.findIndex((e) => e.id === u.id);
      after[i] = { ...after[i], ...u.patch } as ExistingEmployee;
    }
    for (const ins of ops.inserts) {
      after.push({
        id: ins.id,
        code: ins.code ?? null,
        name: ins.name,
        roles: ins.roles ?? [],
        active: ins.active ?? true,
        title: ins.title ?? null,
        phone: ins.phone ?? null,
        hired_on: ins.hired_on ?? null,
        left_on: ins.left_on ?? null,
      });
    }
    const second = buildImportPlan(rows, after, HR, TODAY);
    expect(second.every((r) => r.action === "unchanged")).toBe(true);
  });

  it("略過：姓名空白、檔案內編號／姓名重複、編號與姓名對到不同人、姓名對到但編號不同", () => {
    const grid = [
      ["員工編號", "員工名稱"],
      ["Z21", ""],
      ["Z22", "測試員甲"],
      ["Z22", "測試員乙"],
      ["Z23", "測試員甲"],
      ["Z03", "測試員辛"],
      ["Z99", "測試員丙"],
    ];
    const ex = [
      existing({ name: "測試員丙", code: "Z03" }),
      existing({ name: "測試員辛" }),
    ];
    const plan = buildImportPlan(
      parseRows(grid, 0, defaultMapping(grid[0])),
      ex,
      HR,
      TODAY,
    );
    expect(plan.map((r) => [r.action, r.reason])).toEqual([
      ["skip", "姓名空白"],
      ["insert", null],
      ["skip", "員工編號與第 3 列重複"],
      ["skip", "姓名與第 3 列重複"],
      ["skip", expect.stringContaining("姓名卻對到另一位員工")],
      ["skip", expect.stringContaining("其員工編號為 Z03")],
    ]);
  });
});

describe("buildImportPlan：在職／離職", () => {
  const rows = rowsOf(SHEET_ALL);

  it("compare：A = 在職、B = 全部 → 只在 B 的設為離職", () => {
    const keys = collectSheetKeys(SHEET_ACTIVE)!;
    expect([...keys.codes]).toEqual(["z01", "z03"]);
    const plan = buildImportPlan(
      rows,
      [],
      { ...HR, status: "compare", compareKeys: keys },
      TODAY,
    );
    expect(plan.filter((r) => r.active).map((r) => r.name)).toEqual([
      "測試員甲",
      "測試員丙",
    ]);
    expect(plan.filter((r) => r.active === false)).toHaveLength(5);
  });

  it("compare 也以姓名比對（在職表沒有編號時）", () => {
    const keys = toSheetKeys({ codes: [], names: [" 測試員乙 "] });
    const plan = buildImportPlan(
      rows,
      [],
      { ...HR, status: "compare", compareKeys: keys },
      TODAY,
    );
    expect(plan.find((r) => r.name === "測試員乙")!.active).toBe(true);
    expect(plan.find((r) => r.name === "測試員甲")!.active).toBe(false);
  });

  it("inactive／active：整張表設定；既有員工狀態變更才寫入", () => {
    const ex = [
      existing({
        name: "測試員甲",
        code: "Z01",
        roles: ["sales"],
        title: "業務",
        phone: "0200000001",
        active: true,
      }),
    ];
    const off = buildImportPlan(
      rows.slice(0, 1),
      ex,
      { ...HR, status: "inactive" },
      TODAY,
    );
    expect(off[0]).toMatchObject({
      action: "update",
      patch: { active: false },
      active: false,
    });
    const keep = buildImportPlan(rows.slice(0, 1), ex, HR, TODAY);
    expect(keep[0]).toMatchObject({ action: "unchanged", active: true });
    const on = buildImportPlan(
      rows.slice(0, 1),
      [{ ...ex[0], active: false }],
      { ...HR, status: "active" },
      TODAY,
    );
    expect(on[0].patch).toEqual({ active: true });
  });

  it("離職日 ≤ 今天 → 離職（即使選「設為在職」）並提醒", () => {
    const grid = [
      ["員工編號", "姓名", "離職日"],
      ["Z31", "測試員甲", "2026-10-21"],
      ["Z32", "測試員乙", "2026-12-31"],
    ];
    const r = parseRows(grid, 0, defaultMapping(grid[0]));
    const plan = buildImportPlan(r, [], { ...HR, status: "active" }, TODAY);
    expect(plan.map((p) => p.active)).toEqual([false, true]);
    const ex = [
      existing({
        name: "測試員甲",
        code: "Z31",
        left_on: "2025-01-01",
        active: false,
      }),
    ];
    const upd = buildImportPlan(
      r.slice(0, 1),
      ex,
      { ...HR, status: "active" },
      TODAY,
    );
    expect(upd[0].active).toBe(false);
    expect(upd[0].warnings.join()).toContain("已有離職日");
  });

  it("離職日早於到職日 → 略過", () => {
    const grid = [
      ["員工編號", "姓名", "到職日", "離職日"],
      ["Z41", "測試員甲", "2022-01-02", "2022-01-01"],
    ];
    const plan = buildImportPlan(
      parseRows(grid, 0, defaultMapping(grid[0])),
      [],
      HR,
      TODAY,
    );
    expect(plan[0]).toMatchObject({
      action: "skip",
      reason: "離職日早於到職日",
    });
  });
});

describe("敏感欄位與權限", () => {
  const rows = rowsOf(SHEET_ALL);

  it("非 hr：計畫不含敏感欄位、標示「需要人事權限」", () => {
    const plan = buildImportPlan(rows, [], NON_HR, TODAY);
    expect(plan.every((r) => Object.keys(r.private).length === 0)).toBe(true);
    expect(plan.filter((r) => r.privateDropped).map((r) => r.name)).toEqual([
      "測試員甲",
      "測試員乙",
      "測試員庚",
    ]);
    expect(summarizePlan(plan)).toMatchObject({
      privateRows: 0,
      privateDropped: 3,
    });
    expect(planToOps(plan, () => "x").private).toEqual([]);
  });

  it("hr：敏感欄位隨新增／更新／不變的員工送出（以員工 id 指向）", () => {
    const ex = [
      existing({
        name: "測試員甲",
        code: "Z01",
        roles: ["sales"],
        title: "業務",
        phone: "0200000001",
      }),
    ];
    const plan = buildImportPlan(rows.slice(0, 2), ex, HR, TODAY);
    expect(plan[0].action).toBe("unchanged");
    const ops = planToOps(plan, () => "00000000-0000-0000-0000-000000000abc");
    expect(ops.private).toEqual([
      {
        employee_id: ex[0].id,
        household_address: "臺北市測試區虛構路1號",
        national_id: "Z999999999",
        marital: "未婚",
      },
      {
        employee_id: "00000000-0000-0000-0000-000000000abc",
        national_id: "Y888888888",
        emergency_contact: "測試聯絡人 0900000000",
      },
    ]);
    expect(ops.inserts[0]).toMatchObject({
      id: "00000000-0000-0000-0000-000000000abc",
      name: "測試員乙",
    });
    expect(JSON.stringify(ops.inserts)).not.toContain("Y888888888");
  });

  it("stripPrivate：送出前在 client 端丟棄（原資料不變）", () => {
    const stripped = stripPrivate(rows);
    expect(stripped.every((r) => Object.keys(r.private).length === 0)).toBe(
      true,
    );
    expect(JSON.stringify(stripped)).not.toContain("Z999999999");
    expect(rows[0].private.national_id).toBe("Z999999999");
  });

  it("sanitizeImportRequest：格式檢查、丟棄未知欄位與非字串值", () => {
    expect(sanitizeImportRequest(null)).toBeNull();
    expect(sanitizeImportRequest({ rows: [], status: "bogus" })).toBeNull();
    expect(
      sanitizeImportRequest({ rows: [{ line: 0, name: "x" }], status: "keep" }),
    ).toBeNull();
    expect(sanitizeImportRequest({ rows: [], status: "compare" })).toBeNull();
    const req = sanitizeImportRequest({
      rows: [
        {
          line: 4,
          code: " Z01 ",
          name: " 測試員甲 ",
          phone: "02 0000",
          hired_on: "2020-13-01",
          left_on: null,
          private: { national_id: "Z999999999", salary: "1", marital: 3 },
          injected: true,
        },
      ],
      status: "keep",
    })!;
    expect(req.rows[0]).toEqual({
      line: 4,
      code: "Z01",
      name: "測試員甲",
      title: null,
      phone: "020000",
      left_on: null,
      private: { national_id: "Z999999999" },
      warnings: [],
    });
  });
});

describe("readWorkbook（SheetJS）", () => {
  it("xlsx：多工作表、保留空白列與列號", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(SHEET_ACTIVE),
      "A",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(SHEET_ALL), "B");
    const buf = XLSX.write(wb, {
      type: "array",
      bookType: "xlsx",
    }) as ArrayBuffer;
    const sheets = readWorkbook(XLSX, buf);
    expect(sheets.map((s) => s.name)).toEqual(["A", "B"]);
    const rows = rowsOf(sheets[1].grid);
    expect(rows.map((r) => r.line)).toEqual(
      rowsOf(SHEET_ALL).map((r) => r.line),
    );
    expect(rows[0].private.national_id).toBe("Z999999999");
  });

  it("csv（UTF-8）：電話保留開頭 0", () => {
    const csv = "員工編號,員工名稱,聯絡電話\nZ01,測試員甲,0900000001\n";
    const sheets = readWorkbook(XLSX, new TextEncoder().encode(csv));
    const rows = rowsOf(sheets[0].grid);
    expect(rows[0]).toMatchObject({
      code: "Z01",
      name: "測試員甲",
      phone: "0900000001",
    });
  });
});

describe("decodeCsv", () => {
  it("UTF-8 BOM 與 Big5", async () => {
    const { decodeCsv } = await import("@/lib/employees/sheet");
    const bom = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...new TextEncoder().encode("員工編號"),
    ]);
    expect(decodeCsv(bom).replace(/^﻿/, "")).toBe("員工編號");
    // 「測試」的 Big5 編碼
    expect(decodeCsv(new Uint8Array([0xb4, 0xfa, 0xb8, 0xd5]))).toBe("測試");
  });
});
