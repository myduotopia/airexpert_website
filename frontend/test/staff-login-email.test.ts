import { describe, it, expect, vi, beforeEach } from "vitest";

// 員工帳號登入 email 修改（#265）：
//   1. normalizeLoginEmail：去空白、轉小寫，只接受單一 ASCII email（與 DB staff_login_email_valid 一致）。
//   2. maskEmail：本地部分首字 + *** + @網域（與 DB admin_mask_email 一致）。
//   3. changeStaffEmailAction：只限 hr；先 hr_check_staff_email_change（只限 staff、重複、相同）→
//      service_role updateUserById({ email, email_confirm: true }) → hr_apply_staff_email_change（同步 admin_profiles
//      與稽核）；同步失敗要把 Auth email 改回原本的值。

type Res = { data: unknown; error: { message: string; code?: string } | null };

let calls: string[] = [];
let rpcResponses: Record<string, Res | ((args: unknown) => Res)> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let modules: string[] = ["hr"];

const fakeSession = {
  from: vi.fn(() => {
    throw new Error("不應直接讀寫資料表");
  }),
  rpc: vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    calls.push(`rpc:${fn}`);
    const r = rpcResponses[fn];
    if (typeof r === "function") return r(args);
    return r ?? { data: null, error: null };
  }),
};

type AuthErr = { message: string; code?: string; status?: number } | null;
let updateResults: AuthErr[] = [];
const updateUserById = vi.fn<
  (id: string, attrs: unknown) => Promise<{ data: unknown; error: AuthErr }>
>(async (id) => {
  calls.push("auth:updateUserById");
  const error = updateResults.length ? updateResults.shift()! : null;
  return { data: error ? null : { user: { id } }, error };
});
const fakeAdmin = { auth: { admin: { updateUserById } } };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSession),
}));
vi.mock("@/lib/supabase-admin", () => ({ getAdminSupabase: () => fakeAdmin }));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async (m: string) => modules.includes(m)),
}));

import { changeStaffEmailAction } from "@/app/admin/(protected)/employees/permissions/actions";
import {
  maskEmail,
  normalizeLoginEmail,
  staffRpcError,
} from "@/lib/admin/staff-accounts";

const EMP = "00000000-0000-0000-0000-0000000000e1";
const USER = "00000000-0000-0000-0000-0000000000f1";
const OLD = "z901@airexpert.com.tw";

function checkOk(): Res {
  return {
    data: [{ user_id: USER, auth_email: OLD, profile_email: OLD }],
    error: null,
  };
}

beforeEach(() => {
  calls = [];
  rpcResponses = {
    hr_check_staff_email_change: checkOk(),
    hr_apply_staff_email_change: { data: USER, error: null },
  };
  rpcCalls = [];
  modules = ["hr"];
  updateResults = [];
  updateUserById.mockClear();
  fakeSession.rpc.mockClear();
});

describe("normalizeLoginEmail（與 DB staff_login_email_valid 一致）", () => {
  it("去頭尾空白、轉小寫", () => {
    expect(normalizeLoginEmail("  Tester@Example.COM ")).toEqual({
      ok: true,
      email: "tester@example.com",
    });
    expect(normalizeLoginEmail("a.b+c_d%e-f@sub.example-1.co")).toEqual({
      ok: true,
      email: "a.b+c_d%e-f@sub.example-1.co",
    });
    // 不限網域：公司網域與個人信箱都可以
    expect(normalizeLoginEmail("z901@airexpert.com.tw").ok).toBe(true);
  });

  it("空白 → 請輸入", () => {
    for (const v of ["", "   ", null, undefined, 123]) {
      const r = normalizeLoginEmail(v);
      expect(r.ok, String(v)).toBe(false);
    }
    expect(normalizeLoginEmail("  ")).toEqual({
      ok: false,
      error: "請輸入 email。",
    });
  });

  it("多個 email（逗號、分號、空白、換行）→ 只能一個", () => {
    for (const v of [
      "a@example.com,b@example.com",
      "a@example.com; b@example.com",
      "a@example.com b@example.com",
      "a@example.com\nb@example.com",
      "a@example.com，b@example.com",
    ]) {
      expect(normalizeLoginEmail(v), v).toEqual({
        ok: false,
        error: "只能輸入一個 email。",
      });
    }
  });

  it("格式不正確", () => {
    for (const v of [
      "tester",
      "tester@example",
      "tester@example.c",
      "tester@example.c0m",
      "a@b@example.com",
      ".tester@example.com",
      "tester.@example.com",
      "te..ster@example.com",
      "tester@-example.com",
      "tester@example-.com",
      "tester@example..com",
      "ｔester@example.com",
      // KELVIN SIGN（U+212A）經 toLowerCase 會變成 ASCII 的 k：須先擋非 ASCII
      "\u212Aelvin@example.com",
      'tester"x@example.com',
      "@example.com",
      `${"a".repeat(65)}@example.com`,
      `a@${"b".repeat(64)}.com`,
      `a@${`${"b".repeat(60)}.`.repeat(5)}com`,
    ]) {
      const r = normalizeLoginEmail(v);
      expect(r.ok, v).toBe(false);
    }
    expect(normalizeLoginEmail(`${"a".repeat(64)}@example.com`).ok).toBe(true);
    expect(normalizeLoginEmail("tester@example")).toEqual({
      ok: false,
      error: "email 格式不正確。",
    });
  });
});

describe("maskEmail（與 DB admin_mask_email 一致）", () => {
  it("本地部分首字 + *** + @網域", () => {
    expect(maskEmail("tester@example.com")).toBe("t***@example.com");
    expect(maskEmail("  Tester@Example.COM ")).toBe("t***@example.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("a@b@example.com")).toBe("a***@example.com");
  });
  it("沒有本地部分或沒有 @ → ***；空值 → 空字串", () => {
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail(null)).toBe("");
    expect(maskEmail("  ")).toBe("");
  });
});

describe("staffRpcError：0034 的錯誤碼", () => {
  it("email_invalid／email_taken／email_unchanged／auth_email_mismatch 皆有中文訊息", () => {
    for (const code of [
      "email_invalid",
      "email_taken",
      "email_unchanged",
      "auth_email_mismatch",
    ]) {
      const msg = staffRpcError({ message: code });
      expect(msg, code).not.toContain(code);
      expect(msg, code).toMatch(/[一-鿿]/);
    }
    expect(staffRpcError({ message: "email_taken" })).toContain("已是其他帳號");
  });
});

describe("changeStaffEmailAction：權限與輸入", () => {
  it("非 hr 一律拒絕，且不碰 DB／Auth", async () => {
    for (const m of [[], ["erp"], ["employees"], ["service_report"]]) {
      modules = m;
      const res = await changeStaffEmailAction(EMP, "tester@example.com");
      expect(res, m.join(",")).toEqual({
        ok: false,
        error: "沒有人事（hr）權限",
      });
    }
    expect(calls).toEqual([]);
  });

  it("員工 id 不是 uuid → 找不到，不碰 DB／Auth", async () => {
    const res = await changeStaffEmailAction(
      "not-a-uuid",
      "tester@example.com",
    );
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("email 格式不正確 → 不碰 DB／Auth", async () => {
    const res = await changeStaffEmailAction(
      EMP,
      "a@example.com,b@example.com",
    );
    expect(res).toEqual({ ok: false, error: "只能輸入一個 email。" });
    expect(calls).toEqual([]);
  });
});

describe("changeStaffEmailAction：檢查失敗時不改 Auth", () => {
  it.each([
    ["not_staff_account", "連結的不是員工帳號"],
    ["employee_no_account", "尚未建立帳號"],
    ["email_taken", "已是其他帳號"],
    ["email_unchanged", "相同"],
    ["forbidden", "沒有人事（hr）權限"],
  ])("%s", async (code, text) => {
    rpcResponses.hr_check_staff_email_change = {
      data: null,
      error: { message: code, code: "P0001" },
    };
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain(text);
    expect(calls).toEqual(["rpc:hr_check_staff_email_change"]);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("檢查回傳沒有帳號 id → 不改 Auth", async () => {
    rpcResponses.hr_check_staff_email_change = { data: [], error: null };
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("changeStaffEmailAction：成功", () => {
  it("正規化後的 email：檢查 → Auth（email_confirm）→ 同步", async () => {
    const res = await changeStaffEmailAction(EMP, "  Tester@Example.com ");
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([
      "rpc:hr_check_staff_email_change",
      "auth:updateUserById",
      "rpc:hr_apply_staff_email_change",
    ]);
    expect(rpcCalls[0].args).toEqual({
      p_employee_id: EMP,
      p_new_email: "tester@example.com",
    });
    expect(updateUserById).toHaveBeenCalledWith(USER, {
      email: "tester@example.com",
      email_confirm: true,
    });
    expect(rpcCalls[1].args).toEqual({
      p_employee_id: EMP,
      p_new_email: "tester@example.com",
    });
  });

  it("檢查回傳單一物件（非陣列）也可以", async () => {
    rpcResponses.hr_check_staff_email_change = {
      data: { user_id: USER, auth_email: OLD, profile_email: OLD },
      error: null,
    };
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res).toEqual({ ok: true });
  });
});

describe("changeStaffEmailAction：失敗與回滾", () => {
  it("Auth 回 email 已存在 → 明確報錯，不同步也不回滾", async () => {
    updateResults = [
      {
        message: "A user with this email address has already been registered",
        code: "email_exists",
        status: 422,
      },
    ];
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("已是其他帳號");
    expect(calls).toEqual([
      "rpc:hr_check_staff_email_change",
      "auth:updateUserById",
    ]);
  });

  it("Auth 其他錯誤 → 報錯，不同步", async () => {
    updateResults = [{ message: "boom" }];
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("boom");
    expect(calls).not.toContain("rpc:hr_apply_staff_email_change");
  });

  it("同步失敗 → 把 Auth email 改回原本的值", async () => {
    rpcResponses.hr_apply_staff_email_change = {
      data: null,
      error: { message: "email_taken", code: "P0001" },
    };
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("已是其他帳號");
    expect(!res.ok && res.error).toContain("已改回");
    expect(calls).toEqual([
      "rpc:hr_check_staff_email_change",
      "auth:updateUserById",
      "rpc:hr_apply_staff_email_change",
      "auth:updateUserById",
    ]);
    expect(updateUserById).toHaveBeenLastCalledWith(USER, {
      email: OLD,
      email_confirm: true,
    });
  });

  it("同步回傳其他帳號 id → 視為失敗並改回", async () => {
    rpcResponses.hr_apply_staff_email_change = {
      data: "00000000-0000-0000-0000-0000000000ff",
      error: null,
    };
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(updateUserById).toHaveBeenLastCalledWith(USER, {
      email: OLD,
      email_confirm: true,
    });
  });

  it("同步失敗、改回也失敗 → 說明 Auth 已是新 email，重試即可補齊", async () => {
    rpcResponses.hr_apply_staff_email_change = {
      data: null,
      error: { message: "boom", code: "XX000" },
    };
    updateResults = [null, { message: "network" }];
    const res = await changeStaffEmailAction(EMP, "tester@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("改回失敗");
    expect(!res.ok && res.error).toContain("再操作一次");
  });
});
