import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/erp/queries/pickers.ts listAvailableSerials：
//   PostgREST 預設單次最多 1,000 列 → 需以 range 分頁讀到短頁；
//   item id 過多 → 分批 .in()，避免 URL 無限增長；結果依 serial_no、id 排序。

interface Call {
  filters: { fn: string; args: unknown[] }[];
  orders: string[];
  range: [number, number] | null;
}

let calls: Call[] = [];
let respond: (call: Call) => unknown[] = () => [];

class Query implements PromiseLike<{ data: unknown; error: null }> {
  call: Call = { filters: [], orders: [], range: null };
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
  order(col: string): this {
    this.call.orders.push(col);
    return this;
  }
  range(from: number, to: number): this {
    this.call.range = [from, to];
    return this;
  }
  then<A = { data: unknown; error: null }, B = never>(
    onfulfilled?:
      | ((v: { data: unknown; error: null }) => A | PromiseLike<A>)
      | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    calls.push(this.call);
    return Promise.resolve({ data: respond(this.call), error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({ from: () => new Query() })),
}));

import { listAvailableSerials } from "@/lib/erp/queries/pickers";

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
