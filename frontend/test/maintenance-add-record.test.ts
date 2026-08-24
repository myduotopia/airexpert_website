import { describe, it, expect, vi, beforeEach } from "vitest";

// addRecordAction（新增一列維護紀錄）的回報方式測試。
// 這支 action 原本是 void + throw + redirect：Next.js 在 production 會把 server
// action 丟出的 Error 訊息抹成 digest，而本專案沒有 error.tsx，員工只會看到通用
// 錯誤頁、剛打的整列維護紀錄也全沒了（#168）。改成回傳 { ok } result 後，
// 下面三件事必須同時成立：
//   1. 失敗（找不到卡 / DB 錯誤）一律回 { ok: false, error }，不 throw。
//   2. 成功回 { ok: true, recordId }，導頁交給 client（不再 redirect）。
//   3. 兩種卡別送進 DB 的 payload 形狀不變（空壓機固定 9 欄；過濾卡 values jsonb）。
// 以假的 supabase query builder 捕捉送進 DB 的列（同 maintenance-create-machine）。

interface Recorded {
  table: string;
  kind: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}

let recorded: Recorded[] = [];
/** `${table}:${kind}` → 讓該操作回傳這個錯誤。 */
let failOn: Record<string, string> = {};
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
  eq(...args: unknown[]): this {
    this.filters.push({ fn: "eq", args });
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
    if (fail) return { data: null, error: { message: fail } };
    if (this.kind === "insert") {
      const rows = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Record<string, unknown>[];
      const data = rows.map(() => ({ id: nextId(this.table) }));
      return { data: this.wantOne ? (data[0] ?? null) : data, error: null };
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

type CardContext = {
  card_type: "compressor" | "filter";
  columns: { id: string; label: string }[];
} | null;

/** getMachineCardContext 的回傳；各 case 自行設定（null = 找不到這張卡）。 */
let cardContext: CardContext = { card_type: "compressor", columns: [] };

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
  findMachine: vi.fn(async () => null),
  findMachineAcrossCustomers: vi.fn(async () => null),
  findMachineByTag: vi.fn(async () => null),
  getMachineCardContext: vi.fn(async () => cardContext),
  isCustomerCodeTaken: vi.fn(async () => false),
  listMachineColumns: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import { addRecordAction } from "@/app/admin/(protected)/maintenance/actions";
import { columnFieldName } from "@/lib/admin/maintenance-normalize";

const MACHINE_ID = "machine-1";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function recordsInserted(): Record<string, unknown>[] {
  return recorded
    .filter((r) => r.table === "mx_records" && r.kind === "insert")
    .map((r) => r.payload as Record<string, unknown>);
}

beforeEach(() => {
  recorded = [];
  failOn = {};
  idSeq = {};
  cardContext = { card_type: "compressor", columns: [] };
  redirectSpy.mockClear();
  revalidateSpy.mockClear();
});

describe("addRecordAction — 錯誤回報（不得 throw）", () => {
  it("找不到此保養卡 → 回 { ok: false }，不 throw、也不寫入任何列", async () => {
    cardContext = null;
    const res = await addRecordAction(MACHINE_ID, form({ hours: "12345" }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("找不到此保養卡");
    expect(recordsInserted()).toHaveLength(0);
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it("DB 寫入錯誤 → 回 { ok: false } 並帶出原始訊息，不 throw", async () => {
    failOn["mx_records:insert"] = "permission denied for table mx_records";
    const res = await addRecordAction(MACHINE_ID, form({ hours: "12345" }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("新增維護紀錄失敗");
    expect(res.ok === false && res.error).toContain("permission denied");
    // 沒寫成功就不該洗掉卡片頁的快取。
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

describe("addRecordAction — 成功路徑", () => {
  it("空壓機卡：回 { ok: true, recordId }，導頁交給 client（不 redirect）", async () => {
    const res = await addRecordAction(
      MACHINE_ID,
      form({
        service_date: "2026-03-14",
        hours: "12345",
        oil: "1桶",
        technician: "阿宏",
        note: "現場加油",
      }),
    );
    expect(res).toEqual({ ok: true, recordId: "mx_records-1" });
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(revalidateSpy).toHaveBeenCalledWith(
      `/admin/maintenance/${MACHINE_ID}`,
    );
    expect(recordsInserted()[0]).toMatchObject({
      machine_id: MACHINE_ID,
      source: "manual",
      service_date: "2026-03-14",
      hours: "12345",
      oil: "1桶",
      technician: "阿宏",
      note: "現場加油",
    });
  });

  it("過濾卡：耗材欄寫進 values jsonb，同樣回 { ok: true, recordId }", async () => {
    cardContext = {
      card_type: "filter",
      columns: [
        { id: "col-a", label: "濾蕊" },
        { id: "col-b", label: "排水器" },
      ],
    };
    const res = await addRecordAction(
      MACHINE_ID,
      form({
        service_date: "2026-03-14",
        technician: "阿宏",
        [columnFieldName("col-a")]: "1只",
        [columnFieldName("col-b")]: "  ",
      }),
    );
    expect(res).toEqual({ ok: true, recordId: "mx_records-1" });
    expect(redirectSpy).not.toHaveBeenCalled();
    const row = recordsInserted()[0];
    expect(row).toMatchObject({
      machine_id: MACHINE_ID,
      source: "manual",
      service_date: "2026-03-14",
      technician: "阿宏",
    });
    // 空白欄不寫入；空壓機卡的固定 9 欄在過濾卡的 payload 裡不該出現。
    expect(row.values).toEqual({ "col-a": "1只" });
    expect(row).not.toHaveProperty("hours");
  });
});
