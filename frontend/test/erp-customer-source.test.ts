import { beforeEach, describe, expect, it, vi } from "vitest";

// #266 客戶來源（mx_customers.source）：正規化、標籤、列表篩選（全部／FB／其他有值／未填）、
// 客戶表單寫入。資料全為虛構。
import {
  CUSTOMER_SOURCE_FILTERS,
  customerSourceLabel,
  isFbSource,
  normalizeCustomerSource,
  parseCustomerSourceFilter,
} from "@/lib/erp/customer-source";

describe("normalizeCustomerSource", () => {
  it.each([
    [" FB ", "FB"],
    ["fb", "FB"],
    ["Fb", "FB"],
    [" 展覽 ", "展覽"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ])("%j → %j", (input, expected) => {
    expect(normalizeCustomerSource(input)).toBe(expected);
  });
});

describe("isFbSource / customerSourceLabel", () => {
  it("FB（不分大小寫、去空白）→ 顯示「FB」；其他原文；空白 → null", () => {
    expect(isFbSource(" fb ")).toBe(true);
    expect(isFbSource("FB 社團")).toBe(false);
    expect(isFbSource(null)).toBe(false);
    expect(customerSourceLabel("fb")).toBe("FB");
    expect(customerSourceLabel(" 展覽 ")).toBe("展覽");
    expect(customerSourceLabel("  ")).toBeNull();
    expect(customerSourceLabel(null)).toBeNull();
  });
});

describe("parseCustomerSourceFilter", () => {
  it("只接受 fb／other／none，其餘為 all", () => {
    expect(parseCustomerSourceFilter("fb")).toBe("fb");
    expect(parseCustomerSourceFilter("other")).toBe("other");
    expect(parseCustomerSourceFilter("none")).toBe("none");
    expect(parseCustomerSourceFilter("")).toBe("all");
    expect(parseCustomerSourceFilter("FB'; drop")).toBe("all");
    expect(parseCustomerSourceFilter(undefined)).toBe("all");
  });

  it("選項：全部／FB／其他來源／未填", () => {
    expect(CUSTOMER_SOURCE_FILTERS.map((f) => [f.value, f.label])).toEqual([
      ["all", "全部"],
      ["fb", "FB"],
      ["other", "其他來源"],
      ["none", "未填"],
    ]);
  });
});

// ── 列表篩選（listErpCustomers）與表單寫入 ─────────────────────────

interface Recorded {
  table: string;
  kind: "select" | "insert" | "update";
  payload: unknown;
  select: unknown[];
  filters: { fn: string; args: unknown[] }[];
}
let recorded: Recorded[] = [];

type Res = { data: unknown; error: null; count?: number };

class Query implements PromiseLike<Res> {
  rec: Recorded;
  constructor(table: string) {
    this.rec = {
      table,
      kind: "select",
      payload: null,
      select: [],
      filters: [],
    };
  }
  select(...args: unknown[]): this {
    this.rec.select = args;
    return this;
  }
  insert(p: unknown): this {
    this.rec.kind = "insert";
    this.rec.payload = p;
    return this;
  }
  update(p: unknown): this {
    this.rec.kind = "update";
    this.rec.payload = p;
    return this;
  }
  private f(fn: string, args: unknown[]): this {
    this.rec.filters.push({ fn, args });
    return this;
  }
  eq(...a: unknown[]) {
    return this.f("eq", a);
  }
  is(...a: unknown[]) {
    return this.f("is", a);
  }
  not(...a: unknown[]) {
    return this.f("not", a);
  }
  ilike(...a: unknown[]) {
    return this.f("ilike", a);
  }
  or(...a: unknown[]) {
    return this.f("or", a);
  }
  order(...a: unknown[]) {
    return this.f("order", a);
  }
  range(...a: unknown[]) {
    return this.f("range", a);
  }
  single(): this {
    return this;
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    recorded.push(this.rec);
    const data =
      this.rec.kind === "insert" ? { id: "new-id" } : ([] as unknown[]);
    return Promise.resolve({ data, error: null, count: 1200 }).then(ok, bad);
  }
}

vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (t: string) => new Query(t),
  })),
}));
vi.mock("@/lib/admin/auth", () => ({ hasModule: vi.fn(async () => true) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  ERP_CUSTOMER_COLUMNS,
  listErpCustomers,
} from "@/lib/erp/queries/master-data";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/admin/(protected)/erp/customers/actions";
import { emptyCustomerInput } from "@/lib/erp/quick-create";
import { customerFormFields } from "@/lib/erp/customer-form-fields";

beforeEach(() => {
  recorded = [];
});

const sourceFilters = () =>
  recorded[0].filters.filter(
    (f) => ["is", "not", "ilike"].includes(f.fn) && f.args[0] === "source",
  );

describe("listErpCustomers：依來源篩選", () => {
  it("列表欄位含 source", () => {
    expect(ERP_CUSTOMER_COLUMNS.split(", ")).toContain("source");
  });

  it("all（預設）→ 不加來源條件", async () => {
    await listErpCustomers({});
    expect(sourceFilters()).toEqual([]);
  });

  it("fb → source ilike 'FB'（不分大小寫、無萬用字元）", async () => {
    await listErpCustomers({ source: "fb" });
    expect(sourceFilters()).toEqual([{ fn: "ilike", args: ["source", "FB"] }]);
  });

  it("other → 有值且不是 FB", async () => {
    await listErpCustomers({ source: "other" });
    expect(sourceFilters()).toEqual([
      { fn: "not", args: ["source", "is", null] },
      { fn: "not", args: ["source", "ilike", "FB"] },
    ]);
  });

  it("none → source is null", async () => {
    await listErpCustomers({ source: "none" });
    expect(sourceFilters()).toEqual([{ fn: "is", args: ["source", null] }]);
  });

  it("約 1,200 筆時第 20 頁仍以 range 分頁（每頁 50），total 來自 count", async () => {
    const res = await listErpCustomers({ source: "fb", page: 20 });
    expect(res.total).toBe(1200);
    expect(recorded[0].filters.find((f) => f.fn === "range")?.args).toEqual([
      950, 999,
    ]);
  });
});

describe("客戶表單：來源欄", () => {
  it("表單（含就地新增 Dialog）都有「客戶來源」欄", () => {
    for (const embedded of [true, false]) {
      expect(customerFormFields(embedded).map((f) => f.key)).toContain(
        "source",
      );
    }
    expect(emptyCustomerInput().source).toBe("");
  });

  it("建立／更新寫入 source（fb → FB、空白 → null）", async () => {
    await createCustomerAction(
      emptyCustomerInput({ name: "測試客戶", source: " fb " }),
    );
    expect(recorded[0].payload).toMatchObject({ source: "FB" });
    await updateCustomerAction(
      "c1",
      emptyCustomerInput({ name: "測試客戶", source: "  " }),
    );
    expect(recorded[1].payload).toMatchObject({ source: null });
    await updateCustomerAction(
      "c1",
      emptyCustomerInput({ name: "測試客戶", source: " 展覽 " }),
    );
    expect(recorded[2].payload).toMatchObject({ source: "展覽" });
  });
});
