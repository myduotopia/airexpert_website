import { describe, it, expect, vi, beforeEach } from "vitest";

// #165 機台識別改三段式後的比對行為。三件事錯了會靜靜壞資料，純函式測不到：
//   1. 建卡 / 改卡的衝突預檢是 (客戶, 卡別, 機台代號)（0019），而不是全域機號。
//   2. 機號改為選填：只有機台代號的卡要建得起來。
//   3. 拍照辨識**先解析客戶、再在該客戶內找機台**；客戶對不上時不自動比對，
//      只回一張 otherCustomer 提示卡（UI 預設不附加）。
// 以假的 supabase query builder 捕捉送進 DB 的列（同 maintenance-import-commit）。

interface Recorded {
  table: string;
  kind: "select" | "insert" | "update" | "delete";
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}

let recorded: Recorded[] = [];
let selectRows: Record<string, Record<string, unknown>[]> = {};
let idSeq: Record<string, number> = {};

function nextId(table: string): string {
  idSeq[table] = (idSeq[table] ?? 0) + 1;
  return `${table}-${idSeq[table]}`;
}

type Res = { data: unknown; error: { message: string; code?: string } | null };

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
  is(...args: unknown[]): this {
    this.filters.push({ fn: "is", args });
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
    if (this.kind === "insert") {
      const rows = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Record<string, unknown>[];
      const data = rows.map(() => ({ id: nextId(this.table) }));
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

/** 比對函式的替身；每個 case 自行決定回什麼。 */
const findMachine = vi.fn();
const findMachineByTag = vi.fn();
const findMachineAcrossCustomers = vi.fn();
const extractMaintenanceCard = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireRole: vi.fn(async () => {}) }));
vi.mock("@/lib/ai/gemini", () => ({
  extractMaintenanceCard: (...args: unknown[]) =>
    extractMaintenanceCard(...args),
}));
vi.mock("@/lib/admin/maintenance", () => ({
  findMachine: (...args: unknown[]) => findMachine(...args),
  findMachineByTag: (...args: unknown[]) => findMachineByTag(...args),
  findMachineAcrossCustomers: (...args: unknown[]) =>
    findMachineAcrossCustomers(...args),
  getMachineCardContext: vi.fn(async () => null),
  isCustomerCodeTaken: vi.fn(async () => false),
  listMachineColumns: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  createMachineAction,
  extractCardFromImageAction,
} from "@/app/admin/(protected)/maintenance/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    customer_name: "兆利科技股份有限公司",
    customer_code: "",
    card_type: "compressor",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
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
  selectRows = {};
  idSeq = {};
  findMachine.mockReset().mockResolvedValue(null);
  findMachineByTag.mockReset().mockResolvedValue(null);
  findMachineAcrossCustomers.mockReset().mockResolvedValue(null);
  extractMaintenanceCard.mockReset();
});

describe("createMachineAction — 唯一性範圍是 (客戶, 卡別)", () => {
  it("只填機台代號、機號留空也能建卡（機號已改選填）", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    const res = await createMachineAction(
      form({ machine_no: "A機", serial_no: "" }),
    );
    expect(res.ok).toBe(true);
    expect(rowsInsertedInto("mx_machines")[0]).toMatchObject({
      customer_id: "cust-1",
      machine_no: "A機",
      serial_no: null,
    });
  });

  it("同一客戶、同一卡別內代號重複 → 預檢擋下，訊息指名卡別與代號", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    findMachineByTag.mockResolvedValue({
      id: "m-1",
      machine_no: "A機",
      serial_no: "AD480",
      card_type: "compressor",
      customer_name: "兆利科技股份有限公司",
    });
    const res = await createMachineAction(
      form({ machine_no: "A機", serial_no: "AD480" }),
    );
    expect(res.ok).toBe(false);
    const msg = res.ok === false ? res.error : "";
    expect(msg).toContain("此客戶的空壓機卡已有代號「A機」");
    // 訊息要讓員工知道「另一種卡仍可叫 A機」，否則會以為整個客戶只能有一個 A機。
    expect(msg).toContain("過濾系統卡仍可使用「A機」");
    // 預檢擋下就不該再送 insert（也就不會撞 23505）。
    expect(rowsInsertedInto("mx_machines")).toHaveLength(0);
    expect(findMachineByTag).toHaveBeenCalledWith(
      "cust-1",
      "A機",
      "compressor",
    );
  });

  it("代號預檢框在「這個客戶」內：不同客戶用同一個代號互不干擾", async () => {
    selectRows.mx_customers = [{ id: "cust-2" }];
    const res = await createMachineAction(
      form({ customer_name: "和成欣業(股)公司", machine_no: "A機" }),
    );
    expect(res.ok).toBe(true);
    expect(findMachineByTag).toHaveBeenCalledWith(
      "cust-2",
      "A機",
      "compressor",
    );
  });

  // 0019：代號的唯一範圍加入卡別。現場的乾燥機就擺在 A機 旁邊，紙卡上往往也
  // 標成「A機」——預檢若不帶卡別，就會擋下 DB 其實接受的資料。
  it("預檢帶著卡別：過濾卡沿用空壓機的「A機」不該被擋", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    const res = await createMachineAction(
      form({ card_type: "filter", machine_no: "A機", serial_no: "AD480" }),
    );
    expect(res.ok).toBe(true);
    expect(findMachineByTag).toHaveBeenCalledWith("cust-1", "A機", "filter");
    expect(rowsInsertedInto("mx_machines")[0]).toMatchObject({
      card_type: "filter",
      machine_no: "A機",
    });
  });

  it("沒有代號、機號在同一客戶同一卡別內重複（23505）→ 引導補代號", async () => {
    selectRows.mx_customers = [{ id: "cust-1" }];
    // 這一段只驗訊息選擇邏輯：insert 由假 client 回 23505。
    const spy = vi
      .spyOn(fakeSupabase, "from")
      .mockImplementation((table: string) => {
        const q = new Query(table);
        if (table === "mx_machines") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (q as any).then = (onfulfilled: (v: Res) => unknown) =>
            Promise.resolve(
              onfulfilled({
                data: null,
                error: { message: "duplicate", code: "23505" },
              }),
            );
        }
        return q;
      });
    const res = await createMachineAction(form({ serial_no: "AD480" }));
    spy.mockRestore();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("機台代號");
  });
});

describe("extractCardFromImageAction — 先解析客戶，再在客戶內找機台", () => {
  /** 讓 Gemini 替身回一張「A機 / J751307001」的空壓機卡。 */
  function stubExtraction() {
    extractMaintenanceCard.mockResolvedValue({
      raw: {
        basic: {
          customer_name: "兆利科技股份有限公司",
          customer_code: "KC054",
          serial_no: "J751307001",
          machine_no: "A機",
        },
        records: [{ service_date: "2026-01-23", oil: "例" }],
      },
      model: "gemini",
    });
  }
  const input = {
    imageBase64: "x",
    mimeType: "image/jpeg",
    photoPath: "p.jpg",
  };

  it("客戶對得上 → 在該客戶內以機台代號比對，命中即為確定的比對", async () => {
    stubExtraction();
    selectRows.mx_customers = [{ id: "cust-1" }];
    findMachine.mockResolvedValue({
      id: "m-1",
      serial_no: "J751307001",
      machine_no: "A機",
      card_type: "compressor",
      customer_id: "cust-1",
      customer_name: "兆利科技股份有限公司",
      customer_code: "KC054",
      confident: true,
    });

    const res = await extractCardFromImageAction(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.customerResolved).toBe(true);
    expect(findMachine).toHaveBeenCalledWith({
      customerId: "cust-1",
      machineNo: "A機",
      serialNo: "J751307001",
      cardType: "compressor",
    });
    // 客戶已確定 → 不該再去做跨客戶的提示查詢。
    expect(findMachineAcrossCustomers).not.toHaveBeenCalled();
    expect(res.match?.id).toBe("m-1");
    expect(res.match?.otherCustomer).toBe(false);
    // 代號命中 → 確定是同一台 → 核對畫面預設勾「附加」。
    expect(res.match?.uncertain).toBe(false);
  });

  it("同客戶內只憑機號比到的卡（confident=false）→ uncertain=true，附加不可預設開", async () => {
    // 照片是「B機／AD480」的過濾卡，客戶名下只有一張沒有代號的 AD480 卡：
    // 它可能就是這台（還沒補代號），也可能是同客戶的另一台 AD480。
    stubExtraction();
    selectRows.mx_customers = [{ id: "cust-1" }];
    findMachine.mockResolvedValue({
      id: "m-1",
      serial_no: "AD480",
      machine_no: null,
      card_type: "filter",
      customer_id: "cust-1",
      customer_name: "兆利科技股份有限公司",
      customer_code: "KC054",
      confident: false,
    });

    const res = await extractCardFromImageAction(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.match?.id).toBe("m-1");
    expect(res.match?.otherCustomer).toBe(false);
    expect(res.match?.uncertain).toBe(true);
  });

  it("客戶對不上 → 不在任何客戶內比對，只回其他客戶的同識別卡當提示", async () => {
    stubExtraction();
    selectRows.mx_customers = []; // 查無此客戶
    findMachineAcrossCustomers.mockResolvedValue({
      id: "m-9",
      serial_no: "J751307001",
      machine_no: "A機",
      card_type: "compressor",
      customer_id: "cust-9",
      customer_name: "和成欣業(股)公司",
      customer_code: "KK123-1",
      confident: false,
    });

    const res = await extractCardFromImageAction(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 客戶未定 → 絕不可拿某個客戶去比對機台。
    expect(findMachine).not.toHaveBeenCalled();
    // 提示只能以「機號」跨客戶找：代號（A機）跨客戶必然重複，拿它比是亂猜。
    expect(findMachineAcrossCustomers).toHaveBeenCalledWith({
      serialNo: "J751307001",
      cardType: "compressor",
    });
    expect(res.match?.id).toBe("m-9");
    // otherCustomer=true 讓核對畫面預設「建立新卡」、附加開關預設關閉。
    expect(res.match?.otherCustomer).toBe(true);
    expect(res.match?.customer_name).toBe("和成欣業(股)公司");
    expect(res.match?.machine_no).toBe("A機");
    // 核對畫面要能講出「這次會一併建新客戶」。
    expect(res.customerResolved).toBe(false);
  });

  it("過濾卡 + 客戶對不上 → 連跨客戶提示都不做（型號不是身分）", async () => {
    // 過濾卡的「機號」是過濾器型號（AD480），跨客戶命中只代表「另一家也買了同款
    // 乾燥機」，提示裡點名的公司與這張照片毫無關係 —— 零資訊量的提示比沒有更糟
    // （同 round 1 拿掉「跨客戶比代號」的理由）。客戶對不上這件事由上方橫幅講明。
    extractMaintenanceCard.mockResolvedValue({
      raw: {
        basic: {
          customer_name: "沒見過的公司",
          customer_code: "",
          serial_no: "過濾AD480",
          machine_no: "B機",
        },
        records: [{ service_date: "2026-01-23", filter_system: "乾燥機濾芯" }],
      },
      model: "gemini",
    });
    selectRows.mx_customers = []; // 查無此客戶
    const res = await extractCardFromImageAction(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cards.compressor).toBeNull();
    expect(res.cards.filter).not.toBeNull();
    expect(findMachine).not.toHaveBeenCalled();
    expect(findMachineAcrossCustomers).not.toHaveBeenCalled();
    expect(res.filterMatch).toBeNull();
    // 員工要拿到的訊號是「客戶對不上」，不是某家不相干公司的 AD480。
    expect(res.customerResolved).toBe(false);
  });

  it("客戶對不上、其他客戶也沒有同識別卡 → 就是一張全新的卡", async () => {
    stubExtraction();
    selectRows.mx_customers = [];
    const res = await extractCardFromImageAction(input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.match).toBeNull();
    // 比對不到既有卡「而且」客戶也對不上 —— 後者是靜靜多一個客戶的來源，要另外提示。
    expect(res.customerResolved).toBe(false);
  });
});
