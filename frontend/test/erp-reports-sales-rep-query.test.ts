import { describe, it, expect, vi, beforeEach } from "vitest";

// getSalesMarginReport（依業務，#223）：讀員工主檔對照，顯示員工姓名／代號；
// 只有文字的舊單據以姓名對回員工；對不到的標「未建檔」。以假的 supabase 回應各表。

const WANG = "11111111-1111-4111-8111-111111111111";

let tables: Record<string, unknown[]> = {};
const queried: string[] = [];

class Query implements PromiseLike<{ data: unknown; error: null }> {
  constructor(public table: string) {}
  select(): this {
    return this;
  }
  eq(): this {
    return this;
  }
  in(): this {
    return this;
  }
  gte(): this {
    return this;
  }
  lte(): this {
    return this;
  }
  order(): this {
    return this;
  }
  range(): this {
    return this;
  }
  then<A, B = never>(
    onfulfilled?:
      | ((v: { data: unknown; error: null }) => A | PromiseLike<A>)
      | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    queried.push(this.table);
    return Promise.resolve({
      data: tables[this.table] ?? [],
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

vi.mock("@/lib/admin/auth", () => ({ hasModule: vi.fn(async () => true) }));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (t: string) => new Query(t),
  })),
}));

import { getSalesMarginReport } from "@/lib/erp/queries/reports";

const doc = (
  id: string,
  sales_rep: string | null,
  sales_rep_id: string | null,
) => ({
  id,
  doc_type: "S",
  status: "posted",
  doc_date: "2026-10-01",
  customer_id: "c1",
  sales_rep,
  sales_rep_id,
  tax_type: "excluded",
  tax_rate: 0.05,
  currency: "TWD",
  exchange_rate: 1,
});
const line = (document_id: string, amount: number) => ({
  id: `l-${document_id}`,
  document_id,
  line_type: "item",
  item_id: "a",
  qty: 1,
  amount,
  unit_cost: 0,
});

beforeEach(() => {
  queried.length = 0;
  tables = {
    erp_documents: [
      doc("s1", "王小明", WANG),
      doc("s2", " 王小明", null), // 舊單據只有文字 → 對回員工
      doc("s3", "謝億興", null), // 主檔沒有 → 未建檔
      doc("s4", null, null),
    ],
    erp_document_lines: [
      line("s1", 1000),
      line("s2", 2000),
      line("s3", 500),
      line("s4", 100),
    ],
    employees: [{ id: WANG, code: "S01", name: "王小明" }],
  };
});

describe("getSalesMarginReport — 依業務", () => {
  it("依員工彙總並顯示員工姓名與代號；未建檔與未指定分列", async () => {
    const res = await getSalesMarginReport({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "sales_rep",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rows.map((r) => [r.label, r.code, r.revenue])).toEqual([
      ["王小明", "S01", 3000],
      ["謝億興（未建檔）", null, 500],
      ["（未指定業務）", null, 100],
    ]);
    expect(queried).toContain("employees");
  });

  it("依客戶彙總時不讀員工主檔", async () => {
    tables.mx_customers = [{ id: "c1", code: "KC1", name: "甲" }];
    const res = await getSalesMarginReport({
      from: "2026-10-01",
      to: "2026-10-31",
      groupBy: "customer",
    });
    expect(res.ok).toBe(true);
    expect(queried).not.toContain("employees");
  });
});
