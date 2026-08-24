import { describe, it, expect, vi, beforeEach } from "vitest";

// commitImportAction（#158 拍照辨識分流的兩張卡一次匯入）的寫入行為測試。
// 聚焦三件靠純函式測不到、但錯了會靜靜壞資料的事：
//   1. 空白欄名不建欄時，維護列的耗材值仍要對到正確的欄（不可整排錯位）。
//   2. 建欄的 .select() 回傳順序不保證，程式必須依 sort_order 排回插入順序。
//   3. 回滾要回到「什麼都沒發生」：附加到既有卡的維護列也得刪掉，但既有卡本身不能刪。
// 以假的 supabase query builder 捕捉送進 DB 的列。

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
  is(...args: unknown[]): this {
    this.filters.push({ fn: "is", args });
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
      const out = rows.map((r) => ({
        id: nextId(this.table),
        sort_order: r.sort_order,
      }));
      // 故意把耗材欄的回傳順序倒過來：PostgREST 不保證 .select() 的順序，
      // 程式必須自己依 sort_order 排回去才會對。
      const data =
        this.table === "mx_machine_columns" ? [...out].reverse() : out;
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireRole: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/gemini", () => ({ extractMaintenanceCard: vi.fn() }));
vi.mock("@/lib/admin/maintenance", () => ({
  findMachine: vi.fn(async () => null),
  findMachineAcrossCustomers: vi.fn(async () => null),
  findMachineByTag: vi.fn(async () => null),
  getMachineCardContext: vi.fn(async () => null),
  listMachineColumns: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import { commitImportAction } from "@/app/admin/(protected)/maintenance/actions";
import type {
  CommitCardBasic,
  CommitFilterRecord,
} from "@/app/admin/(protected)/maintenance/actions";

function basic(partial: Partial<CommitCardBasic> = {}): CommitCardBasic {
  return {
    customer_name: "和成欣業(股)公司(二廠) 25",
    customer_code: "KK123-1",
    serial_no: "J751307001",
    machine_no: "",
    location: "鶯歌區八德路1號(二廠)",
    purchased_at: "",
    model: "",
    horsepower: "",
    voltage: "",
    filter_spec: "",
    drain_spec: "",
    ...partial,
  };
}

function filterRec(values: (string | null)[]): CommitFilterRecord {
  return {
    service_date: "2026-01-23",
    technician: "江",
    note: null,
    service_type: null,
    values,
  };
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
});

describe("commitImportAction — 過濾卡耗材欄與維護列的對應", () => {
  it("空白欄名不建欄，但後面欄位的值不會整排錯位", async () => {
    const res = await commitImportAction({
      draftId: "",
      compressor: null,
      filter: {
        machineId: null,
        basic: basic({ serial_no: "100HA", filter_spec: "過濾100HA" }),
        // 中間那欄是員工按了「新增欄位」卻還沒命名的空白欄。
        columns: ["濾蕊", "", "排水器"],
        records: [filterRec(["1只", null, "3只"])],
      },
    });
    expect(res.ok).toBe(true);

    const cols = rowsInsertedInto("mx_machine_columns");
    expect(cols.map((c) => c.label)).toEqual(["濾蕊", "排水器"]);
    expect(cols.map((c) => c.sort_order)).toEqual([0, 1]);

    // 假 client 依插入順序發 id：濾蕊 = mx_machine_columns-1、排水器 = -2。
    const rec = rowsInsertedInto("mx_records")[0];
    expect(rec.values).toEqual({
      "mx_machine_columns-1": "1只",
      "mx_machine_columns-2": "3只",
    });
  });

  it("耗材欄 .select() 回傳順序被打亂時仍依 sort_order 對回去", async () => {
    await commitImportAction({
      draftId: "",
      compressor: null,
      filter: {
        machineId: null,
        basic: basic({ serial_no: "100HA" }),
        columns: ["散熱馬達", "葉片"],
        records: [filterRec(["12吋×2只", "12吋×2只"])],
      },
    });
    const rec = rowsInsertedInto("mx_records")[0];
    expect(rec.values).toEqual({
      "mx_machine_columns-1": "12吋×2只",
      "mx_machine_columns-2": "12吋×2只",
    });
  });

  it("完全沒有耗材欄時 values 存 null，日期 / 維護員照常寫入", async () => {
    await commitImportAction({
      draftId: "",
      compressor: null,
      filter: {
        machineId: null,
        basic: basic({ serial_no: "AL 010N + LM-P-010" }),
        columns: [],
        records: [filterRec([])],
      },
    });
    const rec = rowsInsertedInto("mx_records")[0];
    expect(rec.values).toBeNull();
    expect(rec.service_date).toBe("2026-01-23");
    expect(rec.technician).toBe("江");
  });
});

describe("commitImportAction — 必填把關（表單為 noValidate）", () => {
  it("客戶名稱空白 → 回錯誤，不會建出「（未命名客戶）」", async () => {
    const res = await commitImportAction({
      draftId: "",
      compressor: {
        machineId: null,
        basic: basic({ customer_name: "", customer_code: "" }),
        records: [],
      },
      filter: null,
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("客戶名稱");
    expect(rowsInsertedInto("mx_customers")).toHaveLength(0);
    expect(rowsInsertedInto("mx_machines")).toHaveLength(0);
  });

  it("機號空白 → 回錯誤", async () => {
    const res = await commitImportAction({
      draftId: "",
      compressor: null,
      filter: {
        machineId: null,
        basic: basic({ serial_no: "  " }),
        columns: [],
        records: [],
      },
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("機號");
  });
});

describe("commitImportAction — 卡別維度的識別範圍（0019）", () => {
  // 混合卡的兩張草稿現在都沿用表頭的機台代號（buildCardDrafts，#165）。
  // 0019 之後這不會互撞：唯一鍵是 (客戶, 卡別, 代號)，兩張草稿卡別不同。
  // 這一則釘住「一次 commit 真的把兩張同代號的卡都建了出來、且掛在同一個客戶下」——
  // 純函式測只看得到草稿長什麼樣，看不到送進 DB 的兩列。
  it("混合卡：兩張草稿沿用同一個代號，兩張都建得起來且同屬一個客戶", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    const res = await commitImportAction({
      draftId: "",
      compressor: {
        machineId: null,
        basic: basic({ machine_no: "A機" }),
        records: [],
      },
      filter: {
        machineId: null,
        basic: basic({ machine_no: "A機", serial_no: "AD480" }),
        columns: [],
        records: [],
      },
    });
    expect(res.ok).toBe(true);
    const rows = rowsInsertedInto("mx_machines");
    expect(rows.map((r) => [r.card_type, r.machine_no, r.customer_id])).toEqual(
      [
        ["compressor", "A機", "cust-1"],
        ["filter", "A機", "cust-1"],
      ],
    );
    // 同一張紙 → 同一個客戶，不該順手建出第二個客戶。
    expect(rowsInsertedInto("mx_customers")).toHaveLength(0);
  });

  // 撞號訊息是員工唯一的線索。0019 之後它必須點名「哪一種卡」，否則員工會以為
  // 整個客戶只能有一個 A機、跑去改一張根本不衝突的卡。
  it("撞代號（23505）→ 訊息點名卡別，並說明另一種卡仍可用同代號", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    failOn["mx_machines:insert"] = "23505";
    const res = await commitImportAction({
      draftId: "",
      compressor: null,
      filter: {
        machineId: null,
        basic: basic({ machine_no: "A機", serial_no: "AD480" }),
        columns: [],
        records: [],
      },
    });
    expect(res.ok).toBe(false);
    const msg = res.ok === false ? res.error : "";
    expect(msg).toContain("此客戶的過濾系統卡已有代號「A機」");
    expect(msg).toContain("空壓機卡仍可使用「A機」");
    // 舊的 `過濾系統卡：` 前綴已移除；留著會變成「過濾系統卡：此客戶的過濾系統卡…」。
    expect(msg).not.toContain("過濾系統卡：");
  });

  it("沒有代號時撞機號（23505）→ 訊息一樣要點名卡別，並引導補代號", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    failOn["mx_machines:insert"] = "23505";
    const res = await commitImportAction({
      draftId: "",
      compressor: {
        machineId: null,
        basic: basic({ machine_no: "", serial_no: "J751307001" }),
        records: [],
      },
      filter: null,
    });
    expect(res.ok).toBe(false);
    const msg = res.ok === false ? res.error : "";
    expect(msg).toContain("此客戶的空壓機卡已有相同機號");
    expect(msg).toContain("機台代號");
    expect(msg).not.toContain("空壓機卡：");
  });
});

describe("commitImportAction — 回滾", () => {
  it("過濾卡建卡失敗時，已寫進「既有空壓機卡」的維護列要刪掉，卡本身不能刪", async () => {
    // 過濾卡撞機號唯一索引（重複匯入同一張照片的典型情況）。
    failOn["mx_machines:insert"] = "23505";

    const res = await commitImportAction({
      draftId: "",
      compressor: {
        machineId: "existing-compressor",
        basic: basic(),
        records: [
          {
            service_date: "2026-06-18",
            hours: "46590",
            oil: "例",
            oil_filter: null,
            air_filter: null,
            oil_separator: null,
            inverter: null,
            filter_system: null,
            technician: "江",
            note: null,
            service_type: "inspection",
          },
        ],
      },
      filter: {
        machineId: null,
        basic: basic({ serial_no: "100HA" }),
        columns: ["散熱馬達"],
        records: [filterRec(["12吋×2只"])],
      },
    });

    expect(res.ok).toBe(false);

    const recordDeletes = recorded.filter(
      (r) => r.table === "mx_records" && r.kind === "delete",
    );
    expect(recordDeletes).toHaveLength(1);
    expect(recordDeletes[0].filters[0]).toEqual({
      fn: "in",
      args: ["id", ["mx_records-1"]],
    });

    // 既有卡永遠不能被回滾刪掉（本次沒有新建成功的卡，故一次 machine delete 都不該有）。
    const machineDeletes = recorded.filter(
      (r) => r.table === "mx_machines" && r.kind === "delete",
    );
    expect(machineDeletes).toHaveLength(0);
  });

  it("維護列寫入失敗時，本次新建的卡要刪掉", async () => {
    failOn["mx_records:insert"] = "維護紀錄爆炸";

    const res = await commitImportAction({
      draftId: "",
      compressor: {
        machineId: null,
        basic: basic(),
        records: [
          {
            service_date: "2026-06-18",
            hours: "46590",
            oil: "例",
            oil_filter: null,
            air_filter: null,
            oil_separator: null,
            inverter: null,
            filter_system: null,
            technician: "江",
            note: null,
            service_type: "inspection",
          },
        ],
      },
      filter: null,
    });

    expect(res.ok).toBe(false);
    const machineDeletes = recorded.filter(
      (r) => r.table === "mx_machines" && r.kind === "delete",
    );
    expect(machineDeletes).toHaveLength(1);
    expect(machineDeletes[0].filters[0]).toEqual({
      fn: "eq",
      args: ["id", "mx_machines-1"],
    });
  });

  it("兩張卡都沒勾 → 直接回錯誤，不碰 DB", async () => {
    const res = await commitImportAction({
      draftId: "",
      compressor: null,
      filter: null,
    });
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});
