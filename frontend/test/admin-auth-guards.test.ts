import { describe, it, expect, vi, beforeEach } from "vitest";

// 後台角色解析與守門轉址（新增 erp 角色）。
//   1. ADMIN_ROLES / isAdminRole 是角色的單一事實來源；erp 為合法角色、未知字串不是。
//   2. requireRole：未登入 / 非後台人員 → /admin/login；已登入但角色不符 → /admin
//      （已登入者被丟回登入頁會誤以為 session 過期；也避免 /admin 自己無限轉址）。
//   3. requireAdmin 與上述一致：後台人員但非 admin → /admin，其餘 → /admin/login。
//   4. loginAction 走同一份角色清單，故 erp 帳號登得進後台、未知角色會被登出。
// redirect 在 Next.js 會 throw；此處以 throw Error('REDIRECT:<path>') 模擬，
// 才能驗證「守門後不會繼續往下跑」。

const { redirectSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

let sessionUser: { id: string; email: string } | null = null;
let profileRole: string | null = null;
let signInError: { message: string } | null = null;
const signOutSpy = vi.fn(async () => ({ error: null }));

const fakeSupabase = {
  auth: {
    getUser: async () => ({ data: { user: sessionUser } }),
    signInWithPassword: async () => ({ error: signInError }),
    signOut: signOutSpy,
  },
  // is_admin() 自 0005 起等同 role='admin'。
  rpc: async (fn: string) => ({
    data: fn === "is_admin" ? profileRole === "admin" : null,
    error: null,
  }),
  // 這些測試只會讀 admin_profiles 一張表，故不需依表名分流。
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: profileRole === null ? null : { role: profileRole },
          error: null,
        }),
      }),
    }),
  }),
};

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  ADMIN_ROLES,
  isAdminRole,
  getCurrentUserRole,
  requireAdmin,
  requireRole,
} from "@/lib/admin/auth";
import { loginAction } from "@/app/admin/actions";

/** 執行 fn，回傳它 redirect 到的路徑；沒 redirect 回 null。 */
async function redirectedTo(
  fn: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1];
  }
}

function login(role: string | null, hasSession = true): () => Promise<unknown> {
  profileRole = role;
  sessionUser = hasSession ? { id: "u-1", email: "someone@example.com" } : null;
  return async () => {
    const fd = new FormData();
    fd.set("email", "someone@example.com");
    fd.set("password", "pw-12345678");
    return loginAction({}, fd);
  };
}

beforeEach(() => {
  sessionUser = null;
  profileRole = null;
  signInError = null;
  signOutSpy.mockClear();
  redirectSpy.mockClear();
});

describe("角色清單（ADMIN_ROLES / isAdminRole）", () => {
  it("包含 erp，且四個角色皆為合法值", () => {
    expect([...ADMIN_ROLES]).toEqual(["admin", "seo_manager", "office", "erp"]);
    for (const r of ADMIN_ROLES) expect(isAdminRole(r)).toBe(true);
  });

  it("未知字串 / 非字串不是合法角色", () => {
    for (const v of ["erp_admin", "ERP", "", "viewer", null, undefined, 1]) {
      expect(isAdminRole(v)).toBe(false);
    }
  });
});

describe("getCurrentUserRole（admin_profiles.role 為自由文字，需過濾）", () => {
  beforeEach(() => {
    sessionUser = { id: "u-1", email: "someone@example.com" };
  });

  it("接受 erp 及其他既有角色", async () => {
    for (const role of ADMIN_ROLES) {
      profileRole = role;
      expect(await getCurrentUserRole()).toBe(role);
    }
  });

  it("未知角色 / 無 profile 列 → null", async () => {
    profileRole = "erp_readonly";
    expect(await getCurrentUserRole()).toBeNull();
    profileRole = null;
    expect(await getCurrentUserRole()).toBeNull();
  });

  it("未登入 → null（不查 admin_profiles）", async () => {
    sessionUser = null;
    profileRole = "erp";
    expect(await getCurrentUserRole()).toBeNull();
  });
});

describe("requireRole 轉址目標", () => {
  it("未登入 → /admin/login", async () => {
    sessionUser = null;
    expect(await redirectedTo(() => requireRole(["office"]))).toBe(
      "/admin/login",
    );
  });

  it("已登入但不是後台人員（無 admin_profiles 列）→ /admin/login（不可導 /admin，會無限轉址）", async () => {
    sessionUser = { id: "u-1", email: "x@example.com" };
    profileRole = null;
    expect(await redirectedTo(() => requireRole([...ADMIN_ROLES]))).toBe(
      "/admin/login",
    );
  });

  it("已登入的後台人員但角色不符 → /admin（不是登入頁）", async () => {
    sessionUser = { id: "u-1", email: "erp@example.com" };
    profileRole = "erp";
    // erp 進保養記錄卡（requireRole(['office'])）
    expect(await redirectedTo(() => requireRole(["office"]))).toBe("/admin");
    profileRole = "office";
    expect(
      await redirectedTo(() => requireRole(["admin", "seo_manager"])),
    ).toBe("/admin");
  });

  it("角色符合 → 回傳角色且不轉址（erp 可進後台殼層）", async () => {
    sessionUser = { id: "u-1", email: "erp@example.com" };
    profileRole = "erp";
    expect(await requireRole([...ADMIN_ROLES])).toBe("erp");
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});

describe("requireAdmin 轉址目標", () => {
  it("admin → 回傳 user，不轉址", async () => {
    sessionUser = { id: "u-1", email: "admin@example.com" };
    profileRole = "admin";
    const user = await requireAdmin();
    expect(user.id).toBe("u-1");
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it("已登入的後台人員但非 admin → /admin", async () => {
    sessionUser = { id: "u-1", email: "erp@example.com" };
    for (const role of ["erp", "office", "seo_manager"]) {
      profileRole = role;
      expect(await redirectedTo(() => requireAdmin())).toBe("/admin");
    }
  });

  it("未登入 → /admin/login", async () => {
    sessionUser = null;
    expect(await redirectedTo(() => requireAdmin())).toBe("/admin/login");
  });
});

describe("loginAction 的後台人員檢查（與 isAdminRole 同一份清單）", () => {
  it("erp 角色可登入 → 轉到 /admin，不登出", async () => {
    expect(await redirectedTo(login("erp"))).toBe("/admin");
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("其他既有角色仍可登入", async () => {
    for (const role of ["admin", "seo_manager", "office"]) {
      expect(await redirectedTo(login(role))).toBe("/admin");
    }
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("未知角色 → 立即登出並回錯誤，不進後台", async () => {
    const res = (await login("erp_readonly")()) as { error?: string };
    expect(res.error).toBe("此帳號沒有後台權限");
    expect(signOutSpy).toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it("無 admin_profiles 列 → 同樣被擋下", async () => {
    const res = (await login(null)()) as { error?: string };
    expect(res.error).toBe("此帳號沒有後台權限");
    expect(signOutSpy).toHaveBeenCalled();
  });
});
