import { beforeEach, describe, expect, it, vi } from "vitest";

// 調撥單 T / 盤點調整單 A server actions（mock supabase）：
//   1. 無 erp 授權 → 拒絕，不碰 DB / RPC、不 revalidate；
//   2. 盤點調整原因必填、機號數量規則 → 在呼叫 RPC 前擋下；
//   3. 通過驗證才呼叫 erp_post_document，錯誤訊息（insufficient_stock）轉給使用者。

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

const revalidatePath = vi.fn();

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import {
  deleteAdjustmentDraftAction,
  postAdjustmentAction,
  saveAdjustmentAction,
  voidAdjustmentAction,
} from "@/app/admin/(protected)/erp/adjustments/actions";
import {
  postTransferAction,
  saveTransferAction,
  voidTransferAction,
} from "@/app/admin/(protected)/erp/transfers/actions";
import { newDraftDocument, newDraftLine } from "@/lib/erp/draft";
import type { DraftDocument } from "@/lib/erp/types";

beforeEach(() => {
  recorded = [];
  responses = {};
  rpcCalls = [];
  rpcResponse = { data: null, error: null };
  moduleGranted = true;
  revalidatePath.mockClear();
});

const ITEMS = [
  { id: "m", code: "ALH-15AI", track_serial: true, track_stock: true },
  { id: "p", code: "P-OIL", track_serial: false, track_stock: true },
];

function adjustmentDraft(patch: Partial<DraftDocument> = {}): DraftDocument {
  return {
    ...newDraftDocument("A", "2026-09-15"),
    warehouse_id: "wh-main",
    lines: [
      newDraftLine("item", {
        item_id: "m",
        description: "盤點多出",
        qty: 1,
        serial_nos: ["SN-NEW"],
        serial_ids: ["stale"],
      }),
      newDraftLine("item", { item_id: "p", description: "破損", qty: -2 }),
    ],
    ...patch,
  };
}

/** getDocumentWithLines 讀到的單據（raw：lines[].serials 為 {serial} 包裝）。 */
function mockDoc(doc: {
  doc_type: "T" | "A";
  status?: string;
  warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  lines: {
    line_no: number;
    item_id: string | null;
    description?: string | null;
    qty: number;
    serial_nos?: string[] | null;
    serial_ids?: string[];
    line_type?: string;
  }[];
}) {
  responses["erp_documents:select"] = () => ({
    data: {
      id: "doc-1",
      doc_type: doc.doc_type,
      status: doc.status ?? "draft",
      warehouse_id:
        doc.warehouse_id === undefined ? "wh-main" : doc.warehouse_id,
      to_warehouse_id:
        doc.to_warehouse_id === undefined ? null : doc.to_warehouse_id,
      lines: doc.lines.map((l) => ({
        id: `line-${l.line_no}`,
        line_no: l.line_no,
        line_type: l.line_type ?? "item",
        item_id: l.item_id,
        description: l.description ?? null,
        qty: l.qty,
        serial_nos: l.serial_nos ?? null,
        serials: (l.serial_ids ?? []).map((id) => ({
          serial: { id, serial_no: id.toUpperCase(), status: "in_stock" },
        })),
      })),
    },
    error: null,
  });
  responses["erp_items:select"] = () => ({ data: ITEMS, error: null });
}

describe("未授權 → 一律拒絕，不碰 DB / RPC", () => {
  it.each([
    ["saveAdjustmentAction", () => saveAdjustmentAction(adjustmentDraft())],
    ["postAdjustmentAction", () => postAdjustmentAction("doc-1")],
    ["voidAdjustmentAction", () => voidAdjustmentAction("doc-1", "打錯")],
    ["deleteAdjustmentDraftAction", () => deleteAdjustmentDraftAction("doc-1")],
    [
      "saveTransferAction",
      () =>
        saveTransferAction({
          ...newDraftDocument("T", "2026-09-15"),
          warehouse_id: "a",
          to_warehouse_id: "b",
        }),
    ],
    ["postTransferAction", () => postTransferAction("doc-1")],
    ["voidTransferAction", () => voidTransferAction("doc-1", "打錯")],
  ])("%s", async (_, call) => {
    moduleGranted = false;
    expect(await call()).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(recorded).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveAdjustmentAction", () => {
  it("品項行未填調整原因 → 驗證錯誤，不寫 DB", async () => {
    const draft = adjustmentDraft();
    draft.lines[1] = { ...draft.lines[1], description: " " };
    expect(await saveAdjustmentAction(draft)).toEqual({
      ok: false,
      error: "第 2 行需填寫調整原因。",
    });
    expect(recorded).toHaveLength(0);
  });

  it("成功：表頭固定免稅 TWD、無客戶廠商；盤盈行清掉殘留的既有機號", async () => {
    const res = await saveAdjustmentAction(
      adjustmentDraft({ customer_id: "hacker", tax_type: "excluded" }),
    );
    expect(res).toEqual({ ok: true, data: { id: "erp_documents-1" } });

    const header = recorded.find(
      (r) => r.table === "erp_documents" && r.kind === "insert",
    )!.payload as Record<string, unknown>;
    expect(header).toMatchObject({
      doc_type: "A",
      status: "draft",
      customer_id: null,
      vendor_id: null,
      to_warehouse_id: null,
      warehouse_id: "wh-main",
      tax_type: "exempt",
      total_amount: 0,
    });
    const lines = recorded.find(
      (r) => r.table === "erp_document_lines" && r.kind === "insert",
    )!.payload as Record<string, unknown>[];
    expect(lines.map((l) => [l.qty, l.description, l.serial_nos])).toEqual([
      [1, "盤點多出", ["SN-NEW"]],
      [-2, "破損", null],
    ]);
    expect(recorded.some((r) => r.table === "erp_document_line_serials")).toBe(
      false,
    );
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/erp/adjustments",
      "layout",
    );
  });

  it("以盤點調整 action 更新調撥單 → 拒絕，不更新", async () => {
    responses["erp_documents:select"] = () => ({
      data: { id: "doc-1", doc_type: "T" },
      error: null,
    });
    const res = await saveAdjustmentAction(adjustmentDraft({ id: "doc-1" }));
    expect(res).toEqual({ ok: false, error: "此單據不是盤點調整單。" });
    expect(recorded.some((r) => r.kind === "update")).toBe(false);
  });
});

describe("postAdjustmentAction — 呼叫 RPC 前驗證", () => {
  it("明細缺調整原因 → 不呼叫 RPC", async () => {
    mockDoc({
      doc_type: "A",
      lines: [{ line_no: 1, item_id: "p", description: "", qty: -1 }],
    });
    expect(await postAdjustmentAction("doc-1")).toEqual({
      ok: false,
      error: "第 1 行需填寫調整原因。",
    });
    expect(rpcCalls).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("盤盈新機號數 ≠ 數量 → 不呼叫 RPC", async () => {
    mockDoc({
      doc_type: "A",
      lines: [
        {
          line_no: 1,
          item_id: "m",
          description: "多出",
          qty: 2,
          serial_nos: ["SN1"],
        },
      ],
    });
    const res = await postAdjustmentAction("doc-1");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("盤盈需輸入 2 個新機號");
    expect(rpcCalls).toHaveLength(0);
  });

  it("盤虧選取機號數 ≠ |數量| → 不呼叫 RPC", async () => {
    mockDoc({
      doc_type: "A",
      lines: [
        {
          line_no: 1,
          item_id: "m",
          description: "遺失",
          qty: -2,
          serial_ids: ["s1"],
        },
      ],
    });
    const res = await postAdjustmentAction("doc-1");
    expect(res.ok === false && res.error).toContain("盤虧需選取 2 台機號");
    expect(rpcCalls).toHaveLength(0);
  });

  it("通過驗證 → erp_post_document，並 revalidate 庫存頁", async () => {
    mockDoc({
      doc_type: "A",
      lines: [
        {
          line_no: 1,
          item_id: "m",
          description: "多出",
          qty: 1,
          serial_nos: ["SN1"],
        },
        {
          line_no: 2,
          item_id: "m",
          description: "遺失",
          qty: -1,
          serial_ids: ["s1"],
        },
        {
          line_no: 3,
          item_id: null,
          line_type: "note",
          description: "年中盤點",
          qty: 0,
        },
      ],
    });
    rpcResponse = { data: { doc_no: "A11509001" }, error: null };
    const res = await postAdjustmentAction("doc-1");
    expect(res).toEqual({
      ok: true,
      data: { doc_no: "A11509001", warnings: [], mx_machine_ids: [] },
    });
    expect(rpcCalls).toEqual([
      { fn: "erp_post_document", args: { p_doc_id: "doc-1" } },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(
      "/admin/erp/inventory",
      "layout",
    );
  });

  it("盤虧超過存量：RPC insufficient_stock 的訊息回傳給使用者", async () => {
    mockDoc({
      doc_type: "A",
      lines: [{ line_no: 1, item_id: "p", description: "破損", qty: -99 }],
    });
    rpcResponse = {
      data: null,
      error: {
        message: "insufficient_stock",
        details: "品項 P-OIL 於倉庫 MAIN 庫存不足（異動後數量 -95）",
      },
    };
    expect(await postAdjustmentAction("doc-1")).toEqual({
      ok: false,
      error: "品項 P-OIL 於倉庫 MAIN 庫存不足（異動後數量 -95）",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("postTransferAction", () => {
  it("單別不符（盤點調整單）→ 不呼叫 RPC", async () => {
    mockDoc({
      doc_type: "A",
      lines: [{ line_no: 1, item_id: "p", description: "x", qty: 1 }],
    });
    expect(await postTransferAction("doc-1")).toEqual({
      ok: false,
      error: "單別不正確。",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("序號品項機號數 = 數量 → 過帳", async () => {
    mockDoc({
      doc_type: "T",
      to_warehouse_id: "wh-van",
      lines: [
        { line_no: 1, item_id: "m", qty: 2, serial_ids: ["s1", "s2"] },
        { line_no: 2, item_id: "p", qty: 3 },
      ],
    });
    rpcResponse = { data: { doc_no: "T11509001" }, error: null };
    const res = await postTransferAction("doc-1");
    expect(res.ok).toBe(true);
    expect(rpcCalls).toHaveLength(1);
  });
});

describe("void", () => {
  it("作廢原因必填 → 不呼叫 RPC", async () => {
    expect(await voidAdjustmentAction("doc-1", "  ")).toEqual({
      ok: false,
      error: "請填寫作廢原因。",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("單別相符 → erp_void_document", async () => {
    responses["erp_documents:select"] = () => ({
      data: { id: "doc-1", doc_type: "T" },
      error: null,
    });
    rpcResponse = { data: { warnings: [] }, error: null };
    expect(await voidTransferAction("doc-1", "調錯倉")).toEqual({
      ok: true,
      data: { warnings: [] },
    });
    expect(rpcCalls[0]).toEqual({
      fn: "erp_void_document",
      args: { p_doc_id: "doc-1", p_reason: "調錯倉" },
    });
  });
});
