import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 員工帳號登入 email 修改（#265）：人員頁籤顯示目前的登入 email（個人 email 也照常顯示狀態與操作）、
// 「修改登入 email」只給員工帳號、稽核標籤與內容、listStaffPeople 以 admin_profile_id 對應帳號且登入 email 以 Auth 為準。

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/app/admin/(protected)/employees/permissions/actions", () => ({
  assignEmployeePositionAction: vi.fn(),
  changeStaffEmailAction: vi.fn(),
  createStaffAccountAction: vi.fn(),
  createStaffAccountsBatchAction: vi.fn(),
  resetStaffPasswordAction: vi.fn(),
  setStaffLoginDisabledAction: vi.fn(),
}));

// listStaffPeople 的依賴
const employeeRows = [
  {
    id: "00000000-0000-0000-0000-0000000000e1",
    code: "Z901",
    name: "測試員甲",
    title: null,
    active: true,
    left_on: null,
    position_id: null,
    admin_profile_id: "00000000-0000-0000-0000-0000000000f1",
  },
  {
    id: "00000000-0000-0000-0000-0000000000e2",
    code: "Z902",
    name: "測試員乙",
    title: null,
    active: true,
    left_on: null,
    position_id: null,
    admin_profile_id: "00000000-0000-0000-0000-0000000000f2",
  },
];
const profiles = [
  {
    id: "00000000-0000-0000-0000-0000000000f1",
    email: "z901@airexpert.com.tw", // 尚未同步（Auth 已是新 email）
    role: "staff",
    must_change_password: false,
  },
  {
    id: "00000000-0000-0000-0000-0000000000f2",
    email: "tester2@example.com",
    role: "staff",
    must_change_password: true,
  },
];
const authUsers: Record<
  string,
  { email: string; banned_until: string | null }
> = {
  "00000000-0000-0000-0000-0000000000f1": {
    email: "tester1@example.com",
    banned_until: null,
  },
  "00000000-0000-0000-0000-0000000000f2": {
    email: "tester2@example.com",
    banned_until: "2126-01-01T00:00:00Z",
  },
};
vi.mock("@/lib/admin/auth", () => ({ hasModule: vi.fn(async () => true) }));
vi.mock("@/lib/fetch-all-rows", () => ({
  fetchAllRows: vi.fn(async () => ({ data: employeeRows, error: null })),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: profiles, error: null }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, ...authUsers[id] } },
          error: null,
        }),
      },
    },
  }),
}));

import { PeoplePanel } from "@/app/admin/(protected)/employees/permissions/_components/PeoplePanel";
import {
  AUDIT_ACTION_LABELS,
  auditSummary,
} from "@/app/admin/(protected)/employees/permissions/_components/AuditList";
import {
  listStaffPeople,
  type StaffPersonRow,
} from "@/lib/employees/permissions";

function person(over: Partial<StaffPersonRow>): StaffPersonRow {
  return {
    employee_id: "00000000-0000-0000-0000-0000000000e1",
    code: "Z901",
    name: "測試員甲",
    title: null,
    position_id: null,
    current: true,
    expected_email: "z901@airexpert.com.tw",
    account_email: "tester@example.com",
    status: "enabled",
    must_change_password: false,
    ...over,
  };
}

function render(people: StaffPersonRow[]): string {
  return renderToStaticMarkup(
    createElement(PeoplePanel, { people, positions: [], includeFormer: false }),
  );
}

describe("人員頁籤：個人 email 的員工帳號", () => {
  it("顯示目前的登入 email（不是員工編號推出的 email），狀態與操作照常", () => {
    for (const status of ["enabled", "disabled"] as const) {
      const html = render([person({ status, must_change_password: true })]);
      expect(html).toContain("tester@example.com");
      expect(html).not.toContain("z901@airexpert.com.tw");
      expect(html).toContain(status === "enabled" ? "已啟用" : "已停用");
      expect(html).toContain("需改密碼");
      expect(html).toContain(">修改登入 email<");
      expect(html).toContain(">重設為預設密碼<");
      expect(html).toContain(
        status === "enabled" ? ">停用帳號<" : ">啟用帳號<",
      );
    }
  });

  it("未建立帳號 → 顯示建立時的 email，沒有「修改登入 email」", () => {
    const html = render([person({ status: "none", account_email: null })]);
    expect(html).toContain("z901@airexpert.com.tw");
    expect(html).not.toContain(">修改登入 email<");
  });

  it("連結非員工帳號 → 沒有「修改登入 email」（由管理員處理）", () => {
    const html = render([
      person({ status: "not_staff", account_email: "shared@example.invalid" }),
    ]);
    expect(html).not.toContain(">修改登入 email<");
    expect(html).toContain("由管理員在人員管理頁處理");
  });

  it("說明文字：建立時為編號 email，之後可改為個人 email；預設密碼風險提示不再只說員工編號", () => {
    const html = render([person({})]);
    expect(html).toContain("建立時的登入 email");
    expect(html).toContain("個人 email");
    const src = readFileSync(
      join(
        __dirname,
        "../src/app/admin/(protected)/employees/permissions/_components/PeoplePanel.tsx",
      ),
      "utf8",
    );
    expect(src).not.toContain("任何知道員工編號的人");
    // 修改登入 email 的確認用頁內確認框
    expect(src).toMatch(/修改登入 email[\s\S]*askConfirm\(\{/);
  });
});

describe("稽核紀錄：修改登入 email", () => {
  it("標籤與內容（遮罩 email）", () => {
    expect(AUDIT_ACTION_LABELS.account_email_change).toBe("修改登入 email");
    expect(
      auditSummary({
        id: 1,
        at: "2026-10-27T00:00:00Z",
        actor_email: null,
        actor_role: "postgres",
        action: "account_email_change",
        employee_id: null,
        detail: {
          employee_name: "測試員甲",
          from_email: "z***@airexpert.com.tw",
          to_email: "t***@example.com",
        },
      }),
    ).toBe("測試員甲：z***@airexpert.com.tw → t***@example.com");
  });
});

describe("listStaffPeople：帳號以 admin_profile_id 對應，登入 email 以 Auth 為準", () => {
  it("個人 email 的帳號照常有狀態；Auth 與 admin_profiles 不一致時顯示 Auth 的 email", async () => {
    const rows = await listStaffPeople();
    expect(rows.map((r) => [r.code, r.account_email, r.status])).toEqual([
      ["Z901", "tester1@example.com", "enabled"],
      ["Z902", "tester2@example.com", "disabled"],
    ]);
    expect(rows[0].expected_email).toBe("z901@airexpert.com.tw");
    expect(rows[1].must_change_password).toBe(true);
  });
});
