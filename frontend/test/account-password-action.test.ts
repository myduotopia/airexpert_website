import { describe, it, expect, vi, beforeEach } from "vitest";

// 帳號設定頁改密碼（#261）：
//   1. 只有 staff（requireRole(['staff'])；其他角色被導離，不碰 Auth）。
//   2. 輸入規則不通過 → 不重新驗證、不改密碼。
//   3. 以目前密碼重新驗證（verifyPassword）；錯誤或驗證到別的帳號 → 拒絕。
//   4. 成功：service_role 改密碼 → staff_complete_password_change（清除 must_change_password）；順序不可顛倒，
//      改密碼失敗時不得解鎖。

const { redirectSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let role = "staff";
let sessionUser: { id: string; email: string } | null = {
  id: "staff-1",
  email: "z901@airexpert.com.tw",
};
vi.mock("@/lib/admin/auth", () => ({
  requireRole: vi.fn(async (allowed: string[]) => {
    if (!allowed.includes(role)) redirectSpy("/admin");
    return role;
  }),
  getSessionUser: vi.fn(async () => sessionUser),
}));

const calls: string[] = [];
type VerifyResult = { ok: true; userId: string } | { ok: false };
const verifyPassword = vi.fn<
  (email: string, pw: string) => Promise<VerifyResult>
>(async () => {
  calls.push("verify");
  return { ok: true, userId: "staff-1" };
});
vi.mock("@/lib/admin/password-verify", () => ({
  verifyPassword: (email: string, pw: string) => verifyPassword(email, pw),
}));

type ErrRes<T> = { data: T; error: { message: string } | null };
const updateUserById = vi.fn<
  (id: string, attrs: unknown) => Promise<ErrRes<object>>
>(async () => {
  calls.push("update");
  return { data: {}, error: null };
});
const rpc = vi.fn<(fn: string, args: unknown) => Promise<ErrRes<null>>>(
  async () => {
    calls.push("unlock");
    return { data: null, error: null };
  },
);
vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => ({ auth: { admin: { updateUserById } }, rpc }),
}));

import { changePasswordAction } from "@/app/admin/(account)/settings/account/actions";

function form(current: string, next: string, confirm = next): FormData {
  const fd = new FormData();
  fd.set("current_password", current);
  fd.set("new_password", next);
  fd.set("confirm_password", confirm);
  return fd;
}

beforeEach(() => {
  role = "staff";
  sessionUser = { id: "staff-1", email: "z901@airexpert.com.tw" };
  calls.length = 0;
  verifyPassword.mockClear();
  updateUserById.mockClear();
  rpc.mockClear();
  redirectSpy.mockClear();
});

describe("changePasswordAction", () => {
  it("成功：驗證目前密碼 → 改密碼 → 解除必改密碼（順序固定）", async () => {
    const res = await changePasswordAction({}, form("00000000", "new-pass-1"));
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual(["verify", "update", "unlock"]);
    expect(verifyPassword).toHaveBeenCalledWith(
      "z901@airexpert.com.tw",
      "00000000",
    );
    expect(updateUserById).toHaveBeenCalledWith("staff-1", {
      password: "new-pass-1",
    });
    expect(rpc).toHaveBeenCalledWith("staff_complete_password_change", {
      p_user_id: "staff-1",
    });
  });

  it("非 staff（admin／office／erp／hr／seo_manager）→ 導離，不碰 Auth", async () => {
    for (const r of ["admin", "office", "erp", "hr", "seo_manager"]) {
      role = r;
      await expect(
        changePasswordAction({}, form("x-current", "new-pass-1")),
      ).rejects.toThrow("REDIRECT:/admin");
    }
    expect(calls).toEqual([]);
  });

  it("輸入規則不通過 → 不重新驗證、不改密碼", async () => {
    for (const fd of [
      form("00000000", "short"),
      form("00000000", "00000000"),
      form("00000000", "new-pass-1", "new-pass-2"),
      form("same-pass-1", "same-pass-1"),
      form("", "new-pass-1"),
    ]) {
      const res = await changePasswordAction({}, fd);
      expect(res.error).toBeTruthy();
    }
    expect(calls).toEqual([]);
  });

  it("目前密碼錯誤 → 不改密碼", async () => {
    verifyPassword.mockResolvedValueOnce({ ok: false });
    const res = await changePasswordAction(
      {},
      form("wrong-pass", "new-pass-1"),
    );
    expect(res).toEqual({ error: "目前密碼不正確。" });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("驗證到的不是同一個帳號 → 拒絕", async () => {
    verifyPassword.mockResolvedValueOnce({ ok: true, userId: "someone-else" });
    const res = await changePasswordAction({}, form("x-current", "new-pass-1"));
    expect(res.error).toBe("目前密碼不正確。");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("改密碼失敗 → 不解除必改密碼", async () => {
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "Password is too weak" },
    });
    const res = await changePasswordAction({}, form("00000000", "new-pass-1"));
    expect(res.error).toMatch(/Password is too weak/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("解除失敗 → 回錯誤（提示目前密碼已是新密碼）", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await changePasswordAction({}, form("00000000", "new-pass-1"));
    expect(res.error).toMatch(/新密碼/);
  });

  it("session 沒有 email → 錯誤，不碰 Auth", async () => {
    sessionUser = null;
    const res = await changePasswordAction({}, form("00000000", "new-pass-1"));
    expect(res.error).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
