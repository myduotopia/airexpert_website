import { describe, it, expect, vi, beforeEach } from "vitest";

// ERP 基本資料 server actions（#173）測試。以假的 supabase query builder 記錄送進 DB 的操作：
//   1. 無 erp 授權 → { ok:false, error:'沒有 ERP 權限' }，不碰 DB
//   2. 代碼唯一索引衝突（23505）→「代碼已存在」
//   3. 品項 kind 規則：service / expense 強制 track_stock=false、track_serial=false
//   4. 倉庫：有庫存或異動只能停用；設為預設倉會先取消其他倉的預設
//   5. 客戶：統編格式驗證、寫入 mx_customers 的 ERP 欄位

type Kind = "select" | "insert" | "update" | "delete";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = {
  data: unknown;
  error: { message: string; code?: string; details?: string } | null;
  count?: number | null;
};

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let moduleGranted = true;

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];

  constructor(public table: string) {}

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
  private filter(fn: string, args: unknown[]): this {
    this.filters.push({ fn, args });
    return this;
  }
  eq(...args: unknown[]): this {
    return this.filter("eq", args);
  }
  neq(...args: unknown[]): this {
    return this.filter("neq", args);
  }
  single(): this {
    return this;
  }
  maybeSingle(): this {
    return this;
  }

  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    });
    const r = responses[`${this.table}:${this.kind}`];
    if (r) return r(this);
    if (this.kind === "insert") {
      return { data: { id: `${this.table}-new` }, error: null };
    }
    return { data: null, error: null, count: 0 };
  }

  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const fakeSupabase = { from: (table: string) => new Query(table) };

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createItemAction,
  updateItemAction,
} from "@/app/admin/(protected)/erp/items/actions";
import {
  defaultItemInput,
  type ItemInput,
} from "@/app/admin/(protected)/erp/items/_lib/rules";
import {
  createWarehouseAction,
  deleteWarehouseAction,
  updateWarehouseAction,
} from "@/app/admin/(protected)/erp/warehouses/actions";
import {
  createVendorAction,
  deleteVendorAction,
} from "@/app/admin/(protected)/erp/vendors/actions";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/admin/(protected)/erp/customers/actions";
import type { CustomerInput, VendorInput } from "@/lib/erp/queries/master-data";

beforeEach(() => {
  recorded = [];
  responses = {};
  moduleGranted = true;
});

const uniqueViolation = (): Res => ({
  data: null,
  error: {
    code: "23505",
    message:
      'duplicate key value violates unique constraint "erp_items_code_key"',
  },
});

function item(patch: Partial<ItemInput> = {}): ItemInput {
  return {
    ...defaultItemInput("part"),
    code: "LM-F-0020-P",
    name: "濾心",
    ...patch,
  };
}

function vendor(patch: Partial<VendorInput> = {}): VendorInput {
  return {
    code: "KA405",
    name: "漢鐘精機",
    tax_id: "",
    contact_person: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
    currency: "TWD",
    payment_terms: "",
    active: true,
    note: "",
    ...patch,
  };
}

function customer(patch: Partial<CustomerInput> = {}): CustomerInput {
  return {
    code: "KC360",
    name: "喬申廚具專賣店",
    contact_person: "",
    phone: "",
    address: "",
    note: "",
    tax_id: "29484412",
    invoice_title: "",
    delivery_address: "",
    payment_terms: "月結30天",
    sales_rep: "",
    erp_active: true,
    ...patch,
  };
}

describe("未授權拒絕（不碰 DB）", () => {
  it.each([
    ["createItemAction", () => createItemAction(item())],
    ["updateItemAction", () => updateItemAction("i1", item())],
    [
      "createWarehouseAction",
      () =>
        createWarehouseAction({
          code: "W2",
          name: "二倉",
          is_default: false,
          active: true,
          note: "",
        }),
    ],
    ["deleteWarehouseAction", () => deleteWarehouseAction("w1")],
    ["createVendorAction", () => createVendorAction(vendor())],
    ["deleteVendorAction", () => deleteVendorAction("v1")],
    ["createCustomerAction", () => createCustomerAction(customer())],
    ["updateCustomerAction", () => updateCustomerAction("c1", customer())],
  ])("%s → 沒有 ERP 權限", async (_name, run) => {
    moduleGranted = false;
    expect(await run()).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(recorded).toHaveLength(0);
  });
});

describe("代碼重複（23505）→ 代碼已存在", () => {
  it("品項", async () => {
    responses["erp_items:insert"] = uniqueViolation;
    const res = await createItemAction(item());
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("代碼已存在");
  });

  it("廠商", async () => {
    responses["erp_vendors:insert"] = uniqueViolation;
    const res = await createVendorAction(vendor());
    expect(!res.ok && res.error).toContain("代碼已存在");
  });

  it("客戶（mx_customers_code_key）", async () => {
    responses["mx_customers:update"] = uniqueViolation;
    const res = await updateCustomerAction("c1", customer());
    expect(!res.ok && res.error).toContain("代碼已存在");
  });

  it("倉庫預設倉索引衝突給不同訊息", async () => {
    responses["erp_warehouses:insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "erp_warehouses_default_key"',
      },
    });
    const res = await createWarehouseAction({
      code: "W2",
      name: "二倉",
      is_default: true,
      active: true,
      note: "",
    });
    expect(!res.ok && res.error).toContain("預設倉");
  });
});

describe("品項 kind 規則", () => {
  it.each(["service", "expense"] as const)(
    "%s 強制 track_stock=false、track_serial=false、不建保養卡",
    async (kind) => {
      const res = await createItemAction(
        item({
          code: "運費",
          kind,
          track_stock: true,
          track_serial: true,
          mx_card_type: "compressor",
        }),
      );
      expect(res).toEqual({ ok: true, id: "erp_items-new" });
      const insert = recorded.find((r) => r.kind === "insert");
      expect(insert?.payload).toMatchObject({
        kind,
        track_stock: false,
        track_serial: false,
        mx_card_type: null,
      });
    },
  );

  it("整機 + 空壓機卡（ALH-15AI）：追蹤機號與庫存，avg_cost 不寫入", async () => {
    const res = await createItemAction(
      item({
        code: " ALH-15AI ",
        name: "漢鐘 15HP 空壓機",
        kind: "machine",
        track_stock: false,
        track_serial: false,
        mx_card_type: "compressor",
      }),
    );
    expect(res.ok).toBe(true);
    const payload = recorded.find((r) => r.kind === "insert")
      ?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      code: "ALH-15AI",
      track_serial: true,
      track_stock: true,
      mx_card_type: "compressor",
    });
    expect(payload).not.toHaveProperty("avg_cost");
  });

  it("預設值：整機預設追蹤機號", () => {
    expect(defaultItemInput("machine")).toMatchObject({
      track_serial: true,
      track_stock: true,
    });
    expect(defaultItemInput("service")).toMatchObject({
      track_serial: false,
      track_stock: false,
    });
  });

  it("缺代碼 → 驗證錯誤，不碰 DB", async () => {
    const res = await createItemAction(item({ code: "  " }));
    expect(res).toEqual({ ok: false, error: "請填寫產品編號。" });
    expect(recorded).toHaveLength(0);
  });

  it("已有庫存異動時不可變更追蹤設定", async () => {
    responses["erp_items:select"] = () => ({
      data: { track_stock: true, track_serial: false },
      error: null,
    });
    responses["erp_stock_moves:select"] = () => ({
      data: null,
      error: null,
      count: 3,
    });
    const res = await updateItemAction("i1", item({ kind: "service" }));
    expect(res.ok).toBe(false);
    expect(recorded.some((r) => r.kind === "update")).toBe(false);
  });
});

describe("倉庫", () => {
  it("有異動 → 只能停用，不送 delete", async () => {
    responses["erp_warehouses:select"] = () => ({
      data: { is_default: false },
      error: null,
    });
    responses["erp_stock_moves:select"] = () => ({
      data: null,
      error: null,
      count: 1,
    });
    const res = await deleteWarehouseAction("w1");
    expect(res).toEqual({
      ok: false,
      error: "此倉庫已有庫存或異動，不能刪除，只能停用。",
    });
    expect(recorded.some((r) => r.kind === "delete")).toBe(false);
  });

  it("無庫存與異動 → 刪除", async () => {
    responses["erp_warehouses:select"] = () => ({
      data: { is_default: false },
      error: null,
    });
    expect(await deleteWarehouseAction("w1")).toEqual({ ok: true });
    expect(
      recorded.some((r) => r.table === "erp_warehouses" && r.kind === "delete"),
    ).toBe(true);
  });

  it("設為預設倉：先取消其他倉的預設再更新本筆", async () => {
    const res = await updateWarehouseAction("w2", {
      code: "W2",
      name: "二倉",
      is_default: true,
      active: true,
      note: "",
    });
    expect(res).toEqual({ ok: true, id: "w2" });
    const updates = recorded.filter((r) => r.kind === "update");
    expect(updates[0].payload).toEqual({ is_default: false });
    expect(updates[0].filters).toContainEqual({
      fn: "neq",
      args: ["id", "w2"],
    });
    expect(updates[1].payload).toMatchObject({ is_default: true });
  });

  it("預設倉不可停用", async () => {
    const res = await createWarehouseAction({
      code: "W2",
      name: "二倉",
      is_default: true,
      active: false,
      note: "",
    });
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});

describe("廠商／客戶", () => {
  it("廠商被引用（23503）→ 提示改停用", async () => {
    responses["erp_vendors:delete"] = () => ({
      data: null,
      error: { code: "23503", message: "fk" },
    });
    const res = await deleteVendorAction("v1");
    expect(!res.ok && res.error).toContain("停用");
  });

  it("客戶統編非 8 碼 → 驗證錯誤", async () => {
    const res = await createCustomerAction(customer({ tax_id: "1234" }));
    expect(res).toEqual({ ok: false, error: "統一編號應為 8 位數字。" });
    expect(recorded).toHaveLength(0);
  });

  it("建立客戶 KC360：寫入 ERP 欄位，空字串轉 null", async () => {
    const res = await createCustomerAction(customer());
    expect(res).toEqual({ ok: true, id: "mx_customers-new" });
    expect(recorded[0].payload).toMatchObject({
      code: "KC360",
      name: "喬申廚具專賣店",
      tax_id: "29484412",
      payment_terms: "月結30天",
      invoice_title: null,
      erp_active: true,
    });
  });
});
