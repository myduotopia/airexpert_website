import { describe, it, expect, vi, beforeEach } from "vitest";

// 客戶主檔 DAL（#156）的彙總邏輯測試：
//   * listCustomers  — 機台數只算使用中、最後保養日跨「所有」機台（含封存）
//   * getCustomer    — 使用中 / 已封存分區、每台自己的最後保養日
//   * isCustomerCodeTaken — 正規化（lower + trim）後的重複判定
// 以假 Supabase client 取代真連線，只驗證 map / filter 的行為。
const getServerSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-server", () => ({ getServerSupabase }));

import {
  listCustomers,
  getCustomer,
  isCustomerCodeTaken,
} from "@/lib/admin/maintenance";

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

const CHAIN = ["select", "eq", "neq", "order", "ilike", "is", "not", "limit"];

/**
 * 依 table 名稱回傳預設結果的假 client。值給陣列時依序取用（同一 table 多次查詢）。
 * 所有 filter 呼叫都記在 calls 供斷言（例：ilike 的 pattern）。
 */
function fakeSupabase(results: Record<string, Result | Result[]>) {
  const calls: Call[] = [];
  function builderFor(table: string) {
    const take = (): Result => {
      const r = results[table];
      if (Array.isArray(r)) return r.shift() ?? { data: null, error: null };
      return r ?? { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      then: (resolve: (r: Result) => unknown) =>
        Promise.resolve(take()).then(resolve),
      maybeSingle: () => Promise.resolve(take()),
    };
    for (const m of CHAIN) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return builder;
      };
    }
    return builder;
  }
  getServerSupabase.mockResolvedValue({ from: (t: string) => builderFor(t) });
  return calls;
}

beforeEach(() => {
  getServerSupabase.mockReset();
});

describe("listCustomers", () => {
  it("機台數只算使用中；最後保養日跨所有機台（含已封存）取最新", async () => {
    fakeSupabase({
      mx_customers: {
        data: [
          {
            id: "c1",
            name: "念德鋼鐵",
            code: "KC054",
            contact_person: "王先生",
            phone: "04-1234567",
            address: null,
            note: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-02-01T00:00:00Z",
            mx_machines: [
              {
                archived_at: null,
                mx_records: [
                  { service_date: "2024-03-01" },
                  { service_date: "2024-05-02" },
                ],
              },
              { archived_at: null, mx_records: [] },
              // 已封存：不計入機台數，但其保養日仍納入「最後保養日」。
              {
                archived_at: "2024-06-01T00:00:00Z",
                mx_records: [{ service_date: "2024-09-09" }],
              },
            ],
          },
        ],
        error: null,
      },
    });

    const [c] = await listCustomers();
    expect(c.machine_count).toBe(2);
    expect(c.last_service_date).toBe("2024-09-09");
    // 內嵌鍵不可外洩到列表項目（否則會被當成客戶欄位傳進 client component）。
    expect(c).not.toHaveProperty("mx_machines");
    expect(c.name).toBe("念德鋼鐵");
    expect(c.phone).toBe("04-1234567");
  });

  it("沒有機台 / 沒有保養日的客戶回 0 與 null，不會丟錯", async () => {
    fakeSupabase({
      mx_customers: {
        data: [
          { id: "c1", name: "A", code: null, mx_machines: [] },
          { id: "c2", name: "B", code: null, mx_machines: null },
          {
            id: "c3",
            name: "C",
            code: null,
            mx_machines: [
              { archived_at: null, mx_records: [{ service_date: null }] },
            ],
          },
        ],
        error: null,
      },
    });

    const rows = await listCustomers();
    expect(rows.map((r) => r.machine_count)).toEqual([0, 0, 1]);
    expect(rows.map((r) => r.last_service_date)).toEqual([null, null, null]);
  });

  it("查詢失敗時丟出可讀錯誤", async () => {
    fakeSupabase({
      mx_customers: { data: null, error: { message: "boom" } },
    });
    await expect(listCustomers()).rejects.toThrow(/讀取客戶失敗：boom/);
  });
});

describe("getCustomer", () => {
  it("查無客戶回 null（頁面轉 notFound），且不再查機台", async () => {
    const calls = fakeSupabase({
      mx_customers: { data: null, error: null },
    });
    expect(await getCustomer("nope")).toBeNull();
    expect(calls.some((c) => c.table === "mx_machines")).toBe(false);
  });

  it("依 archived_at 分成使用中 / 已封存，各自帶自己的最後保養日", async () => {
    fakeSupabase({
      mx_customers: { data: { id: "c1", name: "念德鋼鐵" }, error: null },
      mx_machines: {
        data: [
          {
            id: "m1",
            archived_at: null,
            serial_no: "B001",
            card_type: "filter",
            mx_records: [
              { service_date: "2024-01-01" },
              { service_date: "2024-07-31" },
            ],
          },
          {
            id: "m2",
            archived_at: "2024-06-01T00:00:00Z",
            serial_no: "B002",
            mx_records: [{ service_date: "2023-12-31" }],
          },
          { id: "m3", archived_at: null, serial_no: "B003", mx_records: [] },
        ],
        error: null,
      },
    });

    const data = await getCustomer("c1");
    expect(data).not.toBeNull();
    expect(data!.active.map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(data!.archived.map((m) => m.id)).toEqual(["m2"]);
    expect(data!.active[0].last_service_date).toBe("2024-07-31");
    expect(data!.active[1].last_service_date).toBeNull();
    expect(data!.archived[0].last_service_date).toBe("2023-12-31");
    // card_type 由 #155 新增；select("*") 取回時應原樣帶出。
    expect(data!.active[0].card_type).toBe("filter");
    expect(data!.active[0]).not.toHaveProperty("mx_records");
  });
});

describe("isCustomerCodeTaken", () => {
  it("空 / 純空白編號不查 DB，直接回 false", async () => {
    const calls = fakeSupabase({});
    expect(await isCustomerCodeTaken("  ", "c1")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("其他客戶用了同一組編號（大小寫不同）→ true", async () => {
    fakeSupabase({
      mx_customers: { data: [{ id: "c2", code: "KC054" }], error: null },
    });
    expect(await isCustomerCodeTaken("kc054", "c1")).toBe(true);
  });

  it("DB 值前後帶空白（0013 由 card_no 回填可能如此）仍判定為重複", async () => {
    const calls = fakeSupabase({
      mx_customers: { data: [{ id: "c2", code: " KC054 " }], error: null },
    });
    expect(await isCustomerCodeTaken("KC054", "c1")).toBe(true);
    // 粗篩必須用「包含」，精確比對才輪得到 normalizeCustomerCode 出手。
    const ilike = calls.find((c) => c.method === "ilike");
    expect(ilike?.args).toEqual(["code", "%kc054%"]);
  });

  it("粗篩撈到的相近編號不會誤報（正規化後不相等 → false）", async () => {
    fakeSupabase({
      mx_customers: {
        data: [
          { id: "c2", code: "KC0540" },
          { id: "c3", code: "XKC054" },
          { id: "c4", code: null },
        ],
        error: null,
      },
    });
    expect(await isCustomerCodeTaken("KC054", "c1")).toBe(false);
  });

  it("查詢失敗只是不提示，不擋儲存", async () => {
    fakeSupabase({
      mx_customers: { data: null, error: { message: "boom" } },
    });
    expect(await isCustomerCodeTaken("KC054", "c1")).toBe(false);
  });
});
