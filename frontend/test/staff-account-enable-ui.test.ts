import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 員工帳號建立後預設停用（#263）：人員頁籤的狀態與按鈕文字、建立選項、批次摘要、稽核標籤、登入頁的停用訊息。

const signInWithPassword = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    auth: { signInWithPassword, getUser: vi.fn(), signOut: vi.fn() },
  })),
}));
vi.mock("@/app/admin/(protected)/employees/permissions/actions", () => ({
  assignEmployeePositionAction: vi.fn(),
  createStaffAccountAction: vi.fn(),
  createStaffAccountsBatchAction: vi.fn(),
  resetStaffPasswordAction: vi.fn(),
  setStaffLoginDisabledAction: vi.fn(),
}));

import { PeoplePanel } from "@/app/admin/(protected)/employees/permissions/_components/PeoplePanel";
import {
  AUDIT_ACTION_LABELS,
  auditSummary,
} from "@/app/admin/(protected)/employees/permissions/_components/AuditList";
import {
  STAFF_ACCOUNT_STATUS_LABELS,
  batchCreateSummary,
  isUserBannedError,
} from "@/lib/admin/staff-accounts";
import type { StaffPersonRow } from "@/lib/employees/permissions";
import { loginAction } from "@/app/admin/actions";

function person(over: Partial<StaffPersonRow>): StaffPersonRow {
  return {
    employee_id: "00000000-0000-0000-0000-0000000000e1",
    code: "Z901",
    name: "測試員甲",
    title: null,
    position_id: null,
    current: true,
    expected_email: "z901@airexpert.com.tw",
    account_email: "z901@airexpert.com.tw",
    status: "enabled",
    must_change_password: false,
    ...over,
  };
}

function render(people: StaffPersonRow[]): string {
  return renderToStaticMarkup(
    createElement(PeoplePanel, {
      people,
      positions: [],
      includeFormer: false,
    }),
  );
}

describe("人員頁籤：帳號狀態", () => {
  it("狀態標籤為已啟用／已停用（不再是「已建立」「已停用登入」）", () => {
    expect(STAFF_ACCOUNT_STATUS_LABELS.enabled).toBe("已啟用");
    expect(STAFF_ACCOUNT_STATUS_LABELS.disabled).toBe("已停用");
    expect(STAFF_ACCOUNT_STATUS_LABELS.none).toBe("未建立");
  });

  it("已停用且需改密碼：兩個標示都顯示", () => {
    const html = render([
      person({ status: "disabled", must_change_password: true }),
    ]);
    expect(html).toContain("已停用");
    expect(html).toContain("需改密碼");
    expect(html).not.toContain("已啟用");
  });

  it("已啟用、已改過密碼：不顯示需改密碼", () => {
    const html = render([person({ status: "enabled" })]);
    expect(html).toContain("已啟用");
    expect(html).not.toContain("需改密碼");
  });
});

describe("人員頁籤：按鈕文字", () => {
  it("已停用 → 「啟用帳號」；已啟用 → 「停用帳號」；不再出現恢復登入／停用登入", () => {
    const disabled = render([person({ status: "disabled" })]);
    expect(disabled).toContain(">啟用帳號<");
    expect(disabled).not.toContain(">停用帳號<");
    const enabled = render([person({ status: "enabled" })]);
    expect(enabled).toContain(">停用帳號<");
    expect(enabled).not.toContain(">啟用帳號<");
    for (const html of [disabled, enabled]) {
      expect(html).not.toContain("恢復登入");
      expect(html).not.toContain("停用登入");
      expect(html).toContain(">重設為預設密碼<");
    }
  });

  it("未建立 → 「建立帳號」；有「建立後先停用」選項且預設勾選", () => {
    const html = render([person({ status: "none", account_email: null })]);
    expect(html).toContain(">建立帳號<");
    expect(html).toMatch(/批次建立帳號（1 位）/);
    const box = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    expect(box).toHaveLength(1);
    expect(box[0]).toContain('checked=""');
    expect(html).toContain("建立後先停用");
  });

  it("權限管理頁不用原生確認框（改用頁內確認框 useConfirm）", () => {
    const root = join(__dirname, "..");
    const dir = join(root, "src/app/admin/(protected)/employees/permissions");
    const files = (function walk(d: string): string[] {
      return readdirSync(d).flatMap((n) => {
        const p = join(d, n);
        return statSync(p).isDirectory()
          ? walk(p)
          : /\.tsx?$/.test(n)
            ? [p]
            : [];
      });
    })(dir);
    const people = files.find((f) => f.endsWith("PeoplePanel.tsx"));
    expect(people).toBeTruthy();
    const src = readFileSync(people!, "utf8");
    expect(src).toMatch(/useConfirm\(\)/);
    expect(src).not.toMatch(/(?<![\w$])confirm\s*\(|window\s*\.\s*confirm/);
    expect(src).not.toMatch(/<ActionButton\b/);
    expect(relative(root, people!)).toContain("permissions");
  });
});

describe("批次建立的結果摘要", () => {
  it("建立後先停用 → 「已建立 N 個帳號（已停用）」", () => {
    expect(
      batchCreateSummary({
        ok: true,
        disabled: true,
        created: [
          { name: "甲", email: "a@x", disabled: true },
          { name: "乙", email: "b@x", disabled: true },
        ],
        failed: [],
      }),
    ).toBe("已建立 2 個帳號（已停用）。");
  });

  it("未勾選 → 標示已啟用；有失敗者一併列出人數", () => {
    expect(
      batchCreateSummary({
        ok: true,
        disabled: false,
        created: [{ name: "甲", email: "a@x", disabled: false }],
        failed: [{ name: "乙", error: "x" }],
      }),
    ).toBe("已建立 1 個帳號（已啟用），1 位失敗。");
    expect(
      batchCreateSummary({
        ok: true,
        disabled: true,
        created: [],
        failed: [{ name: "乙", error: "x" }],
      }),
    ).toBe("已建立 0 個帳號，1 位失敗。");
  });
});

describe("稽核紀錄", () => {
  it("動作標籤：啟用帳號／停用帳號", () => {
    expect(AUDIT_ACTION_LABELS.login_enable).toBe("啟用帳號");
    expect(AUDIT_ACTION_LABELS.login_disable).toBe("停用帳號");
    expect(AUDIT_ACTION_LABELS.account_create).toBe("建立帳號");
  });

  it("建立帳號時已停用 → 內容標示（建立時已停用）", () => {
    const row = {
      id: 1,
      at: "2026-10-21T00:00:00Z",
      actor_email: "hr@example.invalid",
      actor_role: "authenticated",
      action: "account_create",
      employee_id: null,
      detail: {
        employee_name: "測試員甲",
        email: "z901@airexpert.com.tw",
        login_disabled: true,
      } as Record<string, unknown>,
    };
    expect(auditSummary(row)).toBe(
      "測試員甲 z901@airexpert.com.tw（建立時已停用）",
    );
    expect(
      auditSummary({
        ...row,
        detail: { ...row.detail, login_disabled: false },
      }),
    ).toBe("測試員甲 z901@airexpert.com.tw");
    // 0033 之前的紀錄沒有此欄位
    expect(
      auditSummary({
        ...row,
        detail: { employee_name: "測試員甲", email: "z901@airexpert.com.tw" },
      }),
    ).toBe("測試員甲 z901@airexpert.com.tw");
  });
});

describe("登入頁：停用中的帳號", () => {
  it("Auth user_banned → 提示洽人事主管啟用（不是帳號或密碼錯誤）", async () => {
    expect(isUserBannedError({ code: "user_banned", message: "x" })).toBe(true);
    expect(isUserBannedError({ message: "User is banned" })).toBe(true);
    expect(isUserBannedError({ code: "invalid_credentials" })).toBe(false);
    expect(isUserBannedError(null)).toBe(false);

    const fd = new FormData();
    fd.set("email", "z901@airexpert.com.tw");
    fd.set("password", "00000000");
    signInWithPassword.mockResolvedValueOnce({
      error: { code: "user_banned", message: "User is banned" },
    });
    expect(await loginAction({}, fd)).toEqual({
      error: "此帳號尚未啟用或已停用，請洽人事主管。",
    });
    signInWithPassword.mockResolvedValueOnce({
      error: { code: "invalid_credentials", message: "Invalid" },
    });
    expect(await loginAction({}, fd)).toEqual({
      error: "登入失敗：帳號或密碼錯誤",
    });
  });
});
