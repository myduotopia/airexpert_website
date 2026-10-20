import { describe, it, expect } from "vitest";

// 員工在職狀態、列表搜尋／篩選、表單 normalize（#257 新欄位）。全部虛構資料。
import {
  distinctTitles,
  filterEmployees,
  matchesEmployeeSearch,
  parseRoleFilter,
  parseStatusFilter,
  sortEmployees,
} from "@/lib/employees/list";
import {
  emptyEmployeeInput,
  employeeInputFromRow,
  isIsoDate,
  normalizeEmployeeInput,
  normalizePhone,
} from "@/lib/employees/normalize";
import {
  employeeStatus,
  isEmployeeCurrent,
  taipeiToday,
} from "@/lib/employees/status";
import type { Employee } from "@/lib/employees/types";

const TODAY = "2026-10-21";

function emp(p: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    code: null,
    roles: [],
    active: true,
    note: null,
    title: null,
    department: null,
    phone: null,
    emergency_contact: null,
    hired_on: null,
    left_on: null,
    admin_profile_id: null,
    created_at: "",
    updated_at: "",
    ...p,
  };
}

const ROWS: Employee[] = [
  emp({
    id: "1",
    code: "Z01",
    name: "測試員甲",
    roles: ["sales"],
    title: "業務",
    phone: "02-0000-0001",
  }),
  emp({
    id: "2",
    code: "Z02",
    name: "測試員乙",
    roles: ["technician"],
    title: "服務",
    left_on: "2026-10-21",
    active: true,
  }),
  emp({
    id: "3",
    code: "Z03",
    name: "測試員丙",
    roles: ["office"],
    title: "內勤",
    active: false,
  }),
  emp({
    id: "4",
    name: "Test Amy",
    roles: [],
    title: "業務",
    left_on: "2026-12-31",
  }),
  emp({
    id: "5",
    code: "Z05",
    name: "測試員戊",
    roles: ["manager"],
    title: "負責人",
  }),
];

describe("taipeiToday", () => {
  it("以台灣時間換日", () => {
    expect(taipeiToday(new Date("2026-10-20T15:59:59Z"))).toBe("2026-10-20");
    expect(taipeiToday(new Date("2026-10-20T16:00:00Z"))).toBe("2026-10-21");
  });
});

describe("在職狀態", () => {
  it("離職日 ≤ 今天 → 離職（即使 active）；未來離職日 → 預定離職（仍在職）", () => {
    expect(isEmployeeCurrent(ROWS[0], TODAY)).toBe(true);
    expect(isEmployeeCurrent(ROWS[1], TODAY)).toBe(false);
    expect(isEmployeeCurrent(ROWS[2], TODAY)).toBe(false);
    expect(isEmployeeCurrent(ROWS[3], TODAY)).toBe(true);
    expect(ROWS.map((e) => employeeStatus(e, TODAY))).toEqual([
      "active",
      "left",
      "inactive",
      "leaving",
      "active",
    ]);
  });
});

describe("列表篩選", () => {
  const ids = (rows: Employee[]) => rows.map((e) => e.id);

  it("預設只列在職；former = 離職＋停用；all = 全部", () => {
    expect(ids(filterEmployees(ROWS, {}, TODAY))).toEqual(["1", "4", "5"]);
    expect(ids(filterEmployees(ROWS, { status: "former" }, TODAY))).toEqual([
      "2",
      "3",
    ]);
    expect(filterEmployees(ROWS, { status: "all" }, TODAY)).toHaveLength(5);
  });

  it("搜尋編號、姓名（不分大小寫）、電話（只比對數字）", () => {
    expect(
      ids(filterEmployees(ROWS, { q: "z05", status: "all" }, TODAY)),
    ).toEqual(["5"]);
    expect(
      ids(filterEmployees(ROWS, { q: "test  amy", status: "all" }, TODAY)),
    ).toEqual(["4"]);
    expect(
      ids(filterEmployees(ROWS, { q: "00000001", status: "all" }, TODAY)),
    ).toEqual(["1"]);
    expect(matchesEmployeeSearch(ROWS[0], "02")).toBe(false); // 少於 3 碼不比對電話
  });

  it("角色（含無角色）、職務", () => {
    expect(ids(filterEmployees(ROWS, { role: "manager" }, TODAY))).toEqual([
      "5",
    ]);
    expect(
      ids(filterEmployees(ROWS, { role: "none", status: "all" }, TODAY)),
    ).toEqual(["4"]);
    expect(
      ids(filterEmployees(ROWS, { title: "業務", status: "all" }, TODAY)),
    ).toEqual(["1", "4"]);
    expect(parseRoleFilter("office")).toBe("office");
    expect(parseRoleFilter("driver")).toBeNull();
    expect(parseStatusFilter("bogus")).toBe("current");
  });

  it("排序：在職在前、再依編號；職務選項依筆數", () => {
    expect(ids(sortEmployees(ROWS, TODAY))).toEqual(["1", "5", "4", "2", "3"]);
    expect(distinctTitles(ROWS)).toEqual(["業務", "內勤", "服務", "負責人"]);
  });
});

describe("normalizeEmployeeInput（#257 欄位）", () => {
  it("職務、電話（全形轉半形、去空白）、緊急聯絡人、日期", () => {
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({
        name: "測試員甲",
        roles: ["office", "manager", "sales"],
        title: "  負責人 ",
        phone: "０２－００００ ０００１",
        emergency_contact: "  測試聯絡人  ",
        hired_on: "2020-01-02",
      }),
      TODAY,
    );
    expect(r).toEqual({
      ok: true,
      row: {
        code: null,
        name: "測試員甲",
        roles: ["sales", "office", "manager"],
        active: true,
        note: null,
        title: "負責人",
        phone: "02-00000001",
        emergency_contact: "測試聯絡人",
        hired_on: "2020-01-02",
        left_on: null,
      },
    });
  });

  it("可不選角色（不出現在選取器）", () => {
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "測試員甲" }),
      TODAY,
    );
    expect(r.ok && r.row.roles).toEqual([]);
  });

  it("離職日 ≤ 今天 → 不在職；未來離職日 → 仍在職", () => {
    const left = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "甲", left_on: TODAY, active: true }),
      TODAY,
    );
    expect(left.ok && left.row.active).toBe(false);
    const future = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "甲", left_on: "2026-12-31" }),
      TODAY,
    );
    expect(future.ok && future.row.active).toBe(true);
  });

  it("日期格式、離職日不可早於到職日、長度", () => {
    expect(
      normalizeEmployeeInput(
        emptyEmployeeInput({ name: "甲", hired_on: "2026-02-30" }),
        TODAY,
      ),
    ).toEqual({ ok: false, error: "到職日格式不正確。" });
    expect(
      normalizeEmployeeInput(
        emptyEmployeeInput({
          name: "甲",
          hired_on: "2022-01-02",
          left_on: "2022-01-01",
        }),
        TODAY,
      ),
    ).toEqual({ ok: false, error: "離職日不可早於到職日。" });
    expect(
      normalizeEmployeeInput(
        emptyEmployeeInput({ name: "甲", title: "職".repeat(51) }),
        TODAY,
      ).ok,
    ).toBe(false);
    expect(
      normalizeEmployeeInput(
        emptyEmployeeInput({ name: "甲", emergency_contact: "聯".repeat(201) }),
        TODAY,
      ).ok,
    ).toBe(false);
  });

  it("isIsoDate／normalizePhone／employeeInputFromRow", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2024/02/01")).toBe(false);
    expect(normalizePhone(" (02) 0000　0001 ")).toBe("(02)00000001");
    expect(employeeInputFromRow(ROWS[1])).toMatchObject({
      title: "服務",
      phone: "",
      left_on: "2026-10-21",
      hired_on: "",
    });
  });
});
