import { describe, it, expect, vi, beforeEach } from "vitest";

// 採購區 server actions（mock supabase，同 erp-documents.test.ts 模式）：
//   1. 未授權 → 拒絕且不碰 DB / RPC；
//   2. 驗證錯誤（進貨單未選倉庫、未選廠商）；
//   3. RPC 錯誤碼 → 中文（over_receipt / serial_unavailable / has_dependents）；
//   4. 「轉進貨單」以未到貨量建立 I 草稿（source_doc_id / source_line_id）。

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
};

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: Res = { data: null, error: null };
let moduleGranted = true;
const revalidateSpy = vi.fn();

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
  private f(fn: string, args: unknown[]): this {
    this.filters.push({ fn, args });
    return this;
  }
  eq(...a: unknown[]): this {
    return this.f("eq", a);
  }
  in(...a: unknown[]): this {
    return this.f("in", a);
  }
  order(): this {
    return this;
  }
  limit(): this {
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
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
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
  convertPurchaseToReceiptAction,
  deletePurchaseDraftAction,
  postPurchaseAction,
  savePurchaseDraftAction,
  voidPurchaseAction,
} from "@/app/admin/(protected)/erp/purchases/actions";
import {
  convertReceiptToReturnAction,
  postReceiptAction,
  saveReceiptDraftAction,
  voidReceiptAction,
} from "@/app/admin/(protected)/erp/receipts/actions";
import { postPurchaseReturnAction } from "@/app/admin/(protected)/erp/purchase-returns/actions";
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

function receiptDraft(patch = {}) {
  return newDraftDocument("I", "2026-09-15", {
    vendor_id: "vendor-1",
    warehouse_id: "wh-1",
    lines: [
      newDraftLine("item", {
        item_id: "am3",
        qty: 1,
        unit_price: 220000,
        serial_nos: ["26-PM15060010"],
        serial_ids: ["should-be-dropped"],
      }),
    ],
    ...patch,
  });
}

describe("未授權 → 拒絕，不碰 DB / RPC", () => {
  it.each([
    ["savePurchaseDraftAction", () => savePurchaseDraftAction(receiptDraft())],
    ["postPurchaseAction", () => postPurchaseAction("doc-1")],
    ["voidPurchaseAction", () => voidPurchaseAction("doc-1", "取消")],
    ["deletePurchaseDraftAction", () => deletePurchaseDraftAction("doc-1")],
    [
      "convertPurchaseToReceiptAction",
      () => convertPurchaseToReceiptAction("p"),
    ],
    ["convertReceiptToReturnAction", () => convertReceiptToReturnAction("i")],
    ["postPurchaseReturnAction", () => postPurchaseReturnAction("doc-1")],
  ])("%s", async (_name, call) => {
    moduleGranted = false;
    expect(await call()).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(recorded).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("存草稿驗證", () => {
  it("進貨單未選入庫倉 → 錯誤", async () => {
    const res = await saveReceiptDraftAction(
      receiptDraft({ warehouse_id: null }),
    );
    expect(res).toEqual({ ok: false, error: "請選擇入庫倉。" });
    expect(recorded).toHaveLength(0);
  });

  it("採購單未選廠商 → 錯誤", async () => {
    const res = await savePurchaseDraftAction(
      newDraftDocument("P", "2026-09-15"),
    );
    expect(res).toEqual({ ok: false, error: "請選擇廠商。" });
  });

  it("進貨單：強制單別 I，新機號寫入 serial_nos、不寫既有機號", async () => {
    responses["erp_vendors:select"] = () => ({
      data: { name: "漢鐘" },
      error: null,
    });
    const res = await saveReceiptDraftAction({
      ...receiptDraft(),
      doc_type: "S",
    });
    expect(res).toEqual({ ok: true, id: "erp_documents-1" });
    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({ doc_type: "I", warehouse_id: "wh-1" });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines[0].serial_nos).toEqual(["26-PM15060010"]);
    expect(recorded.some((r) => r.table === "erp_document_line_serials")).toBe(
      false,
    );
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/erp/receipts");
  });
});

describe("RPC 錯誤碼 → 中文", () => {
  it.each([
    ["over_receipt", ERP_ERROR_MESSAGES.over_receipt],
    ["serial_unavailable", ERP_ERROR_MESSAGES.serial_unavailable],
    ["has_dependents", ERP_ERROR_MESSAGES.has_dependents],
  ])("%s（無 details）→ 對應中文", async (code, msg) => {
    rpcResponse = { data: null, error: { message: code } };
    expect(await postReceiptAction("doc-1")).toEqual({
      ok: false,
      error: msg,
    });
  });

  it("有 details → 顯示 RPC 帶的中文訊息", async () => {
    rpcResponse = {
      data: null,
      error: {
        message: "over_receipt",
        details: "品項 AM3-22A-E30 累計進貨 2 超過採購數量 1",
      },
    };
    expect(await postReceiptAction("doc-1")).toEqual({
      ok: false,
      error: "品項 AM3-22A-E30 累計進貨 2 超過採購數量 1",
    });
    expect(revalidateSpy).not.toHaveBeenCalled();
  });

  it("作廢 has_dependents → 中文；原因必填不呼叫 RPC", async () => {
    expect((await voidPurchaseAction("doc-1", " ")).ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
    rpcResponse = {
      data: null,
      error: {
        message: "has_dependents",
        details: "已有進貨單引用此採購單，請先作廢進貨單",
      },
    };
    expect(await voidReceiptAction("doc-1", "錯單")).toEqual({
      ok: false,
      error: "已有進貨單引用此採購單，請先作廢進貨單",
    });
  });

  it("過帳成功 → 回傳單號訊息並 revalidate", async () => {
    rpcResponse = { data: { doc_no: "P11509008", warnings: [] }, error: null };
    expect(await postPurchaseAction("doc-1")).toEqual({
      ok: true,
      message: "已過帳，單號 P11509008",
    });
    expect(rpcCalls[0]).toEqual({
      fn: "erp_post_document",
      args: { p_doc_id: "doc-1" },
    });
    expect(revalidateSpy).toHaveBeenCalledWith("/admin/erp/purchases/doc-1");
  });
});

describe("轉進貨單", () => {
  const purchase = {
    id: "p-1",
    doc_type: "P",
    status: "posted",
    doc_no: "P11509008",
    vendor_id: "vendor-1",
    tax_type: "excluded",
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    note: "備庫",
    source_doc_id: null,
    lines: [
      {
        id: "pl-1",
        line_no: 1,
        line_type: "item",
        item_id: "am3",
        description: "AM3-22A-E30",
        qty: 2,
        unit_price: 220000,
        amount: 440000,
        serial_nos: null,
        serials: [],
      },
      {
        id: "pl-2",
        line_no: 2,
        line_type: "discount",
        item_id: null,
        description: "折扣",
        qty: 0,
        unit_price: 0,
        amount: -6600,
        serial_nos: null,
        serials: [],
      },
    ],
  };

  beforeEach(() => {
    responses["erp_documents:select"] = () => ({ data: purchase, error: null });
    responses["erp_purchase_line_progress:select"] = () => ({
      data: [
        {
          line_id: "pl-1",
          document_id: "p-1",
          item_id: "am3",
          qty: 2,
          received_qty: 1,
          remaining_qty: 1,
        },
      ],
      error: null,
    });
    responses["erp_warehouses:select"] = () => ({
      data: [{ id: "wh-main" }],
      error: null,
    });
    responses["erp_vendors:select"] = () => ({
      data: { name: "漢鐘" },
      error: null,
    });
  });

  it("以未到貨量建立進貨單草稿並回傳 id", async () => {
    const res = await convertPurchaseToReceiptAction("p-1");
    expect(res).toEqual({ ok: true, id: "erp_documents-1" });
    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({
      doc_type: "I",
      vendor_id: "vendor-1",
      warehouse_id: "wh-main",
      source_doc_id: "p-1",
      status: "draft",
      amount_untaxed: 216700,
    });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines).toEqual([
      expect.objectContaining({
        line_type: "item",
        item_id: "am3",
        qty: 1,
        unit_price: 220000,
        source_line_id: "pl-1",
      }),
      expect.objectContaining({ line_type: "discount", amount: -3300 }),
    ]);
  });

  it("已全數到貨 → 錯誤，不建單", async () => {
    responses["erp_purchase_line_progress:select"] = () => ({
      data: [
        {
          line_id: "pl-1",
          document_id: "p-1",
          item_id: "am3",
          qty: 2,
          received_qty: 2,
          remaining_qty: 0,
        },
      ],
      error: null,
    });
    const res = await convertPurchaseToReceiptAction("p-1");
    expect(res.ok).toBe(false);
    expect(recorded.some((r) => r.kind === "insert")).toBe(false);
  });

  it("草稿採購單 → 不可轉單", async () => {
    responses["erp_documents:select"] = () => ({
      data: { ...purchase, status: "draft" },
      error: null,
    });
    expect(await convertPurchaseToReceiptAction("p-1")).toEqual({
      ok: false,
      error: "只能由已過帳的單據轉單。",
    });
  });
});
