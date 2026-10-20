import { describe, it, expect, vi, beforeEach } from "vitest";

// 員工敏感資料與匯入的權限 guard（#257）。以假的 supabase client 記錄 table 寫入與 rpc 呼叫：
//   1. reveal／修改敏感資料：沒有 hr → 拒絕且不呼叫任何 RPC；有 hr → 呼叫 hr_* RPC（參數正確）
//   2. 匯入：沒有 erp／service_report → 拒絕；非 hr → server 端再丟一次敏感欄位、不呼叫 hr_import；
//      hr → 新增員工帶預先產生的 id、敏感欄位以 id 指向送 hr_import_employee_private
//   3. 員工詳情頁：非 hr 不呼叫敏感資料查詢、回應（RSC 樹）不含遮罩值；hr 才呼叫
//   4. 人員管理：只有 admin 可切換，只接受 hr 模組
// 全部虛構資料。

type Res = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
};
interface Recorded {
  table: string;
  kind: string;
  payload: unknown;
}

let modules: string[] = [];
let recorded: Recorded[] = [];
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: (fn: string) => Res = () => ({ data: null, error: null });
let existingRows: unknown[] = [];

class Query implements PromiseLike<Res> {
  kind = "select";
  payload: unknown = null;
  constructor(public table: string) {}
  select() {
    return this;
  }
  insert(p: unknown) {
    this.kind = "insert";
    this.payload = p;
    return this;
  }
  update(p: unknown) {
    this.kind = "update";
    this.payload = p;
    return this;
  }
  eq() {
    return this;
  }
  order() {
    return this;
  }
  range() {
    return this;
  }
  maybeSingle() {
    return this;
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
    });
    let res: Res = { data: null, error: null };
    if (this.kind === "select") res = { data: existingRows, error: null };
    if (this.kind === "update") res = { data: [{ id: "x" }], error: null };
    return Promise.resolve(res).then(ok, bad);
  }
}

const fakeSupabase = {
  from: (t: string) => new Query(t),
  rpc: vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return rpcResponse(fn);
  }),
};

const { redirectSpy } = vi.hoisted(() => ({
  redirectSpy: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectSpy,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));
let isAdmin = true;
const adminWrites: Recorded[] = [];
vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => {
      const q = {
        kind: "select",
        payload: null as unknown,
        select: () => q,
        eq: () => q,
        upsert: (p: unknown) => {
          q.kind = "upsert";
          q.payload = p;
          return q;
        },
        delete: () => {
          q.kind = "delete";
          return q;
        },
        maybeSingle: () => q,
        then: (ok: (v: Res) => unknown) => {
          adminWrites.push({ table, kind: q.kind, payload: q.payload });
          return Promise.resolve(
            q.kind === "select"
              ? { data: { id: "u1" }, error: null }
              : { data: null, error: null },
          ).then(ok);
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async (m: string) => modules.includes(m)),
  getCurrentModules: vi.fn(async () => modules),
  requireAdmin: vi.fn(async () => {
    if (!isAdmin) redirectSpy("/admin");
    return { id: "admin" };
  }),
}));

import {
  revealEmployeePrivateAction,
  updateEmployeePrivateAction,
} from "@/app/admin/(protected)/employees/private-actions";
import { importEmployeesAction } from "@/app/admin/(protected)/employees/import/actions";
import { setModuleGrant } from "@/app/admin/(protected)/staff/actions";
import { HR_FORBIDDEN_ACTION_MESSAGE } from "@/lib/employees/guard";
import { listEmployeeOptions } from "@/lib/employees/queries";
import { taipeiToday } from "@/lib/employees/status";

const EMP = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  modules = ["erp"];
  recorded = [];
  rpcCalls = [];
  rpcResponse = () => ({ data: null, error: null });
  existingRows = [];
  isAdmin = true;
  adminWrites.length = 0;
  redirectSpy.mockClear();
});

describe("敏感資料 actions", () => {
  it("沒有 hr（erp／service_report）→ 拒絕，不呼叫任何 RPC", async () => {
    for (const m of [
      ["erp"],
      ["service_report"],
      ["erp", "service_report"],
      [],
    ]) {
      modules = m;
      expect(await revealEmployeePrivateAction(EMP, "national_id")).toEqual({
        ok: false,
        error: HR_FORBIDDEN_ACTION_MESSAGE,
      });
      expect(
        await updateEmployeePrivateAction(
          EMP,
          { national_id: "Z999999999" },
          [],
        ),
      ).toEqual({ ok: false, error: HR_FORBIDDEN_ACTION_MESSAGE });
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("hr：reveal 呼叫 hr_reveal_employee_private；未知欄位不呼叫", async () => {
    modules = ["erp", "hr"];
    rpcResponse = () => ({ data: "Z999999999", error: null });
    expect(await revealEmployeePrivateAction(EMP, "national_id")).toEqual({
      ok: true,
      value: "Z999999999",
    });
    expect(rpcCalls).toEqual([
      {
        fn: "hr_reveal_employee_private",
        args: { p_employee_id: EMP, p_field: "national_id" },
      },
    ]);
    expect(
      await revealEmployeePrivateAction(EMP, "salary" as unknown as "marital"),
    ).toEqual({ ok: false, error: "未知的欄位。" });
    expect(
      await revealEmployeePrivateAction("not-a-uuid", "marital"),
    ).toMatchObject({
      ok: false,
    });
    expect(rpcCalls).toHaveLength(1);
  });

  it("hr：修改送 hr_upsert（留白不送、清除送 null、未知鍵丟棄）；金鑰缺失顯示中文", async () => {
    modules = ["hr"];
    rpcResponse = () => ({
      data: { employee_id: EMP, exists: true, updated_at: null, fields: {} },
      error: null,
    });
    const res = await updateEmployeePrivateAction(
      EMP,
      { national_id: " Z999999999 ", marital: "", salary: "1" } as never,
      ["education", "bogus" as never],
    );
    expect(res.ok).toBe(true);
    expect(rpcCalls[0]).toEqual({
      fn: "hr_upsert_employee_private",
      args: {
        p_employee_id: EMP,
        p_fields: { national_id: "Z999999999", education: null },
      },
    });
    rpcResponse = () => ({ data: null, error: { message: "hr_key_missing" } });
    const missing = await updateEmployeePrivateAction(
      EMP,
      { marital: "未婚" },
      [],
    );
    expect(missing.ok === false && missing.error).toContain("金鑰尚未設定");
    expect(await updateEmployeePrivateAction(EMP, {}, [])).toEqual({
      ok: false,
      error: "沒有要修改的欄位。",
    });
  });
});

describe("importEmployeesAction", () => {
  const rows = [
    {
      line: 4,
      code: "Z01",
      name: "測試員甲",
      title: "業務",
      phone: "0200000001",
      private: { national_id: "Z999999999" },
      warnings: [],
    },
  ];

  it("沒有 erp／service_report → 拒絕且不碰 DB", async () => {
    modules = ["hr"];
    const res = await importEmployeesAction({ rows, status: "keep" });
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it("非 hr：server 端再丟敏感欄位；不呼叫 hr_import", async () => {
    modules = ["erp"];
    const res = await importEmployeesAction({ rows, status: "keep" });
    expect(res).toMatchObject({ ok: true, inserted: 1, privateFields: null });
    const insert = recorded.find((r) => r.kind === "insert")!;
    expect(JSON.stringify(insert.payload)).not.toContain("Z999999999");
    expect(insert.payload).toMatchObject([
      { code: "Z01", name: "測試員甲", roles: ["sales"], active: true },
    ]);
    expect(rpcCalls).toHaveLength(0);
  });

  it("hr：新增帶 id、敏感欄位以 id 指向送 hr_import_employee_private", async () => {
    modules = ["erp", "hr"];
    rpcResponse = () => ({
      data: { rows: 1, written_fields: 1, unchanged_rows: 0 },
      error: null,
    });
    const res = await importEmployeesAction({ rows, status: "keep" });
    expect(res).toMatchObject({ ok: true, inserted: 1, privateFields: 1 });
    const insert = recorded.find((r) => r.kind === "insert")!;
    const id = (insert.payload as { id: string }[])[0].id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(insert.payload)).not.toContain("Z999999999");
    expect(rpcCalls).toEqual([
      {
        fn: "hr_import_employee_private",
        args: { p_rows: [{ employee_id: id, national_id: "Z999999999" }] },
      },
    ]);
  });

  it("既有員工依姓名對到 → 更新而非新增（不重複建檔）", async () => {
    modules = ["erp"];
    existingRows = [
      {
        id: EMP,
        code: null,
        name: "測試員甲",
        roles: ["sales"],
        active: true,
        title: null,
        phone: null,
        hired_on: null,
        left_on: null,
      },
    ];
    const res = await importEmployeesAction({ rows, status: "keep" });
    expect(res).toMatchObject({ ok: true, inserted: 0, updated: 1 });
    expect(recorded.filter((r) => r.kind === "insert")).toHaveLength(0);
    expect(recorded.find((r) => r.kind === "update")!.payload).toEqual({
      code: "Z01",
      title: "業務",
      phone: "0200000001",
    });
  });

  it("格式錯誤 → 拒絕", async () => {
    expect(
      (await importEmployeesAction({ rows: "x", status: "keep" })).ok,
    ).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});

describe("選取器選項：只列實際在職", () => {
  it("離職日已到的員工（DB 仍 active）不列入；預定離職仍列入", async () => {
    const today = taipeiToday();
    existingRows = [
      {
        id: "a",
        code: "Z01",
        name: "測試員甲",
        roles: ["sales"],
        active: true,
        left_on: null,
      },
      {
        id: "b",
        code: "Z02",
        name: "測試員乙",
        roles: ["sales"],
        active: true,
        left_on: today,
      },
      {
        id: "c",
        code: "Z03",
        name: "測試員丙",
        roles: ["office"],
        active: true,
        left_on: "2999-12-31",
      },
    ];
    const opts = await listEmployeeOptions();
    expect(opts.map((o) => o.id)).toEqual(["a", "c"]);
    expect(opts[1]).toEqual({
      id: "c",
      code: "Z03",
      name: "測試員丙",
      roles: ["office"],
      active: true,
    });
    const all = await listEmployeeOptions({ includeInactive: true });
    expect(all.find((o) => o.id === "b")!.active).toBe(false);
  });
});

describe("員工詳情頁：只有 hr 才取得敏感資料", () => {
  async function renderPage() {
    vi.resetModules();
    const getEmployeePrivate = vi.fn(async () => ({
      ok: true,
      view: {
        employee_id: EMP,
        exists: true,
        updated_at: null,
        fields: { national_id: "Z99*****99" },
      },
    }));
    const listPrivateAccessLog = vi.fn(async () => []);
    vi.doMock("@/lib/employees/private-queries", () => ({
      getEmployeePrivate,
      listPrivateAccessLog,
    }));
    vi.doMock("@/lib/employees/queries", () => ({
      getEmployee: vi.fn(async () => ({
        id: EMP,
        code: "Z01",
        name: "測試員甲",
        roles: ["sales"],
        active: true,
        note: null,
        title: "業務",
        department: null,
        phone: null,
        emergency_contact: null,
        hired_on: null,
        left_on: null,
        admin_profile_id: null,
        created_at: "",
        updated_at: "",
      })),
    }));
    const { default: Page } =
      await import("@/app/admin/(protected)/employees/[employeeId]/page");
    const tree = await Page({ params: Promise.resolve({ employeeId: EMP }) });
    return { tree, getEmployeePrivate, listPrivateAccessLog };
  }

  function containsText(node: unknown, text: string): boolean {
    const seen = new Set<unknown>();
    const walk = (n: unknown): boolean => {
      if (n === null || n === undefined) return false;
      if (typeof n === "string") return n.includes(text);
      if (typeof n !== "object" || seen.has(n)) return false;
      seen.add(n);
      return Object.values(n as Record<string, unknown>).some(walk);
    };
    return walk(node);
  }

  it("非 hr：不呼叫敏感資料查詢、回應不含遮罩值", async () => {
    modules = ["erp"];
    const { tree, getEmployeePrivate, listPrivateAccessLog } =
      await renderPage();
    expect(getEmployeePrivate).not.toHaveBeenCalled();
    expect(listPrivateAccessLog).not.toHaveBeenCalled();
    expect(containsText(tree, "Z99*****99")).toBe(false);
    expect(containsText(tree, "敏感資料")).toBe(false);
  });

  it("hr：呼叫敏感資料查詢並渲染區塊", async () => {
    modules = ["erp", "hr"];
    const { tree, getEmployeePrivate } = await renderPage();
    expect(getEmployeePrivate).toHaveBeenCalledWith(EMP);
    expect(containsText(tree, "Z99*****99")).toBe(true);
  });
});

describe("人員管理：授予／移除 hr", () => {
  it("admin 授予 → upsert；移除 → delete", async () => {
    expect(await setModuleGrant("u1", "hr", true)).toEqual({ ok: true });
    expect(adminWrites.at(-1)).toMatchObject({
      table: "admin_module_grants",
      kind: "upsert",
      payload: { user_id: "u1", module: "hr" },
    });
    expect(await setModuleGrant("u1", "hr", false)).toEqual({ ok: true });
    expect(adminWrites.at(-1)).toMatchObject({
      table: "admin_module_grants",
      kind: "delete",
    });
  });

  it("只接受 hr；非 admin 被導離且不寫入", async () => {
    expect(await setModuleGrant("u1", "erp", true)).toMatchObject({
      ok: false,
    });
    expect(adminWrites).toHaveLength(0);
    isAdmin = false;
    await expect(setModuleGrant("u1", "hr", true)).rejects.toThrow(
      "REDIRECT:/admin",
    );
    expect(adminWrites).toHaveLength(0);
  });
});
