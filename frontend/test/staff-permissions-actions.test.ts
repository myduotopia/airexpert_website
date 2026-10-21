import { describe, it, expect, vi, beforeEach } from "vitest";

// 權限管理 server actions（#261）：
//   1. 非 hr 一律 forbidden，且不碰 DB／Auth。
//   2. 建立帳號 = service_role createUser（email = 編號小寫@airexpert.com.tw、密碼 00000000、email_confirm）
//      → hr session 呼叫 hr_link_staff_account；連結失敗要刪除 auth 使用者回滾。
//   3. email 已存在 → 明確報錯，不覆蓋（不呼叫連結、不刪除、不改密碼）。
//   4. 沒有編號、離職、已有帳號 → 不呼叫 Auth。
//   5. 批次只處理在職且尚無帳號者，一位失敗不影響其他人。
//   6. 重設密碼：先 hr_flag_staff_password_reset（鎖在改密碼頁）再改密碼；RPC 拒絕時不改密碼。
//      預設同時停用帳號（hr_log_staff_login 稽核 → 同一次 Auth 更新設定密碼與 ban）（#263）。
//   7. 職位權限不可含 hr；只寫差異。
//   8. 建立後先停用（#263，預設）：createUser 直接帶 ban_duration；回傳的使用者未停用時以 updateUserById 補設，
//      補設失敗 → 刪除 auth 使用者，不留下可用預設密碼登入的帳號；批次結果標示已停用。

interface Op {
  table: string;
  kind: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = { data: unknown; error: { message: string; code?: string } | null };

let ops: Op[] = [];
let calls: string[] = [];
let responses: Record<string, Res | ((op: Op) => Res)> = {};
let rpcResponses: Record<string, Res | ((args: unknown) => Res)> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let modules: string[] = ["hr"];

class Query implements PromiseLike<Res> {
  kind: Op["kind"] = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  constructor(private table: string) {}
  select(): this {
    return this;
  }
  insert(payload: unknown): this {
    this.kind = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: unknown): this {
    this.kind = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.kind = "delete";
    return this;
  }
  eq(...args: unknown[]): this {
    this.filters.push({ fn: "eq", args });
    return this;
  }
  in(...args: unknown[]): this {
    this.filters.push({ fn: "in", args });
    return this;
  }
  is(...args: unknown[]): this {
    this.filters.push({ fn: "is", args });
    return this;
  }
  order(): this {
    return this;
  }
  limit(): this {
    return this;
  }
  maybeSingle(): this {
    return this;
  }
  private run(): Res {
    const op: Op = {
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    };
    ops.push(op);
    calls.push(`${this.table}:${this.kind}`);
    const r = responses[`${this.table}:${this.kind}`];
    if (typeof r === "function") return r(op);
    return r ?? { data: null, error: null };
  }
  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const fakeSession = {
  from: (t: string) => new Query(t),
  rpc: vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    calls.push(`rpc:${fn}`);
    const r = rpcResponses[fn];
    if (typeof r === "function") return r(args);
    return r ?? { data: null, error: null };
  }),
};

type AuthErr = { message: string; code?: string } | null;
type AuthUser = { id: string; banned_until?: string | null };
/** 模擬 GoTrue：帶 ban_duration（且不是 none）時回傳的使用者 banned_until 在未來。 */
const FUTURE = "2126-10-21T00:00:00Z";
function bannedFor(attrs: unknown): string | null {
  const d = (attrs as { ban_duration?: string } | null)?.ban_duration;
  return d && d !== "none" ? FUTURE : null;
}
const createUser = vi.fn<
  (
    input: unknown,
  ) => Promise<{ data: { user: AuthUser } | null; error: AuthErr }>
>(async (input) => {
  calls.push("auth:createUser");
  return {
    data: { user: { id: "new-user-1", banned_until: bannedFor(input) } },
    error: null,
  };
});
const deleteUser = vi.fn<(id: string) => Promise<{ error: AuthErr }>>(
  async () => {
    calls.push("auth:deleteUser");
    return { error: null };
  },
);
const updateUserById = vi.fn<
  (
    id: string,
    attrs: unknown,
  ) => Promise<{ data: { user?: AuthUser }; error: AuthErr }>
>(async (id, attrs) => {
  calls.push("auth:updateUserById");
  return {
    data: { user: { id, banned_until: bannedFor(attrs) } },
    error: null,
  };
});
const fakeAdmin = {
  auth: { admin: { createUser, deleteUser, updateUserById } },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSession),
}));
vi.mock("@/lib/supabase-admin", () => ({ getAdminSupabase: () => fakeAdmin }));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async (m: string) => modules.includes(m)),
}));

import {
  assignEmployeePositionAction,
  createPositionAction,
  createStaffAccountAction,
  createStaffAccountsBatchAction,
  deletePositionAction,
  resetStaffPasswordAction,
  setPositionModulesAction,
  setStaffLoginDisabledAction,
} from "@/app/admin/(protected)/employees/permissions/actions";

const EMP = "00000000-0000-0000-0000-0000000000e1";
const POS = "00000000-0000-0000-0000-0000000000a1";

function employee(over: Record<string, unknown> = {}) {
  return {
    id: EMP,
    code: "Z901",
    name: "測試員甲",
    active: true,
    left_on: null,
    admin_profile_id: null,
    ...over,
  };
}

beforeEach(() => {
  ops = [];
  calls = [];
  responses = {};
  rpcResponses = {};
  rpcCalls = [];
  modules = ["hr"];
  createUser.mockClear();
  deleteUser.mockClear();
  updateUserById.mockClear();
  fakeSession.rpc.mockClear();
});

describe("非 hr 一律拒絕，且不碰 DB／Auth", () => {
  it("erp／service_report／employees 模組都不行", async () => {
    for (const m of [
      [],
      ["erp"],
      ["service_report"],
      ["employees", "maintenance"],
    ]) {
      modules = m;
      for (const res of [
        await createStaffAccountAction(EMP),
        await createStaffAccountsBatchAction(),
        await resetStaffPasswordAction(EMP),
        await resetStaffPasswordAction(EMP, false),
        await setStaffLoginDisabledAction(EMP, true),
        await setStaffLoginDisabledAction(EMP, false),
        await createStaffAccountAction(EMP, false),
        await createStaffAccountsBatchAction(false),
        await createPositionAction({ name: "測試", description: "" }),
        await deletePositionAction(POS),
        await setPositionModulesAction(POS, ["erp"]),
        await assignEmployeePositionAction(EMP, POS),
      ]) {
        expect(res.ok).toBe(false);
      }
    }
    expect(calls).toEqual([]);
  });
});

describe("建立帳號（單筆）", () => {
  it("預設（建立後先停用）：createUser 直接帶 ban_duration → hr session 連結；不補設、不回滾", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    const res = await createStaffAccountAction(EMP);
    expect(res).toEqual({ ok: true });
    expect(createUser).toHaveBeenCalledWith({
      email: "z901@airexpert.com.tw",
      password: "00000000",
      email_confirm: true,
      ban_duration: "876000h",
    });
    expect(calls).toEqual([
      "employees:select",
      "auth:createUser",
      "rpc:hr_link_staff_account",
    ]);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("只有明確傳 false 才不停用（其他值一律視為先停用）", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    for (const v of [true, undefined, "false", 0, null]) {
      createUser.mockClear();
      await createStaffAccountAction(EMP, v as unknown as boolean);
      expect(createUser.mock.calls[0][0], String(v)).toMatchObject({
        ban_duration: "876000h",
      });
    }
  });

  it("startDisabled = false：createUser（email、預設密碼、email_confirm，不帶 ban）→ hr session 連結；不回滾", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    const res = await createStaffAccountAction(EMP, false);
    expect(res).toEqual({ ok: true });
    expect(createUser).toHaveBeenCalledWith({
      email: "z901@airexpert.com.tw",
      password: "00000000",
      email_confirm: true,
    });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(rpcCalls).toEqual([
      {
        fn: "hr_link_staff_account",
        args: { p_employee_id: EMP, p_user_id: "new-user-1" },
      },
    ]);
    expect(calls.indexOf("auth:createUser")).toBeLessThan(
      calls.indexOf("rpc:hr_link_staff_account"),
    );
    expect(deleteUser).not.toHaveBeenCalled();
    // admin_profiles 由 RPC 在同一交易內建立，action 不直接寫
    expect(ops.some((o) => o.table === "admin_profiles")).toBe(false);
  });

  it("連結失敗 → 刪除剛建立的 auth 使用者，回中文錯誤", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    rpcResponses.hr_link_staff_account = {
      data: null,
      error: { message: "employee_has_account" },
    };
    const res = await createStaffAccountAction(EMP);
    expect(res).toEqual({ ok: false, error: "此員工已有帳號。" });
    expect(deleteUser).toHaveBeenCalledWith("new-user-1");
  });

  it("連結失敗且回滾也失敗 → 錯誤訊息提示請管理員刪除", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    rpcResponses.hr_link_staff_account = {
      data: null,
      error: { message: "forbidden" },
    };
    deleteUser.mockResolvedValueOnce({ error: { message: "network" } });
    const res = await createStaffAccountAction(EMP);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/回滾失敗.*z901@airexpert\.com\.tw/);
  });

  it("email 已存在 → 明確報錯、不覆蓋（不連結、不刪除、不改密碼）", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    createUser.mockResolvedValueOnce({
      data: null,
      error: {
        code: "email_exists",
        message: "A user with this email address has already been registered",
      },
    });
    const res = await createStaffAccountAction(EMP);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(
      /z901@airexpert\.com\.tw 已有登入帳號.*未覆蓋/,
    );
    expect(rpcCalls).toEqual([]);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("沒有編號／編號不可用於 email／離職／已有帳號 → 不呼叫 Auth", async () => {
    for (const [over, pattern] of [
      [{ code: null }, /沒有員工編號/],
      [{ code: "測試 1" }, /不可用於 email/],
      [{ active: false }, /在職/],
      [{ left_on: "2000-01-01" }, /在職/],
      [
        { admin_profile_id: "00000000-0000-0000-0000-0000000000f1" },
        /已有帳號/,
      ],
    ] as [Record<string, unknown>, RegExp][]) {
      responses["employees:select"] = { data: employee(over), error: null };
      const res = await createStaffAccountAction(EMP);
      expect(res.ok, JSON.stringify(over)).toBe(false);
      expect(!res.ok && res.error).toMatch(pattern);
    }
    expect(createUser).not.toHaveBeenCalled();
  });

  it("員工不存在／id 格式錯誤", async () => {
    responses["employees:select"] = { data: null, error: null };
    expect((await createStaffAccountAction(EMP)).ok).toBe(false);
    expect((await createStaffAccountAction("not-a-uuid")).ok).toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("建立後先停用：Auth 未在建立時停用 → 補設；補設失敗 → 回滾", () => {
  it("createUser 回傳的使用者未停用 → updateUserById 補設 ban，成功後才連結", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    createUser.mockResolvedValueOnce({
      data: { user: { id: "new-user-1", banned_until: null } },
      error: null,
    });
    const res = await createStaffAccountAction(EMP);
    expect(res).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith("new-user-1", {
      ban_duration: "876000h",
    });
    // createUser 以 mockResolvedValueOnce 覆寫，不經預設實作，故不在 calls 內
    expect(createUser).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      "employees:select",
      "auth:updateUserById",
      "rpc:hr_link_staff_account",
    ]);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("補設 ban 失敗 → 刪除 auth 使用者、不連結，回錯誤", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    createUser.mockResolvedValueOnce({
      data: { user: { id: "new-user-1" } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "boom" },
    });
    const res = await createStaffAccountAction(EMP);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/無法停用.*boom.*未建立/);
    expect(deleteUser).toHaveBeenCalledWith("new-user-1");
    expect(rpcCalls).toEqual([]);
  });

  it("補設後仍未停用（Auth 回傳未停用）→ 同樣回滾", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    createUser.mockResolvedValueOnce({
      data: { user: { id: "new-user-1" } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: {
        user: { id: "new-user-1", banned_until: "2020-01-01T00:00:00Z" },
      },
      error: null,
    });
    const res = await createStaffAccountAction(EMP);
    expect(res.ok).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith("new-user-1");
    expect(rpcCalls).toEqual([]);
  });

  it("補設失敗且回滾也失敗 → 錯誤訊息點名帳號、請管理員刪除", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    createUser.mockResolvedValueOnce({
      data: { user: { id: "new-user-1" } },
      error: null,
    });
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "boom" },
    });
    deleteUser.mockResolvedValueOnce({ error: { message: "network" } });
    const res = await createStaffAccountAction(EMP);
    expect(!res.ok && res.error).toMatch(
      /回滾失敗.*z901@airexpert\.com\.tw.*刪除/,
    );
    expect(rpcCalls).toEqual([]);
  });

  it("已停用的帳號連結失敗 → 一樣刪除回滾", async () => {
    responses["employees:select"] = { data: employee(), error: null };
    rpcResponses.hr_link_staff_account = {
      data: null,
      error: { message: "account_not_new" },
    };
    const res = await createStaffAccountAction(EMP);
    expect(res.ok).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith("new-user-1");
  });
});

describe("批次建立", () => {
  it("只查在職且尚無帳號者；逐一建立，失敗者列出、不影響其他人", async () => {
    responses["employees:select"] = {
      data: [
        employee({
          id: "00000000-0000-0000-0000-0000000000e1",
          code: "Z901",
          name: "甲",
        }),
        employee({
          id: "00000000-0000-0000-0000-0000000000e2",
          code: "Z902",
          name: "乙",
        }),
        employee({
          id: "00000000-0000-0000-0000-0000000000e3",
          code: null,
          name: "丙",
        }),
        employee({
          id: "00000000-0000-0000-0000-0000000000e4",
          code: "Z904",
          name: "丁",
          left_on: "2000-01-01",
        }),
      ],
      error: null,
    };
    createUser
      .mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "email_exists", message: "exists" },
      });
    const res = await createStaffAccountsBatchAction();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.disabled).toBe(true);
    expect(res.created).toEqual([
      { name: "甲", email: "z901@airexpert.com.tw", disabled: true },
    ]);
    expect(createUser.mock.calls[0][0]).toMatchObject({
      ban_duration: "876000h",
    });
    expect(res.failed.map((f) => f.name)).toEqual(["乙", "丙"]);
    // 離職（離職日已到）的丁不在處理範圍
    expect(createUser).toHaveBeenCalledTimes(2);
    const q = ops.find((o) => o.table === "employees" && o.kind === "select");
    expect(q?.filters).toEqual(
      expect.arrayContaining([
        { fn: "is", args: ["admin_profile_id", null] },
        { fn: "eq", args: ["active", true] },
      ]),
    );
    expect(rpcCalls.map((c) => c.fn)).toEqual(["hr_link_staff_account"]);
  });
});

describe("批次建立：建立後先停用的選項", () => {
  const two = [
    employee({
      id: "00000000-0000-0000-0000-0000000000e1",
      code: "Z901",
      name: "甲",
    }),
    employee({
      id: "00000000-0000-0000-0000-0000000000e2",
      code: "Z902",
      name: "乙",
    }),
  ];

  it("預設：每位都帶 ban；某位補設失敗 → 只回滾該位，其他照常", async () => {
    responses["employees:select"] = { data: two, error: null };
    createUser
      .mockResolvedValueOnce({
        data: { user: { id: "u-1", banned_until: FUTURE } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { user: { id: "u-2" } }, error: null });
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "boom" },
    });
    const res = await createStaffAccountsBatchAction();
    if (!res.ok) throw new Error("expected ok");
    expect(res.created).toEqual([
      { name: "甲", email: "z901@airexpert.com.tw", disabled: true },
    ]);
    expect(res.failed.map((f) => f.name)).toEqual(["乙"]);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("u-2");
    expect(
      rpcCalls.map((c) => (c.args as { p_user_id: string }).p_user_id),
    ).toEqual(["u-1"]);
  });

  it("startDisabled = false：不帶 ban、結果標示未停用", async () => {
    responses["employees:select"] = { data: two, error: null };
    createUser
      .mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: "u-2" } }, error: null });
    const res = await createStaffAccountsBatchAction(false);
    if (!res.ok) throw new Error("expected ok");
    expect(res.disabled).toBe(false);
    expect(res.created.every((c) => c.disabled === false)).toBe(true);
    for (const [input] of createUser.mock.calls) {
      expect(input).not.toHaveProperty("ban_duration");
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("重設為預設密碼", () => {
  it("預設：先鎖（hr_flag_staff_password_reset）→ 停用稽核 → 同一次 Auth 更新改密碼並停用", async () => {
    rpcResponses.hr_flag_staff_password_reset = { data: "user-9", error: null };
    rpcResponses.hr_log_staff_login = { data: "user-9", error: null };
    const res = await resetStaffPasswordAction(EMP);
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([
      "rpc:hr_flag_staff_password_reset",
      "rpc:hr_log_staff_login",
      "auth:updateUserById",
    ]);
    expect(rpcCalls[1].args).toEqual({ p_employee_id: EMP, p_disabled: true });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith("user-9", {
      password: "00000000",
      ban_duration: "876000h",
    });
  });

  it("停用稽核被拒 → 不改密碼也不停用（帳號已在必改密碼狀態）", async () => {
    rpcResponses.hr_flag_staff_password_reset = { data: "user-9", error: null };
    rpcResponses.hr_log_staff_login = {
      data: null,
      error: { message: "forbidden" },
    };
    const res = await resetStaffPasswordAction(EMP);
    expect(res.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("alsoDisable = false：維持目前的啟用狀態，只改密碼（不寫停用稽核）", async () => {
    rpcResponses.hr_flag_staff_password_reset = { data: "user-9", error: null };
    const res = await resetStaffPasswordAction(EMP, false);
    expect(res).toEqual({ ok: true });
    expect(calls).toEqual([
      "rpc:hr_flag_staff_password_reset",
      "auth:updateUserById",
    ]);
    expect(updateUserById).toHaveBeenCalledWith("user-9", {
      password: "00000000",
    });
  });

  it("RPC 拒絕（非員工帳號、未建立）→ 不改密碼", async () => {
    for (const msg of [
      "not_staff_account",
      "employee_no_account",
      "forbidden",
    ]) {
      rpcResponses.hr_flag_staff_password_reset = {
        data: null,
        error: { message: msg },
      };
      const res = await resetStaffPasswordAction(EMP);
      expect(res.ok).toBe(false);
    }
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("改密碼失敗 → 回錯誤（帳號已在必改密碼狀態）", async () => {
    rpcResponses.hr_flag_staff_password_reset = { data: "user-9", error: null };
    updateUserById.mockResolvedValueOnce({
      data: {},
      error: { message: "boom" },
    });
    const res = await resetStaffPasswordAction(EMP, false);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/下次登入改密碼.*boom/);
  });
});

describe("啟用／停用帳號", () => {
  it("先寫稽核（hr_log_staff_login）再設定 ban_duration", async () => {
    rpcResponses.hr_log_staff_login = { data: "user-9", error: null };
    expect(await setStaffLoginDisabledAction(EMP, true)).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenLastCalledWith("user-9", {
      ban_duration: "876000h",
    });
    expect(await setStaffLoginDisabledAction(EMP, false)).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenLastCalledWith("user-9", {
      ban_duration: "none",
    });
    expect(rpcCalls.map((c) => c.args)).toEqual([
      { p_employee_id: EMP, p_disabled: true },
      { p_employee_id: EMP, p_disabled: false },
    ]);
  });

  it("啟用／停用的參數必須是布林值（不明確的值不當成啟用）", async () => {
    for (const v of [undefined, null, "false", 0, 1]) {
      const res = await setStaffLoginDisabledAction(
        EMP,
        v as unknown as boolean,
      );
      expect(res.ok, String(v)).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it("RPC 拒絕 → 不呼叫 Auth", async () => {
    rpcResponses.hr_log_staff_login = {
      data: null,
      error: { message: "not_staff_account" },
    };
    expect((await setStaffLoginDisabledAction(EMP, true)).ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});

describe("職位與職位權限", () => {
  it("不可經職位授予 hr（不碰 DB）", async () => {
    const res = await setPositionModulesAction(POS, ["erp", "hr"]);
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("只寫差異：移除不要的、新增缺少的", async () => {
    responses["positions:select"] = { data: { id: POS }, error: null };
    responses["position_permissions:select"] = {
      data: [{ module: "erp" }, { module: "maintenance" }],
      error: null,
    };
    const res = await setPositionModulesAction(POS, [
      "maintenance",
      "employees",
    ]);
    expect(res).toEqual({ ok: true });
    const del = ops.find(
      (o) => o.table === "position_permissions" && o.kind === "delete",
    );
    expect(del?.filters).toEqual([
      { fn: "eq", args: ["position_id", POS] },
      { fn: "in", args: ["module", ["erp"]] },
    ]);
    const ins = ops.find(
      (o) => o.table === "position_permissions" && o.kind === "insert",
    );
    expect(ins?.payload).toEqual([{ position_id: POS, module: "employees" }]);
  });

  it("沒有變更 → 不寫入", async () => {
    responses["positions:select"] = { data: { id: POS }, error: null };
    responses["position_permissions:select"] = {
      data: [{ module: "erp" }],
      error: null,
    };
    expect(await setPositionModulesAction(POS, ["erp"])).toEqual({ ok: true });
    expect(ops.filter((o) => o.kind !== "select")).toEqual([]);
  });

  it("新增職位：名稱必填、長度限制；同名 → 中文錯誤", async () => {
    expect(
      (await createPositionAction({ name: "  ", description: "" })).ok,
    ).toBe(false);
    expect(
      (await createPositionAction({ name: "職".repeat(31), description: "" }))
        .ok,
    ).toBe(false);
    expect(calls).toEqual([]);
    responses["positions:insert"] = {
      data: null,
      error: { code: "23505", message: "dup" },
    };
    expect(
      await createPositionAction({ name: "業務", description: "" }),
    ).toEqual({
      ok: false,
      error: "已有同名的職位。",
    });
  });

  it("刪除使用中的職位 → 提示改派或停用", async () => {
    responses["positions:delete"] = {
      data: null,
      error: { code: "23503", message: "fk" },
    };
    const res = await deletePositionAction(POS);
    expect(!res.ok && res.error).toMatch(/仍有員工使用/);
  });

  it("指派員工職位：以 hr session 更新 position_id；未指派傳 null", async () => {
    responses["employees:update"] = { data: [{ id: EMP }], error: null };
    expect(await assignEmployeePositionAction(EMP, POS)).toEqual({ ok: true });
    expect(await assignEmployeePositionAction(EMP, null)).toEqual({ ok: true });
    expect(
      ops.filter((o) => o.kind === "update").map((o) => o.payload),
    ).toEqual([{ position_id: POS }, { position_id: null }]);
    responses["employees:update"] = {
      data: null,
      error: { message: "position_assign_forbidden" },
    };
    const res = await assignEmployeePositionAction(EMP, POS);
    expect(!res.ok && res.error).toMatch(/只有人事/);
  });
});
