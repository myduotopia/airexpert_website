import { describe, it, expect, vi, beforeEach } from "vitest";

// 員工主檔 server actions（#223）測試。以假的 supabase query builder 記錄送進 DB 的操作：
//   1. 權限：erp 或 service_report 任一模組即可；皆無 → 拒絕且不碰 DB
//   2. 輸入正規化後寫入 employees；建立後回傳選取器選項（EMPLOYEE_OPTION_COLUMNS）
//   3. 姓名／代號唯一（23505）、被引用不可刪（23503）→ 中文訊息
//   4. 更新／刪除 0 列 → 找不到

type Kind = "select" | "insert" | "update" | "delete";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
  select: unknown[];
}
type Res = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
};

let recorded: Recorded[] = [];
let responses: Record<string, () => Res> = {};
let modules: string[] = [];

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  selectArgs: unknown[] = [];

  constructor(public table: string) {}

  select(...args: unknown[]): this {
    this.selectArgs = args;
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
  single(): this {
    return this;
  }

  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
      select: this.selectArgs,
    });
    const r = responses[`${this.table}:${this.kind}`];
    return Promise.resolve(r ? r() : { data: null, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async (m: string) => modules.includes(m)),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (table: string) => new Query(table),
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createEmployeeAction,
  deleteEmployeeAction,
  updateEmployeeAction,
} from "@/app/admin/(protected)/employees/actions";
import { EMPLOYEE_FORBIDDEN_MESSAGE } from "@/lib/employees/guard";
import {
  EMPLOYEE_CODE_TAKEN_MESSAGE,
  EMPLOYEE_IN_USE_MESSAGE,
  EMPLOYEE_NAME_TAKEN_MESSAGE,
  emptyEmployeeInput,
} from "@/lib/employees/normalize";
import { EMPLOYEE_OPTION_COLUMNS } from "@/lib/employees/queries";

const EMP_ID = "11111111-1111-4111-8111-111111111111";
const OPTION = {
  id: EMP_ID,
  code: "S01",
  name: "王 小明",
  roles: ["sales"],
  active: true,
};

beforeEach(() => {
  recorded = [];
  responses = {};
  modules = ["erp"];
});

describe("權限：erp 或 service_report 任一即可", () => {
  const input = emptyEmployeeInput({ name: "王小明", roles: ["sales"] });

  it("皆無 → 拒絕，不碰 DB", async () => {
    modules = [];
    for (const res of [
      await createEmployeeAction(input),
      await updateEmployeeAction(EMP_ID, input),
      await deleteEmployeeAction(EMP_ID),
    ]) {
      expect(res).toEqual({ ok: false, error: EMPLOYEE_FORBIDDEN_MESSAGE });
    }
    expect(recorded).toHaveLength(0);
  });

  it("只有 service_report（維護報告單使用者）→ 可就地新增師傅", async () => {
    modules = ["service_report"];
    responses["employees:insert"] = () => ({
      data: { ...OPTION, roles: ["technician"] },
      error: null,
    });
    const res = await createEmployeeAction(
      emptyEmployeeInput({ name: "李師傅", roles: ["technician"] }),
    );
    expect(res.ok).toBe(true);
    expect(recorded).toHaveLength(1);
  });
});

describe("createEmployeeAction", () => {
  it("正規化後寫入，回傳選取器選項", async () => {
    responses["employees:insert"] = () => ({ data: OPTION, error: null });
    const res = await createEmployeeAction(
      emptyEmployeeInput({
        code: " S01 ",
        name: " 王　小明 ",
        roles: ["sales"],
        note: "",
      }),
    );
    expect(res).toEqual({ ok: true, id: EMP_ID, option: OPTION });
    expect(recorded[0]).toMatchObject({
      table: "employees",
      kind: "insert",
      payload: {
        code: "S01",
        name: "王 小明",
        roles: ["sales"],
        active: true,
        note: null,
      },
      select: [EMPLOYEE_OPTION_COLUMNS],
    });
  });

  it("驗證失敗（無角色）→ 不碰 DB", async () => {
    const res = await createEmployeeAction(emptyEmployeeInput({ name: "甲" }));
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });

  it("同名（23505 employees_name_key）→ 已有同名員工", async () => {
    responses["employees:insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "employees_name_key"',
      },
    });
    const res = await createEmployeeAction(
      emptyEmployeeInput({ name: "王小明", roles: ["sales"] }),
    );
    expect(res).toEqual({ ok: false, error: EMPLOYEE_NAME_TAKEN_MESSAGE });
  });

  it("代號重複（23505 employees_code_key）→ 代號已存在", async () => {
    responses["employees:insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "employees_code_key"',
      },
    });
    const res = await createEmployeeAction(
      emptyEmployeeInput({ code: "S01", name: "甲", roles: ["sales"] }),
    );
    expect(res).toEqual({ ok: false, error: EMPLOYEE_CODE_TAKEN_MESSAGE });
  });
});

describe("updateEmployeeAction", () => {
  it("依 id 更新（含停用）", async () => {
    responses["employees:update"] = () => ({
      data: [{ id: EMP_ID }],
      error: null,
    });
    const res = await updateEmployeeAction(
      EMP_ID,
      emptyEmployeeInput({
        name: "王小明",
        roles: ["technician", "sales"],
        active: false,
      }),
    );
    expect(res).toEqual({ ok: true, id: EMP_ID });
    expect(recorded[0]).toMatchObject({
      kind: "update",
      payload: { roles: ["sales", "technician"], active: false },
      filters: [{ fn: "eq", args: ["id", EMP_ID] }],
    });
  });

  it("0 列（不存在或無權）→ 找不到", async () => {
    responses["employees:update"] = () => ({ data: [], error: null });
    const res = await updateEmployeeAction(
      EMP_ID,
      emptyEmployeeInput({ name: "甲", roles: ["sales"] }),
    );
    expect(res.ok).toBe(false);
  });

  it("id 不是 UUID → 不碰 DB", async () => {
    const res = await updateEmployeeAction(
      "x",
      emptyEmployeeInput({ name: "甲", roles: ["sales"] }),
    );
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});

describe("deleteEmployeeAction", () => {
  it("被引用（23503）→ 請改為停用", async () => {
    responses["employees:delete"] = () => ({
      data: null,
      error: { code: "23503", message: "violates foreign key constraint" },
    });
    const res = await deleteEmployeeAction(EMP_ID);
    expect(res).toEqual({ ok: false, error: EMPLOYEE_IN_USE_MESSAGE });
  });

  it("未被引用 → 刪除", async () => {
    responses["employees:delete"] = () => ({
      data: [{ id: EMP_ID }],
      error: null,
    });
    const res = await deleteEmployeeAction(EMP_ID);
    expect(res).toEqual({ ok: true });
    expect(recorded[0]).toMatchObject({
      table: "employees",
      kind: "delete",
      filters: [{ fn: "eq", args: ["id", EMP_ID] }],
    });
  });
});
