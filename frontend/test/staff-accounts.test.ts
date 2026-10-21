import { describe, it, expect } from "vitest";
import {
  DEFAULT_STAFF_PASSWORD,
  MODULE_LABELS,
  POSITION_MODULES,
  isBanned,
  isEmailTakenError,
  isPositionModule,
  staffAccountStatus,
  staffEmailFor,
  staffRpcError,
  validatePasswordChange,
} from "@/lib/admin/staff-accounts";

// 員工帳號（#261）純函式：帳號 email、改密碼規則、職位可用模組、帳號狀態、錯誤訊息。

describe("staffEmailFor（與 DB staff_email_for_code 一致）", () => {
  it("員工編號小寫 + @airexpert.com.tw，去頭尾空白", () => {
    expect(staffEmailFor("Z901")).toBe("z901@airexpert.com.tw");
    expect(staffEmailFor("  ab-1.x_2 ")).toBe("ab-1.x_2@airexpert.com.tw");
  });

  it("沒有編號或含不可用於 email 的字元 → null（不能建立帳號）", () => {
    for (const v of [null, undefined, "", "   ", "測試", "a b", "a@b", "a/b"]) {
      expect(staffEmailFor(v), String(v)).toBeNull();
    }
  });
});

describe("validatePasswordChange", () => {
  const ok = {
    current: "old-pass-1",
    next: "new-pass-1",
    confirm: "new-pass-1",
  };

  it("合法輸入 → null", () => {
    expect(validatePasswordChange(ok)).toBeNull();
    expect(
      validatePasswordChange({
        current: DEFAULT_STAFF_PASSWORD,
        next: "abcdefgh",
        confirm: "abcdefgh",
      }),
    ).toBeNull();
  });

  it("三欄必填", () => {
    expect(validatePasswordChange({ ...ok, current: "" })).toMatch(/目前密碼/);
    expect(validatePasswordChange({ ...ok, next: "", confirm: "" })).toMatch(
      /新密碼/,
    );
  });

  it("至少 8 碼（7 碼拒絕、8 碼通過）", () => {
    expect(
      validatePasswordChange({ ...ok, next: "abcdefg", confirm: "abcdefg" }),
    ).toMatch(/8/);
    expect(
      validatePasswordChange({ ...ok, next: "abcdefgh", confirm: "abcdefgh" }),
    ).toBeNull();
  });

  it("不得為預設密碼 00000000", () => {
    expect(
      validatePasswordChange({
        current: "x-current",
        next: "00000000",
        confirm: "00000000",
      }),
    ).toMatch(/預設密碼/);
  });

  it("兩次輸入需一致", () => {
    expect(validatePasswordChange({ ...ok, confirm: "new-pass-2" })).toMatch(
      /不一致/,
    );
  });

  it("不得與目前密碼相同", () => {
    expect(
      validatePasswordChange({
        current: "same-pass-1",
        next: "same-pass-1",
        confirm: "same-pass-1",
      }),
    ).toMatch(/相同/);
  });

  it("超過 72 bytes 拒絕（bcrypt 會截斷）", () => {
    const long = "a".repeat(73);
    expect(
      validatePasswordChange({ ...ok, next: long, confirm: long }),
    ).toMatch(/過長/);
    const max = "a".repeat(72);
    expect(
      validatePasswordChange({ ...ok, next: max, confirm: max }),
    ).toBeNull();
  });
});

describe("職位可用模組", () => {
  it("只有 erp／service_report／maintenance／employees，不含 hr", () => {
    expect([...POSITION_MODULES]).toEqual([
      "erp",
      "service_report",
      "maintenance",
      "employees",
    ]);
    expect(isPositionModule("hr")).toBe(false);
    expect(isPositionModule("payroll")).toBe(false);
    for (const m of POSITION_MODULES) {
      expect(isPositionModule(m)).toBe(true);
      expect(MODULE_LABELS[m]).toBeTruthy();
    }
  });
});

describe("帳號狀態", () => {
  const now = new Date("2026-10-21T00:00:00Z");

  it("未連結 → none；連結非 staff → not_staff", () => {
    expect(
      staffAccountStatus({
        linked: false,
        role: null,
        mustChangePassword: false,
        bannedUntil: null,
      }),
    ).toBe("none");
    expect(
      staffAccountStatus({
        linked: true,
        role: "office",
        mustChangePassword: false,
        bannedUntil: null,
      }),
    ).toBe("not_staff");
  });

  it("停用登入優先於需改密碼；過期的 banned_until 不算停用", () => {
    expect(
      staffAccountStatus({
        linked: true,
        role: "staff",
        mustChangePassword: true,
        bannedUntil: "2126-01-01T00:00:00Z",
        now,
      }),
    ).toBe("disabled");
    expect(
      staffAccountStatus({
        linked: true,
        role: "staff",
        mustChangePassword: true,
        bannedUntil: "2020-01-01T00:00:00Z",
        now,
      }),
    ).toBe("must_change");
    expect(
      staffAccountStatus({
        linked: true,
        role: "staff",
        mustChangePassword: false,
        bannedUntil: null,
        now,
      }),
    ).toBe("active");
    expect(isBanned("not-a-date", now)).toBe(false);
  });
});

describe("錯誤訊息", () => {
  it("Auth email 已存在", () => {
    expect(isEmailTakenError({ code: "email_exists", message: "x" })).toBe(
      true,
    );
    expect(
      isEmailTakenError({
        message: "A user with this email address has already been registered",
      }),
    ).toBe(true);
    expect(isEmailTakenError({ message: "rate limited" })).toBe(false);
    expect(isEmailTakenError(null)).toBe(false);
  });

  it("RPC 錯誤碼 → 中文；未知訊息保留原文", () => {
    expect(staffRpcError({ message: "employee_code_missing" })).toMatch(
      /員工編號/,
    );
    expect(staffRpcError({ message: "not_staff_account" })).toMatch(/管理員/);
    expect(staffRpcError({ message: "forbidden" })).toMatch(/hr/);
    expect(staffRpcError({ code: "42501", message: "" })).toMatch(/權限/);
    expect(staffRpcError({ message: "boom" }, "建立帳號失敗。")).toBe(
      "建立帳號失敗：boom",
    );
    expect(staffRpcError(null)).toBe("操作失敗，請稍後再試。");
  });
});
