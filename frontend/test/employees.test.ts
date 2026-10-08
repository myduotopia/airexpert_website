import { describe, it, expect } from "vitest";

// 員工主檔（#223）純邏輯：姓名正規化、表單輸入、寫入錯誤訊息、人員欄位整理、選取器顯示舊值。
import {
  cleanEmployeeName,
  employeeNameKey,
  employeeRolesText,
  employeeWriteError,
  EMPLOYEE_CODE_TAKEN_MESSAGE,
  EMPLOYEE_IN_USE_MESSAGE,
  EMPLOYEE_NAME_TAKEN_MESSAGE,
  emptyEmployeeInput,
  normalizeEmployeeInput,
  normalizeEmployeeRef,
} from "@/lib/employees/normalize";
import {
  employeePickerModel,
  employeeRefFromOption,
} from "@/lib/employees/picker";
import type { EmployeeOption } from "@/lib/employees/types";

const ID = {
  wang: "11111111-1111-4111-8111-111111111111",
  lee: "22222222-2222-4222-8222-222222222222",
  amy: "33333333-3333-4333-8333-333333333333",
  gone: "44444444-4444-4444-8444-444444444444",
  both: "55555555-5555-4555-8555-555555555555",
};

const OPTIONS: EmployeeOption[] = [
  { id: ID.wang, code: "S01", name: "王小明", roles: ["sales"], active: true },
  {
    id: ID.lee,
    code: null,
    name: "李師傅",
    roles: ["technician"],
    active: true,
  },
  { id: ID.amy, code: "S02", name: "Amy Wu", roles: ["sales"], active: false },
  {
    id: ID.both,
    code: null,
    name: "陳大華",
    roles: ["sales", "technician"],
    active: true,
  },
];

describe("姓名正規化（與 DB employee_clean_name／employee_name_key 一致）", () => {
  it("連續空白（含全形）併為一個、去頭尾", () => {
    expect(cleanEmployeeName("  王　 小明  ")).toBe("王 小明");
    expect(cleanEmployeeName(null)).toBe("");
  });
  it("key 不分大小寫與空白", () => {
    expect(employeeNameKey("  AMY　 Wu ")).toBe("amy wu");
    expect(employeeNameKey("Amy Wu")).toBe(employeeNameKey("amy  wu"));
    expect(employeeNameKey("王小明")).not.toBe(employeeNameKey("王小名"));
  });
});

describe("normalizeEmployeeInput", () => {
  it("姓名必填", () => {
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "  ", roles: ["sales"] }),
    );
    expect(r).toEqual({ ok: false, error: "請填寫姓名。" });
  });
  it("姓名超過 50 字擋下", () => {
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "王".repeat(51), roles: ["sales"] }),
    );
    expect(r.ok).toBe(false);
  });
  it("至少一個角色；角色依固定順序去重、未知角色忽略", () => {
    expect(normalizeEmployeeInput(emptyEmployeeInput({ name: "甲" })).ok).toBe(
      false,
    );
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({
        name: " 王　小明 ",
        code: " S01 ",
        note: "  ",
        roles: [
          "technician",
          "sales",
          "technician",
          "driver" as unknown as "sales",
        ],
      }),
    );
    expect(r).toEqual({
      ok: true,
      row: {
        code: "S01",
        name: "王 小明",
        roles: ["sales", "technician"],
        active: true,
        note: null,
      },
    });
  });
  it("空白代號存 null；停用保留", () => {
    const r = normalizeEmployeeInput(
      emptyEmployeeInput({ name: "甲", roles: ["sales"], active: false }),
    );
    expect(r.ok && r.row.code).toBeNull();
    expect(r.ok && r.row.active).toBe(false);
  });
});

describe("employeeWriteError", () => {
  it("姓名唯一索引 / 代號唯一索引 / 外鍵 / check", () => {
    expect(
      employeeWriteError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "employees_name_key"',
      }),
    ).toBe(EMPLOYEE_NAME_TAKEN_MESSAGE);
    expect(
      employeeWriteError({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "employees_code_key"',
      }),
    ).toBe(EMPLOYEE_CODE_TAKEN_MESSAGE);
    expect(employeeWriteError({ code: "23503", message: "fk" })).toBe(
      EMPLOYEE_IN_USE_MESSAGE,
    );
    expect(employeeWriteError({ code: "23514", message: "x" })).toContain(
      "至少一個角色",
    );
    expect(employeeWriteError({ message: "boom" })).toBe("儲存失敗：boom");
  });
});

describe("normalizeEmployeeRef（人員欄位寫入前）", () => {
  it("沒有文字就沒有 id", () => {
    expect(normalizeEmployeeRef("  ", ID.wang)).toEqual({
      name: null,
      id: null,
    });
  });
  it("文字去空白；id 需為 UUID", () => {
    expect(normalizeEmployeeRef(" 王小明 ", ID.wang)).toEqual({
      name: "王小明",
      id: ID.wang,
    });
    expect(normalizeEmployeeRef("王小明", "not-a-uuid")).toEqual({
      name: "王小明",
      id: null,
    });
    expect(normalizeEmployeeRef("舊業務", null)).toEqual({
      name: "舊業務",
      id: null,
    });
  });
});

describe("employeePickerModel（選取器選項與目前值）", () => {
  it("只列在職且有該角色的員工", () => {
    const m = employeePickerModel(OPTIONS, { id: null, name: null }, "sales");
    expect(m.options.map((o) => o.id)).toEqual([ID.wang, ID.both]);
    expect(m.selectedId).toBeNull();
    const t = employeePickerModel(
      OPTIONS,
      { id: null, name: null },
      "technician",
    );
    expect(t.options.map((o) => o.id)).toEqual([ID.lee, ID.both]);
  });

  it("目前值在清單中 → 直接選取", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: ID.wang, name: "王小明" },
      "sales",
    );
    expect(m.selectedId).toBe(ID.wang);
    expect(m.options).toHaveLength(2);
  });

  it("目前值已停用 → 仍顯示（不清空），以單據上的文字快照呈現", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: ID.amy, name: "Amy Wu（舊名）" },
      "sales",
    );
    expect(m.selectedId).toBe(ID.amy);
    expect(m.options[0]).toMatchObject({
      id: ID.amy,
      name: "Amy Wu（舊名）",
      offList: true,
    });
    expect(m.options.map((o) => o.id)).toEqual([ID.amy, ID.wang, ID.both]);
  });

  it("目前值沒有該角色（例：師傅被選為業務）→ 仍顯示", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: ID.lee, name: "李師傅" },
      "sales",
    );
    expect(m.selectedId).toBe(ID.lee);
    expect(m.options[0]).toMatchObject({ id: ID.lee, offList: true });
  });

  it("目前 id 不在主檔（讀不到）→ 以文字快照顯示", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: ID.gone, name: "已離職" },
      "sales",
    );
    expect(m.selectedId).toBe(ID.gone);
    expect(m.options[0]).toMatchObject({ id: ID.gone, name: "已離職" });
  });

  it("舊資料只有文字、主檔無此人 → 顯示為舊資料選項，不清空", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: null, name: " 謝億興 " },
      "sales",
    );
    expect(m.selectedId).not.toBeNull();
    const selected = m.options.find((o) => o.id === m.selectedId);
    expect(selected).toMatchObject({ name: "謝億興", legacy: true });
    expect(m.options).toHaveLength(3);
  });

  it("舊資料文字與主檔同名（不分空白大小寫）→ 顯示為該員工", () => {
    const m = employeePickerModel(
      OPTIONS,
      { id: null, name: "  王小明　" },
      "sales",
    );
    expect(m.selectedId).toBe(ID.wang);
    expect(m.options.some((o) => o.legacy)).toBe(false);
    const amy = employeePickerModel(
      OPTIONS,
      { id: null, name: "amy  wu" },
      "sales",
    );
    // 同名但已停用 → 顯示該員工（標示不在清單）
    expect(amy.selectedId).toBe(ID.amy);
    expect(amy.options[0]).toMatchObject({ id: ID.amy, offList: true });
  });

  it("未指定角色 → 列全部在職員工", () => {
    const m = employeePickerModel(OPTIONS, { id: null, name: "" });
    expect(m.options.map((o) => o.id)).toEqual([ID.wang, ID.lee, ID.both]);
    expect(m.selectedId).toBeNull();
  });
});

describe("employeeRefFromOption（選取結果 → 人員欄位）", () => {
  const current = { id: null, name: "謝億興" };
  it("選員工 → id + 姓名", () => {
    expect(employeeRefFromOption(OPTIONS[0], current)).toEqual({
      id: ID.wang,
      name: "王小明",
    });
  });
  it("清除 → 兩者皆空", () => {
    expect(employeeRefFromOption(null, current)).toEqual({
      id: null,
      name: null,
    });
  });
  it("選到舊資料選項 → 不變", () => {
    const m = employeePickerModel(OPTIONS, current, "sales");
    const legacy = m.options.find((o) => o.legacy)!;
    expect(employeeRefFromOption(legacy, current)).toBe(current);
  });
  it("選到不在清單的目前值 → 保留原本文字快照", () => {
    const value = { id: ID.amy, name: "Amy Wu（舊名）" };
    const m = employeePickerModel(OPTIONS, value, "sales");
    expect(employeeRefFromOption(m.options[0], value)).toBe(value);
  });
});

describe("employeeRolesText", () => {
  it("依固定順序", () => {
    expect(employeeRolesText(["technician", "sales"])).toBe("業務、維修師傅");
  });
});
