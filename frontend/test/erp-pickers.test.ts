import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/erp/queries/pickers.ts：
//   PostgREST 預設單次最多 1,000 列（靜默截斷）→ 選項查詢以 range 分頁讀到短頁（#229）；
//   listAvailableSerials：item id 過多 → 分批 .in()，避免 URL 無限增長；結果依 serial_no、id 排序。

interface Call {
  table: string;
  filters: { fn: string; args: unknown[] }[];
  orders: string[];
  range: [number, number] | null;
  limit: number | null;
}

let calls: Call[] = [];
/** 回傳陣列 = 資料；回傳 { error } = 該次查詢失敗。 */
let respond: (
  call: Call,
) => unknown[] | { error: { message: string } } = () => [];

type Res = { data: unknown; error: { message: string } | null };

class Query implements PromiseLike<Res> {
  call: Call;
  constructor(table: string) {
    this.call = { table, filters: [], orders: [], range: null, limit: null };
  }
  select(): this {
    return this;
  }
  in(...args: unknown[]): this {
    this.call.filters.push({ fn: "in", args });
    return this;
  }
  eq(...args: unknown[]): this {
    this.call.filters.push({ fn: "eq", args });
    return this;
  }
  is(...args: unknown[]): this {
    this.call.filters.push({ fn: "is", args });
    return this;
  }
  not(...args: unknown[]): this {
    this.call.filters.push({ fn: "not", args });
    return this;
  }
  order(col: string): this {
    this.call.orders.push(col);
    return this;
  }
  range(from: number, to: number): this {
    this.call.range = [from, to];
    return this;
  }
  limit(n: number): this {
    this.call.limit = n;
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

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (t: string) => new Query(t),
  })),
}));

import {
  listAvailableSerials,
  listCustomerOptions,
  listItemOptions,
  listMachineModelOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";

// 刻意寫死（不 import 常數），讓測試鎖定行為：每批 100 個 item id、每頁 1,000 列。
const SERIAL_ITEM_CHUNK = 100;
const SERIAL_PAGE_SIZE = 1000;

function serial(itemId: string, n: number) {
  const no = String(n).padStart(5, "0");
  return {
    id: `id-${itemId}-${no}`,
    item_id: itemId,
    serial_no: `SN-${no}`,
    status: "in_stock",
    warehouse_id: "wh-1",
    customer_id: null,
  };
}

function inIds(call: Call): string[] {
  return call.filters.find((f) => f.fn === "in")!.args[1] as string[];
}

beforeEach(() => {
  calls = [];
  respond = () => [];
});

describe("listAvailableSerials", () => {
  it("第一頁滿 1,000 列 → 繼續讀下一頁直到短頁，全部串接", async () => {
    const all = Array.from({ length: SERIAL_PAGE_SIZE + 7 }, (_, i) =>
      serial("item-a", i),
    );
    respond = (c) => all.slice(c.range![0], c.range![1] + 1);

    const res = await listAvailableSerials({
      itemId: "item-a",
      status: "in_stock",
      warehouseId: "wh-1",
    });
    expect(res).toHaveLength(SERIAL_PAGE_SIZE + 7);
    expect(res.map((s) => s.id)).toEqual(all.map((s) => s.id));
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls[0].orders).toEqual(["serial_no", "id"]);
    expect(calls[0].filters).toContainEqual({
      fn: "eq",
      args: ["warehouse_id", "wh-1"],
    });
  });

  it("短頁 → 只查一次", async () => {
    respond = () => [serial("item-a", 1)];
    const res = await listAvailableSerials({
      itemId: ["item-a"],
      status: "in_stock",
    });
    expect(res).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it("item id 過多 → 分批查詢，合併後依 serial_no 排序", async () => {
    const ids = Array.from(
      { length: SERIAL_ITEM_CHUNK * 2 + 5 },
      (_, i) => `item-${i}`,
    );
    // 後面批次的序號較小，驗證合併後會重新排序。
    respond = (c) =>
      inIds(c).map((id) => serial(id, 1000 - Number(id.slice(5))));

    const res = await listAvailableSerials({ itemId: ids, status: "sold" });
    expect(calls.map((c) => inIds(c).length)).toEqual([
      SERIAL_ITEM_CHUNK,
      SERIAL_ITEM_CHUNK,
      5,
    ]);
    expect(calls.flatMap(inIds)).toEqual(ids);
    expect(res).toHaveLength(ids.length);
    const nos = res.map((s) => s.serial_no);
    expect(nos).toEqual([...nos].sort());
    expect(res[0].item_id).toBe(ids[ids.length - 1]);
  });

  it("空陣列 → 不查詢", async () => {
    expect(await listAvailableSerials({ itemId: [], status: "sold" })).toEqual(
      [],
    );
    expect(calls).toHaveLength(0);
  });
});

// ── 選項查詢（#229）：舊系統匯入後品項約 1,848 筆、客戶約 950 筆，需分頁讀完 ──

/** 依 range 切出該頁（模擬 PostgREST 的 offset / limit）。 */
function paged<T>(rows: T[]) {
  return (c: Call) => rows.slice(c.range![0], c.range![1] + 1);
}

function rowsOf(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${String(i).padStart(5, "0")}`,
    code: `${prefix.toUpperCase()}${String(i).padStart(5, "0")}`,
    name: `名稱${i}`,
  }));
}

describe("list*Options 分頁讀完", () => {
  it("listItemOptions：1,848 筆 → 讀兩頁全部回傳，依 code、id 排序，只列啟用中", async () => {
    const all = rowsOf(1848, "item");
    respond = paged(all);
    const res = await listItemOptions();
    expect(res).toHaveLength(1848);
    expect(res.map((r) => r.id)).toEqual(all.map((r) => r.id));
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    for (const c of calls) {
      expect(c.table).toBe("erp_items");
      expect(c.orders).toEqual(["code", "id"]);
      expect(c.filters).toEqual([{ fn: "eq", args: ["active", true] }]);
    }
  });

  it("listItemOptions({ includeInactive })：不加 active 條件", async () => {
    respond = paged(rowsOf(3, "item"));
    await listItemOptions({ includeInactive: true });
    expect(calls[0].filters).toEqual([]);
  });

  it("listItemOptions：第二頁失敗 → throw，不回第一頁的部分資料", async () => {
    const all = rowsOf(1500, "item");
    respond = (c) =>
      c.range![0] === 0 ? paged(all)(c) : { error: { message: "timeout" } };
    await expect(listItemOptions()).rejects.toThrow("讀取品項失敗：timeout");
  });

  it("listCustomerOptions：1,200 筆 → 全部回傳，依 name、id 排序", async () => {
    const all = rowsOf(1200, "cust");
    respond = paged(all);
    const res = await listCustomerOptions();
    expect(res).toHaveLength(1200);
    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("mx_customers");
    expect(calls[0].orders).toEqual(["name", "id"]);
    expect(calls[0].filters).toEqual([
      { fn: "eq", args: ["erp_active", true] },
    ]);
  });

  it("listCustomerOptions：失敗 → throw", async () => {
    respond = () => ({ error: { message: "boom" } });
    await expect(listCustomerOptions()).rejects.toThrow("讀取客戶失敗：boom");
  });

  it("listVendorOptions：剛好 1,000 筆 → 讀到空頁才停，不重複", async () => {
    const all = rowsOf(1000, "vend");
    respond = paged(all);
    const res = await listVendorOptions();
    expect(res).toHaveLength(1000);
    expect(calls.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(calls[0].table).toBe("erp_vendors");
    expect(calls[0].orders).toEqual(["code", "id"]);
  });

  it("listWarehouseOptions：預設倉在前、code、id 排序並分頁", async () => {
    respond = paged(rowsOf(2, "wh"));
    const res = await listWarehouseOptions();
    expect(res).toHaveLength(2);
    expect(calls[0].table).toBe("erp_warehouses");
    expect(calls[0].orders).toEqual(["is_default", "code", "id"]);
    expect(calls[0].range).toEqual([0, 999]);
  });

  it("listMachineModelOptions：sr_reports 超過 1,000 筆也分頁讀完（不再只取前 1,000 筆）", async () => {
    const machines = Array.from({ length: 3 }, (_, i) => ({ model: `M${i}` }));
    const reports = Array.from({ length: 1001 }, (_, i) => ({
      model: `R${String(i).padStart(4, "0")}`,
    }));
    respond = (c) =>
      c.table === "mx_machines" ? paged(machines)(c) : paged(reports)(c);
    const res = await listMachineModelOptions();
    expect(res).toHaveLength(3 + 1001);
    expect(res).toContain("R1000");
    const sr = calls.filter((c) => c.table === "sr_reports");
    expect(sr.map((c) => c.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(sr[0].orders).toEqual(["id"]);
    expect(sr.every((c) => c.limit === null)).toBe(true);
  });

  it("listMachineModelOptions：sr_reports 讀取失敗（無維護報告單權限等）→ 整段略過，不帶入部分資料", async () => {
    const reports = Array.from({ length: 1500 }, (_, i) => ({
      model: `R${i}`,
    }));
    respond = (c) =>
      c.table === "mx_machines"
        ? [{ model: "M1" }]
        : c.range![0] === 0
          ? paged(reports)(c)
          : { error: { message: "denied" } };
    expect(await listMachineModelOptions()).toEqual(["M1"]);
  });
});
