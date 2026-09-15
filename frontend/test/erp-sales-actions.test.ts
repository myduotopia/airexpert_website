import { describe, it, expect, vi, beforeEach } from "vitest";

// 銷售區段 server actions（app/admin/(protected)/erp/sales/actions.ts）：
//   1. 無 erp 授權 → 一律回「沒有 ERP 權限」，不碰 DB / RPC；
//   2. 過帳錯誤碼轉中文（insufficient_stock）；
//   3. 只能操作 Q / S / SR 單據；
//   4. 報價轉銷貨、銷貨建立銷退、銷退超量檢查；
//   5. 銷貨過帳 / 作廢 revalidate 保養卡頁。

type Kind = "select" | "insert" | "update" | "delete";
interface Recorded {
  table: string;
  kind: Kind;
  columns: string;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = {
  data: unknown;
  error: { message: string; details?: string } | null;
};

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: Res = { data: null, error: null };
let moduleGranted = true;
const revalidateSpy = vi.fn();

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  columns = "";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  wantOne = false;

  constructor(public table: string) {}

  select(cols?: string): this {
    if (this.kind === "select" && cols) this.columns = cols;
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
  in(...args: unknown[]): this {
    return this.filter("in", args);
  }
  not(...args: unknown[]): this {
    return this.filter("not", args);
  }
  order(): this {
    return this;
  }
  single(): this {
    this.wantOne = true;
    return this;
  }
  maybeSingle(): this {
    this.wantOne = true;
    return this;
  }

  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      columns: this.columns,
      payload: this.payload,
      filters: this.filters,
    });
    const r = responses[`${this.table}:${this.kind}`];
    if (r) return r(this);
    if (this.kind === "insert") {
      const rows = (
        Array.isArray(this.payload) ? this.payload : [this.payload]
      ) as Record<string, unknown>[];
      const data = rows.map((row, i) => ({
        id: `${this.table}-${i + 1}`,
        line_no: row.line_no,
      }));
      return { data: this.wantOne ? data[0] : data, error: null };
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
  from: (table: string) => new Query(table),
  rpc: async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return rpcResponse;
  },
};

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateSpy(...args),
}));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  convertQuoteToSaleAction,
  createSalesReturnAction,
  deleteSalesDraftAction,
  postSalesDocumentAction,
  saveSalesDraftAction,
  voidSalesDocumentAction,
} from "@/app/admin/(protected)/erp/sales/actions";
import { newDraftDocument, newDraftLine } from "@/lib/erp/draft";
import { ERP_ERROR_MESSAGES } from "@/lib/erp/errors";

beforeEach(() => {
  recorded = [];
  responses = {};
  rpcCalls = [];
  rpcResponse = { data: null, error: null };
  moduleGranted = true;
  revalidateSpy.mockClear();
});

/** erp_documents 的 select：含 lines 的是 getDocumentWithLines，其餘為單別查詢。 */
function documentsSelect(
  docWithLines: Record<string, unknown> | null,
  docType: string | null,
) {
  responses["erp_documents:select"] = (q) =>
    q.columns.includes("lines:")
      ? { data: docWithLines, error: null }
      : { data: docType ? { doc_type: docType } : null, error: null };
}

const CUSTOMER = {
  name: "兆利科技",
  invoice_title: null,
  tax_id: null,
  contact_person: null,
  phone: null,
  address: null,
  delivery_address: null,
  sales_rep: "阿宏",
};

function lineRow(id: string, lineNo: number, patch: Record<string, unknown>) {
  return {
    id,
    document_id: "doc",
    line_no: lineNo,
    line_type: "item",
    item_id: null,
    description: null,
    qty: 0,
    unit_price: 0,
    amount: 0,
    unit_cost: null,
    source_line_id: null,
    serial_nos: null,
    serials: [],
    ...patch,
  };
}

function docRow(patch: Record<string, unknown>) {
  return {
    id: "doc-1",
    doc_type: "S",
    doc_no: "S11509047",
    doc_date: "2026-09-10",
    status: "posted",
    customer_id: "cust-1",
    vendor_id: null,
    warehouse_id: "wh-main",
    to_warehouse_id: null,
    source_doc_id: null,
    sales_rep: "阿宏",
    tax_type: "included",
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    invoice_no: null,
    expected_date: null,
    note: null,
    lines: [],
    ...patch,
  };
}

describe("未授權 → 拒絕，不碰 DB / RPC", () => {
  beforeEach(() => {
    moduleGranted = false;
  });

  it.each([
    [
      "saveSalesDraftAction",
      () => saveSalesDraftAction(newDraftDocument("S", "2026-09-15")),
    ],
    ["deleteSalesDraftAction", () => deleteSalesDraftAction("doc-1")],
    ["postSalesDocumentAction", () => postSalesDocumentAction("doc-1")],
    ["voidSalesDocumentAction", () => voidSalesDocumentAction("doc-1", "取消")],
    ["convertQuoteToSaleAction", () => convertQuoteToSaleAction("q-1")],
    ["createSalesReturnAction", () => createSalesReturnAction("s-1")],
  ])("%s", async (_name, call) => {
    expect(await call()).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(recorded).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

describe("postSalesDocumentAction", () => {
  it("insufficient_stock（無 details）→ 中文訊息，不 revalidate", async () => {
    documentsSelect(null, "S");
    rpcResponse = { data: null, error: { message: "insufficient_stock" } };
    const res = await postSalesDocumentAction("doc-1");
    expect(res).toEqual({
      ok: false,
      error: ERP_ERROR_MESSAGES.insufficient_stock,
    });
    expect(res.ok === false && res.error).toBe("庫存不足，無法出庫。");
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it("insufficient_stock 帶 details → 顯示 RPC 的中文細節", async () => {
    documentsSelect(null, "S");
    rpcResponse = {
      data: null,
      error: {
        message: "insufficient_stock",
        details: "品項 ALH-15AI 於倉庫 MAIN 庫存不足",
      },
    };
    expect(await postSalesDocumentAction("doc-1")).toEqual({
      ok: false,
      error: "品項 ALH-15AI 於倉庫 MAIN 庫存不足",
    });
  });

  it("非銷售單據（採購單）→ 拒絕，不呼叫 RPC", async () => {
    documentsSelect(null, "P");
    const res = await postSalesDocumentAction("doc-1");
    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("銷貨過帳成功 → 回傳保養卡機台與警告，revalidate 保養卡頁", async () => {
    documentsSelect(null, "S");
    rpcResponse = {
      data: {
        doc_no: "S11509047",
        warnings: ["機號 X 已有保養卡機台，已直接連結"],
        mx_machine_ids: ["m-1"],
      },
      error: null,
    };
    responses["mx_machines:select"] = () => ({
      data: [{ id: "m-1", serial_no: "26-PM15060010", model: "ALH-15AI" }],
      error: null,
    });
    const res = await postSalesDocumentAction("doc-1");
    expect(res).toEqual({
      ok: true,
      data: {
        doc_no: "S11509047",
        warnings: ["機號 X 已有保養卡機台，已直接連結"],
        machines: [
          { id: "m-1", serial_no: "26-PM15060010", model: "ALH-15AI" },
        ],
      },
    });
    expect(rpcCalls).toEqual([
      { fn: "erp_post_document", args: { p_doc_id: "doc-1" } },
    ]);
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/maintenance", "layout");
  });
});

describe("voidSalesDocumentAction", () => {
  it("原因必填；has_dependents 轉中文；成功回傳警告", async () => {
    expect((await voidSalesDocumentAction("doc-1", " ")).ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);

    documentsSelect(null, "S");
    rpcResponse = { data: null, error: { message: "has_dependents" } };
    expect(await voidSalesDocumentAction("doc-1", "客戶取消")).toEqual({
      ok: false,
      error: ERP_ERROR_MESSAGES.has_dependents,
    });

    rpcResponse = {
      data: {
        warnings: ["機號 X 的保養卡機台已有保養紀錄，保留機台僅解除連結"],
      },
      error: null,
    };
    expect(await voidSalesDocumentAction("doc-1", "客戶取消")).toEqual({
      ok: true,
      data: {
        warnings: ["機號 X 的保養卡機台已有保養紀錄，保留機台僅解除連結"],
      },
    });
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/maintenance", "layout");
  });
});

describe("convertQuoteToSaleAction", () => {
  const quoteLines = [
    lineRow("ql-1", 1, {
      item_id: "item-alh",
      description: "ALH-15AI",
      qty: 1,
      unit_price: 195000,
      amount: 195000,
    }),
    lineRow("ql-2", 2, { line_type: "discount", amount: -38000 }),
  ];

  it("報價單未確認 → 拒絕", async () => {
    documentsSelect(
      docRow({ doc_type: "Q", status: "draft", lines: quoteLines }),
      "Q",
    );
    const res = await convertQuoteToSaleAction("doc-1");
    expect(res.ok).toBe(false);
    expect(recorded.some((r) => r.kind === "insert")).toBe(false);
  });

  it("已確認 → 建立銷貨草稿（source_doc_id / source_line_id、預設倉）", async () => {
    documentsSelect(
      docRow({ id: "q-1", doc_type: "Q", status: "posted", lines: quoteLines }),
      "Q",
    );
    responses["erp_warehouses:select"] = () => ({
      data: { id: "wh-main" },
      error: null,
    });
    responses["mx_customers:select"] = () => ({ data: CUSTOMER, error: null });

    const res = await convertQuoteToSaleAction("q-1");
    expect(res).toEqual({ ok: true, data: { id: "erp_documents-1" } });
    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({
      doc_type: "S",
      status: "draft",
      source_doc_id: "q-1",
      customer_id: "cust-1",
      warehouse_id: "wh-main",
      total_amount: 157000,
    });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines.map((l) => [l.line_type, l.source_line_id, l.amount])).toEqual(
      [
        ["item", "ql-1", 195000],
        ["discount", null, -38000],
      ],
    );
  });
});

describe("銷退單", () => {
  const saleLines = [
    lineRow("sl-1", 1, {
      item_id: "item-tok",
      description: "TOK-0360-S",
      qty: 5,
      unit_price: 4000,
      amount: 20000,
    }),
  ];

  it("createSalesReturnAction：帶入可退數量（扣除已過帳銷退）", async () => {
    documentsSelect(docRow({ id: "s-1", lines: saleLines }), "S");
    responses["erp_document_lines:select"] = () => ({
      data: [{ qty: 2, source_line_id: "sl-1", document_id: "sr-old" }],
      error: null,
    });
    responses["mx_customers:select"] = () => ({ data: CUSTOMER, error: null });

    const res = await createSalesReturnAction("s-1");
    expect(res.ok).toBe(true);
    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({
      doc_type: "SR",
      source_doc_id: "s-1",
      warehouse_id: "wh-main",
    });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines.map((l) => [l.source_line_id, l.qty])).toEqual([["sl-1", 3]]);
  });

  it("createSalesReturnAction：已全部退貨 → 錯誤", async () => {
    documentsSelect(docRow({ id: "s-1", lines: saleLines }), "S");
    responses["erp_document_lines:select"] = () => ({
      data: [{ qty: 5, source_line_id: "sl-1", document_id: "sr-old" }],
      error: null,
    });
    const res = await createSalesReturnAction("s-1");
    expect(res).toEqual({
      ok: false,
      error: "此銷貨單已無可退貨的品項數量。",
    });
  });

  it("saveSalesDraftAction：退貨數量超過可退 → 錯誤，不寫入", async () => {
    documentsSelect(docRow({ id: "s-1", lines: saleLines }), "SR");
    responses["erp_document_lines:select"] = () => ({
      data: [{ qty: 4, source_line_id: "sl-1", document_id: "sr-old" }],
      error: null,
    });
    const res = await saveSalesDraftAction({
      ...newDraftDocument("SR", "2026-09-20"),
      id: "sr-1",
      customer_id: "cust-1",
      source_doc_id: "s-1",
      lines: [
        newDraftLine("item", {
          item_id: "item-tok",
          qty: 2,
          source_line_id: "sl-1",
        }),
      ],
    });
    expect(res).toEqual({
      ok: false,
      error: "第 1 行退貨數量 2 超過可退數量 1（原銷貨 5、已退 4）。",
    });
    expect(recorded.some((r) => r.kind !== "select")).toBe(false);
  });

  it("saveSalesDraftAction：無來源銷貨單 → 錯誤", async () => {
    const res = await saveSalesDraftAction({
      ...newDraftDocument("SR", "2026-09-20"),
      customer_id: "cust-1",
    });
    expect(res.ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
});
