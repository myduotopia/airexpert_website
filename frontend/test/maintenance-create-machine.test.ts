import { describe, it, expect, vi, beforeEach } from "vitest";

// createMachineAction 的回報方式測試。
// 這支 action 原本是 void + throw：Next.js 在 production 會把 server action 丟出的
// Error 訊息抹成 digest，而本專案沒有 error.tsx，員工只會看到通用錯誤頁、剛打的
// 整張表單也全沒了。改成回傳 { ok } result 之後，下面三件事必須同時成立：
//   1. 失敗（機號未填 / 撞唯一索引 / DB 錯誤）一律回 { ok: false, error }，不 throw。
//   2. 成功回 { ok: true, machineId }，導頁交給 client（不再 redirect）。
//   3. 過濾卡的耗材欄同步與「建欄失敗就刪掉剛建的卡」的回滾行為不能被改壞。
// 以假的 supabase query builder 捕捉送進 DB 的列（同 maintenance-import-commit）。

interface Recorded {
  table: string;
  kind: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}

let recorded: Recorded[] = [];
/** `${table}:${kind}` → 讓該操作回傳這個錯誤（值為 "23505" 時同時當作錯誤碼）。 */
let failOn: Record<string, string> = {};
/** table → select 要回傳的列。 */
let selectRows: Record<string, Record<string, unknown>[]> = {};
let idSeq: Record<string, number> = {};

function nextId(table: string): string {
  idSeq[table] = (idSeq[table] ?? 0) + 1;
  return `${table}-${idSeq[table]}`;
}

type Res = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

class Query implements PromiseLike<Res> {
  kind: Recorded["kind"] = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  wantOne = false;

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
  ilike(...args: unknown[]): this {
    this.filters.push({ fn: "ilike", args });
    return this;
  }
  limit(): this {
    return this;
  }
  order(): this {
    return this;
  }
  maybeSingle(): this {
    this.wantOne = true;
    return this;
  }
  single(): this {
    this.wantOne = true;
    return this;
  }

  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    });
    const fail = failOn[`${this.table}:${this.kind}`];
    if (fail) return { data: null, error: { message: fail, code: fail } };

    if (this.kind === "insert") {
      const rows = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Record<string, unknown>[];
      const data = rows.map((r) => ({
        id: nextId(this.table),
        sort_order: r.sort_order,
      }));
      return { data: this.wantOne ? (data[0] ?? null) : data, error: null };
    }
    if (this.kind === "select") {
      const rows = selectRows[this.table] ?? [];
      return { data: this.wantOne ? (rows[0] ?? null) : rows, error: null };
    }
    return { data: null, error: null };
  }

  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const fakeSupabase = {
  auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  from: (table: string) => new Query(table),
};

const redirectSpy = vi.fn();
const revalidateSpy = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateSpy(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectSpy(...args),
}));
vi.mock("@/lib/admin/auth", () => ({ requireRole: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/gemini", () => ({ extractMaintenanceCard: vi.fn() }));
vi.mock("@/lib/admin/maintenance", () => ({
  findMachineBySerial: vi.fn(async () => null),
  getMachineCardContext: vi.fn(async () => null),
  isCustomerCodeTaken: vi.fn(async () => false),
  listMachineColumns: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import { createMachineAction } from "@/app/admin/(protected)/maintenance/actions";

/** 組一份新增保養卡表單。columns 給了就當過濾卡的耗材欄定義送出。 */
function form(
  fields: Record<string, string>,
  columns?: { id: string | null; label: string }[],
): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    customer_name: "和成欣業(股)公司",
    customer_code: "KK123-1",
    serial_no: "J751307001",
    card_type: "compressor",
    location: "鶯歌區八德路1號",
    model: "SA-30A",
    horsepower: "30HP",
    voltage: "220V",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
  if (columns) fd.set("columns_json", JSON.stringify(columns));
  return fd;
}

function rowsInsertedInto(table: string): Record<string, unknown>[] {
  return recorded
    .filter((r) => r.table === table && r.kind === "insert")
    .flatMap((r) =>
      Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>[])
        : [r.payload as Record<string, unknown>],
    );
}

beforeEach(() => {
  recorded = [];
  failOn = {};
  selectRows = {};
  idSeq = {};
  redirectSpy.mockClear();
  revalidateSpy.mockClear();
});

describe("createMachineAction — 錯誤回報（不得 throw）", () => {
  it("機號空白 → 回 { ok: false }，不 throw、也不建出任何列", async () => {
    const res = await createMachineAction(form({ serial_no: "   " }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("機號");
    expect(rowsInsertedInto("mx_customers")).toHaveLength(0);
    expect(rowsInsertedInto("mx_machines")).toHaveLength(0);
  });

  it("客戶名稱空白 → 回 { ok: false }", async () => {
    const res = await createMachineAction(
      form({ customer_name: "", customer_code: "" }),
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("客戶名稱");
    expect(rowsInsertedInto("mx_machines")).toHaveLength(0);
  });

  it("撞機號唯一索引（23505）→ 回可讀訊息而非 throw", async () => {
    failOn["mx_machines:insert"] = "23505";
    const res = await createMachineAction(form({}));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("此機號已存在");
  });

  it("其他 DB 錯誤 → 回 { ok: false } 並帶出原始訊息", async () => {
    failOn["mx_machines:insert"] = "permission denied";
    const res = await createMachineAction(form({}));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("permission denied");
  });

  it("成功 → 回 { ok: true, machineId }，導頁交給 client（不 redirect）", async () => {
    const res = await createMachineAction(form({}));
    expect(res).toEqual({ ok: true, machineId: "mx_machines-1" });
    expect(redirectSpy).not.toHaveBeenCalled();
    // 導頁雖然改由 client 端做，列表的快取仍必須失效，否則新卡不會出現在清單。
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/maintenance");
    expect(rowsInsertedInto("mx_machines")[0]).toMatchObject({
      serial_no: "J751307001",
      location: "鶯歌區八德路1號",
      horsepower: "30HP",
    });
  });
});

describe("createMachineAction — 過濾卡的耗材欄同步與回滾", () => {
  it("過濾卡建卡成功時依 columns_json 建欄（順序 = sort_order）", async () => {
    const res = await createMachineAction(
      form({ card_type: "filter", serial_no: "100HA" }, [
        { id: null, label: "濾蕊" },
        { id: null, label: "  " },
        { id: null, label: "排水器" },
      ]),
    );
    expect(res.ok).toBe(true);
    const cols = rowsInsertedInto("mx_machine_columns");
    // 空白欄名不建欄（parseColumnDefs 已濾掉），其餘依序建立。
    expect(cols.map((c) => c.label)).toEqual(["濾蕊", "排水器"]);
    expect(cols.map((c) => c.sort_order)).toEqual([0, 1]);
    expect(cols.map((c) => c.machine_id)).toEqual([
      "mx_machines-1",
      "mx_machines-1",
    ]);
  });

  it("建欄失敗 → 刪掉剛建的卡並回 { ok: false }（不留下沒有欄位的空卡）", async () => {
    failOn["mx_machine_columns:insert"] = "boom";
    const res = await createMachineAction(
      form({ card_type: "filter", serial_no: "100HA" }, [
        { id: null, label: "濾蕊" },
      ]),
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("boom");
    const deletes = recorded.filter(
      (r) => r.table === "mx_machines" && r.kind === "delete",
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0].filters).toEqual([
      { fn: "eq", args: ["id", "mx_machines-1"] },
    ]);
    // 卡已刪掉，不該把列表快取洗掉（也證明失敗時沒走到成功分支）。
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it("空壓機卡不碰耗材欄，即使表單帶了 columns_json", async () => {
    const res = await createMachineAction(
      form({ card_type: "compressor" }, [{ id: null, label: "濾蕊" }]),
    );
    expect(res.ok).toBe(true);
    expect(recorded.some((r) => r.table === "mx_machine_columns")).toBe(false);
  });
});
