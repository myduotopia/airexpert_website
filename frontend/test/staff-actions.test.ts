import { describe, it, expect, vi, beforeEach } from "vitest";

// 人員管理 server actions（建立 / 移除後台帳號）。重點在新增的 erp 角色：
//   1. 建立 erp 帳號 = auth 使用者 + admin_profiles{role:'erp'} + admin_module_grants{module:'erp'}
//      （ERP 可見性與 RLS 都看模組授權，少了 grant 帳號等於空殼）。
//   2. grant 寫入失敗要整批回滾（刪 profile + auth 使用者），不留無效帳號。
//   3. 非白名單角色（admin / 亂填）一律拒絕，且不碰 DB。
//   4. 非 admin 呼叫者被 requireAdmin 擋下（redirect throw），不得有任何寫入。
//   5. 移除帳號會連模組授權一起刪，admin 列不可刪。

interface Op {
  table: string;
  kind: "select" | "insert" | "delete";
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}

let ops: Op[] = [];
/** `${table}:${kind}` → 該操作的回應（預設成功）。 */
let responses: Record<
  string,
  { data: unknown; error: { message: string } | null }
> = {};

type Res = { data: unknown; error: { message: string } | null };

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
  delete(): this {
    this.kind = "delete";
    return this;
  }
  eq(...args: unknown[]): this {
    this.filters.push({ fn: "eq", args });
    return this;
  }
  maybeSingle(): this {
    return this;
  }

  private run(): Res {
    ops.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    });
    return (
      responses[`${this.table}:${this.kind}`] ?? { data: null, error: null }
    );
  }

  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const createUser = vi.fn(async () => ({
  data: { user: { id: "new-user-1" } },
  error: null as { message: string } | null,
}));
const deleteUser = vi.fn(async () => ({ error: null }));

const fakeAdmin = {
  auth: { admin: { createUser, deleteUser } },
  from: (table: string) => new Query(table),
};

const revalidateSpy = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateSpy(...args),
}));
vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => fakeAdmin,
}));
vi.mock("@/lib/admin/auth", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
}));

import {
  createSeoManager,
  removeSeoManager,
} from "@/app/admin/(protected)/staff/actions";
import { requireAdmin } from "@/lib/admin/auth";

function form(role: string, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("role", role);
  fd.set("email", "erp@airexpert.com.tw");
  fd.set("password", "pw-12345678");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

const opsOn = (table: string, kind: Op["kind"]) =>
  ops.filter((o) => o.table === table && o.kind === kind);

beforeEach(() => {
  ops = [];
  responses = {};
  createUser.mockClear();
  deleteUser.mockClear();
  revalidateSpy.mockClear();
  vi.mocked(requireAdmin).mockClear();
  vi.mocked(requireAdmin).mockImplementation(
    async () => ({ id: "admin-1" }) as never,
  );
});

describe("createSeoManager — 建立 ERP 行政帳號", () => {
  it("寫入 admin_profiles{role:'erp'} 與 admin_module_grants{module:'erp'}", async () => {
    const res = await createSeoManager({}, form("erp"));

    expect(res).toEqual({ ok: true });
    expect(createUser).toHaveBeenCalledWith({
      email: "erp@airexpert.com.tw",
      password: "pw-12345678",
      email_confirm: true,
    });
    expect(opsOn("admin_profiles", "insert")[0]?.payload).toEqual({
      id: "new-user-1",
      email: "erp@airexpert.com.tw",
      role: "erp",
    });
    expect(opsOn("admin_module_grants", "insert")[0]?.payload).toEqual({
      user_id: "new-user-1",
      module: "erp",
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/staff");
  });

  it("模組授權寫入失敗 → 回滾刪除 profile 與 auth 使用者", async () => {
    responses["admin_module_grants:insert"] = {
      data: null,
      error: { message: "grant boom" },
    };

    const res = await createSeoManager({}, form("erp"));

    expect(res.error).toContain("建立模組授權失敗");
    expect(opsOn("admin_profiles", "delete")).toHaveLength(1);
    expect(deleteUser).toHaveBeenCalledWith("new-user-1");
  });

  it("其他角色不會拿到模組授權", async () => {
    for (const role of ["office", "seo_manager"]) {
      ops = [];
      const res = await createSeoManager({}, form(role));
      expect(res).toEqual({ ok: true });
      expect(
        (opsOn("admin_profiles", "insert")[0]?.payload as { role: string })
          .role,
      ).toBe(role);
      expect(opsOn("admin_module_grants", "insert")).toHaveLength(0);
    }
  });

  it("非白名單角色（admin / 亂填）一律拒絕，且不建立任何帳號", async () => {
    for (const role of ["admin", "superuser", ""]) {
      const res = await createSeoManager({}, form(role));
      expect(res.error).toBe("請選擇角色。");
    }
    expect(createUser).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
  });

  it("非 admin 呼叫者被 requireAdmin 擋下，不做任何寫入", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw new Error("REDIRECT:/admin");
    });

    await expect(createSeoManager({}, form("erp"))).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(createUser).not.toHaveBeenCalled();
    expect(ops).toHaveLength(0);
  });
});

describe("removeSeoManager — 移除帳號", () => {
  it("erp 帳號：刪模組授權 → 刪 profile → 刪 auth 使用者", async () => {
    responses["admin_profiles:select"] = {
      data: { role: "erp" },
      error: null,
    };

    const res = await removeSeoManager("u-9");

    expect(res).toEqual({ ok: true });
    const grantDel = opsOn("admin_module_grants", "delete")[0];
    expect(grantDel?.filters).toEqual([{ fn: "eq", args: ["user_id", "u-9"] }]);
    expect(opsOn("admin_profiles", "delete")[0]?.filters).toEqual([
      { fn: "eq", args: ["id", "u-9"] },
    ]);
    expect(deleteUser).toHaveBeenCalledWith("u-9");
    // 順序：授權先於 profile，避免 profile 已刪但授權殘留。
    expect(
      ops.findIndex((o) => o.table === "admin_module_grants"),
    ).toBeLessThan(
      ops.findIndex((o) => o.table === "admin_profiles" && o.kind === "delete"),
    );
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/staff");
  });

  it("admin 帳號不可移除（不碰任何刪除）", async () => {
    responses["admin_profiles:select"] = {
      data: { role: "admin" },
      error: null,
    };

    const res = await removeSeoManager("admin-1");

    expect(res).toEqual({ ok: false, error: "不可移除管理員帳號。" });
    expect(ops.filter((o) => o.kind === "delete")).toHaveLength(0);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("非 admin 呼叫者被 requireAdmin 擋下", async () => {
    vi.mocked(requireAdmin).mockImplementation(async () => {
      throw new Error("REDIRECT:/admin");
    });

    await expect(removeSeoManager("u-9")).rejects.toThrow("REDIRECT:/admin");
    expect(ops).toHaveLength(0);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
