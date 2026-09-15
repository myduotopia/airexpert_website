import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/erp/documents.ts（草稿存取）與 lib/erp/rpc.ts（過帳 / 作廢 RPC 包裝）測試。
// 以假的 supabase query builder 捕捉送進 DB 的操作（同 maintenance-add-record 模式）：
//   1. 無 erp 授權 → 回 { ok:false, error:'沒有 ERP 權限' }，不碰 DB；
//   2. 驗證錯誤 → 回 { ok:false }，不碰 DB；
//   3. 非草稿 → not_draft 訊息；
//   4. 成功路徑：表頭合計由 calc.ts 重算、快照客戶資料、明細 line_no / amount、機號關聯。

type Kind = "select" | "insert" | "update" | "delete";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = {
  data: unknown;
  error: { message: string; details?: string } | null;
  count?: number | null;
};

let recorded: Recorded[] = [];
/** `${table}:${kind}` → 回應（未設定：insert 回 id、其餘回 null）。 */
let responses: Record<string, (q: Query) => Res> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: Res = { data: null, error: null };
let moduleGranted = true;

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  wantOne = false;

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
  in(...args: unknown[]): this {
    return this.filter("in", args);
  }
  gte(...args: unknown[]): this {
    return this.filter("gte", args);
  }
  lte(...args: unknown[]): this {
    return this.filter("lte", args);
  }
  or(...args: unknown[]): this {
    return this.filter("or", args);
  }
  order(): this {
    return this;
  }
  range(...args: unknown[]): this {
    return this.filter("range", args);
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

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  deleteDraftDocument,
  listDocuments,
  saveDraftDocument,
} from "@/lib/erp/documents";
import {
  allocatePayment,
  postDocument,
  postPayment,
  voidDocument,
} from "@/lib/erp/rpc";
import { newDraftDocument, newDraftLine } from "@/lib/erp/draft";
import { ERP_ERROR_MESSAGES } from "@/lib/erp/errors";
import type { DraftDocument } from "@/lib/erp/types";

beforeEach(() => {
  recorded = [];
  responses = {};
  rpcCalls = [];
  rpcResponse = { data: null, error: null };
  moduleGranted = true;
});

function salesDraft(patch: Partial<DraftDocument> = {}): DraftDocument {
  return {
    ...newDraftDocument("S", "2026-09-15"),
    customer_id: "cust-1",
    lines: [
      newDraftLine("item", {
        item_id: "item-1",
        description: "ALH-15AI 空壓機",
        qty: 1,
        unit_price: 200000,
        serial_ids: ["ser-1"],
      }),
      newDraftLine("item", { item_id: "item-2", qty: 2, unit_price: 6700 }),
      newDraftLine("note", { description: "預轉華淨科技", qty: 5 }),
    ],
    ...patch,
  };
}

describe("saveDraftDocument — 拒絕路徑（不碰 DB）", () => {
  it("無 erp 授權 → 沒有 ERP 權限", async () => {
    moduleGranted = false;
    const res = await saveDraftDocument(salesDraft());
    expect(res).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(recorded).toHaveLength(0);
  });

  it("銷貨單未選客戶 → 驗證錯誤", async () => {
    const res = await saveDraftDocument(salesDraft({ customer_id: null }));
    expect(res).toEqual({ ok: false, error: "請選擇客戶。" });
    expect(recorded).toHaveLength(0);
  });

  it("item 行未選品項 → 驗證錯誤", async () => {
    const res = await saveDraftDocument(
      salesDraft({ lines: [newDraftLine("item")] }),
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("請選擇品項");
    expect(recorded).toHaveLength(0);
  });
});

describe("saveDraftDocument — 新增草稿", () => {
  beforeEach(() => {
    responses["mx_customers:select"] = () => ({
      data: {
        name: "兆利科技",
        invoice_title: "兆利科技股份有限公司",
        tax_id: "12345678",
        contact_person: "王先生",
        phone: "02-1234",
        address: "聯絡地址",
        delivery_address: "送貨地址",
        sales_rep: "阿宏",
      },
      error: null,
    });
  });

  it("表頭合計以 calc.ts 重算、快照客戶、明細與機號關聯", async () => {
    const res = await saveDraftDocument(salesDraft());
    expect(res).toEqual({ ok: true, data: { id: "erp_documents-1" } });

    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({
      doc_type: "S",
      status: "draft",
      customer_id: "cust-1",
      vendor_id: null,
      party_name: "兆利科技股份有限公司",
      party_tax_id: "12345678",
      party_address: "送貨地址",
      sales_rep: "阿宏",
      amount_untaxed: 213400,
      tax_amount: 10670,
      total_amount: 224070,
      total_twd: 224070,
    });
    expect(header).not.toHaveProperty("doc_no");

    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines.map((l) => [l.line_no, l.line_type, l.amount])).toEqual([
      [1, "item", 200000],
      [2, "item", 13400],
      [3, "note", 0],
    ]);
    expect(lines[2]).toMatchObject({ item_id: null, qty: 0 });

    const serials = recorded.find(
      (r) => r.table === "erp_document_line_serials",
    )!.payload;
    expect(serials).toEqual([
      { line_id: "erp_document_lines-1", serial_id: "ser-1" },
    ]);
  });

  it("找不到客戶 → 回錯誤，不寫單據", async () => {
    responses["mx_customers:select"] = () => ({ data: null, error: null });
    const res = await saveDraftDocument(salesDraft());
    expect(res).toEqual({ ok: false, error: "找不到所選客戶。" });
    expect(recorded.some((r) => r.table === "erp_documents")).toBe(false);
  });
});

describe("saveDraftDocument — 更新既有草稿", () => {
  beforeEach(() => {
    responses["mx_customers:select"] = () => ({
      data: { name: "兆利科技" },
      error: null,
    });
  });

  it("單據已非草稿 → not_draft，不刪明細", async () => {
    responses["erp_documents:update"] = () => ({ data: [], error: null });
    const res = await saveDraftDocument(salesDraft({ id: "doc-9" }));
    expect(res).toEqual({ ok: false, error: ERP_ERROR_MESSAGES.not_draft });
    const update = recorded.find((r) => r.kind === "update")!;
    expect(update.filters).toContainEqual({
      fn: "eq",
      args: ["status", "draft"],
    });
    expect(recorded.some((r) => r.kind === "delete")).toBe(false);
  });

  it("草稿 → 更新表頭並整批重建明細", async () => {
    responses["erp_documents:update"] = () => ({
      data: [{ id: "doc-9" }],
      error: null,
    });
    const res = await saveDraftDocument(salesDraft({ id: "doc-9" }));
    expect(res).toEqual({ ok: true, data: { id: "doc-9" } });
    const del = recorded.find((r) => r.kind === "delete")!;
    expect(del.table).toBe("erp_document_lines");
    expect(del.filters).toContainEqual({
      fn: "eq",
      args: ["document_id", "doc-9"],
    });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines.every((l) => l.document_id === "doc-9")).toBe(true);
  });
});

describe("deleteDraftDocument", () => {
  it("無授權 → 拒絕", async () => {
    moduleGranted = false;
    expect((await deleteDraftDocument("doc-1")).ok).toBe(false);
    expect(recorded).toHaveLength(0);
  });
  it("已過帳（刪不到草稿）→ not_draft", async () => {
    responses["erp_documents:delete"] = () => ({ data: [], error: null });
    expect(await deleteDraftDocument("doc-1")).toEqual({
      ok: false,
      error: ERP_ERROR_MESSAGES.not_draft,
    });
  });
  it("草稿 → 刪除成功", async () => {
    responses["erp_documents:delete"] = () => ({
      data: [{ id: "doc-1" }],
      error: null,
    });
    expect(await deleteDraftDocument("doc-1")).toEqual({
      ok: true,
      data: null,
    });
  });
});

describe("listDocuments", () => {
  it("搜尋字串移除 or-filter 結構字元、分頁 50 筆", async () => {
    responses["erp_documents:select"] = () => ({
      data: [],
      error: null,
      count: 0,
    });
    const res = await listDocuments({
      docType: "S",
      status: "posted",
      q: "兆利(股),",
      page: 2,
    });
    expect(res).toEqual({
      ok: true,
      data: { rows: [], total: 0, page: 2, pageSize: 50 },
    });
    const q = recorded[0];
    expect(q.filters).toContainEqual({ fn: "eq", args: ["doc_type", "S"] });
    expect(q.filters).toContainEqual({ fn: "eq", args: ["status", "posted"] });
    expect(q.filters).toContainEqual({
      fn: "or",
      args: ["doc_no.ilike.%兆利 股%,party_name.ilike.%兆利 股%"],
    });
    expect(q.filters).toContainEqual({ fn: "range", args: [50, 99] });
  });
});

describe("rpc wrappers", () => {
  it("postDocument：以 p_doc_id 呼叫 erp_post_document 並補齊回傳欄位", async () => {
    rpcResponse = { data: { doc_no: "S11509047" }, error: null };
    const res = await postDocument("doc-1");
    expect(rpcCalls).toEqual([
      { fn: "erp_post_document", args: { p_doc_id: "doc-1" } },
    ]);
    expect(res).toEqual({
      ok: true,
      data: { doc_no: "S11509047", warnings: [], mx_machine_ids: [] },
    });
  });

  it("RPC 錯誤優先顯示 details", async () => {
    rpcResponse = {
      data: null,
      error: {
        message: "insufficient_stock",
        details: "ALH-15AI 總倉庫存不足",
      },
    };
    expect(await postDocument("doc-1")).toEqual({
      ok: false,
      error: "ALH-15AI 總倉庫存不足",
    });
  });

  it("無授權 → 不呼叫 RPC", async () => {
    moduleGranted = false;
    expect(await postDocument("doc-1")).toEqual({
      ok: false,
      error: "沒有 ERP 權限",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("voidDocument：原因必填", async () => {
    expect((await voidDocument("doc-1", "  ")).ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
    await voidDocument("doc-1", " 客戶取消 ");
    expect(rpcCalls[0]).toEqual({
      fn: "erp_void_document",
      args: { p_doc_id: "doc-1", p_reason: "客戶取消" },
    });
  });

  it("postPayment：支票需票號票期；payload 以 p_payment 傳入", async () => {
    const bad = await postPayment({
      direction: "in",
      pay_date: "2026-09-02",
      customer_id: "c1",
      method: "check",
      amount: 70000,
      allocations: [],
    });
    expect(bad.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);

    rpcResponse = { data: { id: "pay-1", doc_no: "RC11509001" }, error: null };
    const good = await postPayment({
      direction: "in",
      pay_date: "2026-09-02",
      customer_id: "c1",
      method: "transfer",
      amount: 70000,
      allocations: [],
    });
    expect(good).toEqual({
      ok: true,
      data: { id: "pay-1", doc_no: "RC11509001" },
    });
    expect(rpcCalls[0].fn).toBe("erp_post_payment");
    expect(rpcCalls[0].args).toMatchObject({
      p_payment: { method: "transfer", amount: 70000 },
    });
  });

  it("allocatePayment：錯誤碼轉中文", async () => {
    rpcResponse = { data: null, error: { message: "over_allocation" } };
    expect(
      await allocatePayment("pay-1", [{ document_id: "d1", amount: 1 }]),
    ).toEqual({ ok: false, error: ERP_ERROR_MESSAGES.over_allocation });
  });
});
