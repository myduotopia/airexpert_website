import { describe, it, expect, vi, beforeEach } from "vitest";

// #229：ERP 以外、同樣會被 PostgREST 1,000 列上限靜默截斷的全表讀取，改以 fetchAllRows 分頁讀完：
//   * 員工選項 listEmployeeOptions（ERP + 維護報告單共用）
//   * 維護報告單的客戶 / 機台選單（mx_customers 全表、mx_machines 未封存全表）
//   * 保養卡列表（使用中 / 封存區）
//   * 應收應付：對象的未沖銷單據（沖銷畫面）
// 以假的 supabase builder 依 range 切頁，驗證筆數完整、排序含 id、失敗不回部分資料。

interface Call {
  table: string;
  filters: { fn: string; args: unknown[] }[];
  orders: string[];
  range: [number, number] | null;
}

let calls: Call[] = [];
let respond: (
  call: Call,
) => unknown[] | { error: { message: string } } = () => [];

type Res = { data: unknown; error: { message: string } | null };

class Query implements PromiseLike<Res> {
  call: Call;
  constructor(table: string) {
    this.call = { table, filters: [], orders: [], range: null };
  }
  select(): this {
    return this;
  }
  private f(fn: string, args: unknown[]): this {
    this.call.filters.push({ fn, args });
    return this;
  }
  eq(...a: unknown[]): this {
    return this.f("eq", a);
  }
  neq(...a: unknown[]): this {
    return this.f("neq", a);
  }
  in(...a: unknown[]): this {
    return this.f("in", a);
  }
  is(...a: unknown[]): this {
    return this.f("is", a);
  }
  not(...a: unknown[]): this {
    return this.f("not", a);
  }
  order(col: string): this {
    this.call.orders.push(col);
    return this;
  }
  range(from: number, to: number): this {
    this.call.range = [from, to];
    return this;
  }
  then<A = Res, B = never>(
    onfulfilled?: ((v: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    calls.push(this.call);
    const r = respond(this.call);
    const res: Res = Array.isArray(r)
      ? { data: r, error: null }
      : { data: null, error: r.error };
    return Promise.resolve(res).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/admin/auth", () => ({ hasModule: vi.fn(async () => true) }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (t: string) => new Query(t),
  })),
}));

import { listEmployeeOptions } from "@/lib/employees/queries";
import {
  listCustomerOptions as listSrCustomerOptions,
  listMachineOptions as listSrMachineOptions,
} from "@/lib/service-report/queries";
import { listArchivedMachines, listMachines } from "@/lib/admin/maintenance";
import { listOutstandingDocuments } from "@/lib/erp/queries/ar-ap";

function paged<T>(rows: T[]) {
  return (c: Call) => rows.slice(c.range![0], c.range![1] + 1);
}

function rows(
  n: number,
  extra: (i: number) => Record<string, unknown> = () => ({}),
) {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${String(i).padStart(5, "0")}`,
    name: `名稱${i}`,
    ...extra(i),
  }));
}

/** 讀第二頁時失敗。 */
function failSecondPage<T>(all: T[]) {
  return (c: Call) =>
    c.range![0] === 0 ? paged(all)(c) : { error: { message: "boom" } };
}

beforeEach(() => {
  calls = [];
  respond = () => [];
});

describe("listEmployeeOptions", () => {
  it("超過 1,000 筆 → 分頁讀完，依 name、id 排序，預設只列在職", async () => {
    const all = rows(1003);
    respond = paged(all);
    const res = await listEmployeeOptions();
    expect(res).toHaveLength(1003);
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls[0].table).toBe("employees");
    expect(calls[0].orders).toEqual(["name", "id"]);
    expect(calls[0].filters).toEqual([{ fn: "eq", args: ["active", true] }]);
  });

  it("第二頁失敗 → throw", async () => {
    respond = failSecondPage(rows(1200));
    await expect(listEmployeeOptions()).rejects.toThrow("讀取員工失敗：boom");
  });
});

describe("維護報告單選單", () => {
  it("客戶：mx_customers 全表分頁讀完，依 code、name、id 排序", async () => {
    const all = rows(1500);
    respond = paged(all);
    const res = await listSrCustomerOptions();
    expect(res.ok).toBe(true);
    expect(res.ok && res.data).toHaveLength(1500);
    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("mx_customers");
    expect(calls[0].orders).toEqual(["code", "name", "id"]);
  });

  it("客戶：第二頁失敗 → ok:false，不回部分資料", async () => {
    respond = failSecondPage(rows(1500));
    const res = await listSrCustomerOptions();
    expect(res).toEqual({ ok: false, error: "操作失敗：boom" });
  });

  it("機台：未封存全表分頁讀完，依 machine_no、serial_no、id 排序", async () => {
    const all = rows(2500);
    respond = paged(all);
    const res = await listSrMachineOptions();
    expect(res.ok && res.data).toHaveLength(2500);
    expect(calls).toHaveLength(3);
    expect(calls[0].table).toBe("mx_machines");
    expect(calls[0].orders).toEqual(["machine_no", "serial_no", "id"]);
    expect(calls[0].filters).toEqual([
      { fn: "is", args: ["archived_at", null] },
    ]);
  });

  it("機台：限定客戶時每頁都帶客戶條件", async () => {
    const cid = "11111111-1111-4111-8111-111111111111";
    respond = paged(rows(1000));
    await listSrMachineOptions(cid);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.filters).toEqual([
        { fn: "is", args: ["archived_at", null] },
        { fn: "eq", args: ["customer_id", cid] },
      ]);
    }
  });

  it("機台：第二頁失敗 → ok:false", async () => {
    respond = failSecondPage(rows(1500));
    const res = await listSrMachineOptions();
    expect(res.ok).toBe(false);
  });
});

describe("保養卡列表", () => {
  const machine = (i: number) => ({
    customer_id: "c1",
    archived_at: null,
    mx_customers: { name: "客戶" },
    mx_records: [],
    created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
  });

  it("使用中：超過 1,000 台 → 分頁讀完，依 created_at、id 排序", async () => {
    respond = paged(rows(1200, machine));
    const res = await listMachines();
    expect(res).toHaveLength(1200);
    expect(calls).toHaveLength(2);
    expect(calls[0].orders).toEqual(["created_at", "id"]);
    expect(res[0]).not.toHaveProperty("mx_records");
  });

  it("使用中：卡別篩選每頁都帶", async () => {
    respond = paged(rows(1000, machine));
    await listMachines("filter");
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.filters).toContainEqual({
        fn: "eq",
        args: ["card_type", "filter"],
      });
    }
  });

  it("使用中：第二頁失敗 → throw", async () => {
    respond = failSecondPage(rows(1200, machine));
    await expect(listMachines()).rejects.toThrow("讀取保養卡失敗：boom");
  });

  it("封存區：超過 1,000 台 → 分頁讀完，依 archived_at、id 排序", async () => {
    respond = paged(rows(1001, machine));
    const res = await listArchivedMachines();
    expect(res).toHaveLength(1001);
    expect(calls[0].orders).toEqual(["archived_at", "id"]);
  });

  it("封存區：第二頁失敗 → throw", async () => {
    respond = failSecondPage(rows(1001, machine));
    await expect(listArchivedMachines()).rejects.toThrow(
      "讀取封存區失敗：boom",
    );
  });
});

describe("listOutstandingDocuments", () => {
  const doc = (i: number) => ({
    document_id: `d-${i}`,
    total_twd: "100",
    allocated: "0",
    outstanding: "100",
  });

  it("未沖銷單據超過 1,000 張 → 分頁讀完，依 doc_date、doc_no、document_id 排序並轉數字", async () => {
    respond = paged(rows(1100, doc));
    const res = await listOutstandingDocuments("in", "c1");
    expect(res.ok && res.data).toHaveLength(1100);
    expect(res.ok && res.data[0].outstanding).toBe(100);
    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("erp_document_balances");
    expect(calls[0].orders).toEqual(["doc_date", "doc_no", "document_id"]);
  });

  it("第二頁失敗 → ok:false", async () => {
    respond = failSecondPage(rows(1100, doc));
    const res = await listOutstandingDocuments("in", "c1");
    expect(res.ok).toBe(false);
  });
});
