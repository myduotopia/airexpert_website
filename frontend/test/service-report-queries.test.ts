import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/service-report/queries.ts listReports：頁碼超出最後一頁（PostgREST 416 / PGRST103）
// 時改回最後一頁，而非回錯誤。以假的 query builder 模擬 range 行為。

type Res = {
  data: unknown;
  error: { code?: string; status?: number; message: string } | null;
  count: number | null;
};

let totalRows = 0;
/** true → 只帶 HTTP 狀態 416、不帶 PGRST103 code。 */
let statusOnly = false;
let calls: { head: boolean; range: [number, number] | null }[] = [];

class Query implements PromiseLike<Res> {
  head = false;
  rangeArgs: [number, number] | null = null;
  select(_cols: string, opts?: { head?: boolean }): this {
    this.head = Boolean(opts?.head);
    return this;
  }
  eq(): this {
    return this;
  }
  gte(): this {
    return this;
  }
  lte(): this {
    return this;
  }
  or(): this {
    return this;
  }
  order(): this {
    return this;
  }
  range(from: number, to: number): this {
    this.rangeArgs = [from, to];
    return this;
  }
  private run(): Res {
    calls.push({ head: this.head, range: this.rangeArgs });
    if (this.head) return { data: null, error: null, count: totalRows };
    const [from, to] = this.rangeArgs ?? [0, totalRows - 1];
    if (from > 0 && from >= totalRows) {
      return {
        data: null,
        error: statusOnly
          ? { status: 416, message: "Requested range not satisfiable" }
          : { code: "PGRST103", message: "Requested range not satisfiable" },
        count: null,
      };
    }
    const rows = Array.from(
      { length: Math.max(0, Math.min(to, totalRows - 1) - from + 1) },
      (_, i) => ({ id: `r${from + i}` }),
    );
    return { data: rows, error: null, count: totalRows };
  }
  then<A = Res, B = never>(
    onfulfilled?: ((value: Res) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({ from: () => new Query() })),
}));

import { REPORT_PAGE_SIZE, listReports } from "@/lib/service-report/queries";

beforeEach(() => {
  totalRows = 0;
  statusOnly = false;
  calls = [];
});

describe("listReports 分頁", () => {
  it("正常頁碼：回該頁資料與總數", async () => {
    totalRows = 120;
    const r = await listReports({ page: 2 });
    expect(r.ok && r.data.page).toBe(2);
    expect(r.ok && r.data.total).toBe(120);
    expect(r.ok && r.data.rows).toHaveLength(REPORT_PAGE_SIZE);
    expect(calls).toHaveLength(1);
  });

  it("頁碼超出最後一頁（PGRST103）→ 重查筆數並回最後一頁", async () => {
    totalRows = 120;
    const r = await listReports({ page: 9 });
    expect(r).toMatchObject({ ok: true, data: { page: 3, total: 120 } });
    expect(r.ok && r.data.rows).toHaveLength(20);
    expect(calls.map((c) => c.head)).toEqual([false, true, false]);
    expect(calls[2].range).toEqual([100, 149]);
  });

  it("無資料時超頁 → 第 1 頁空列表，不重試", async () => {
    totalRows = 0;
    const r = await listReports({ page: 5 });
    expect(r).toEqual({
      ok: true,
      data: { rows: [], total: 0, page: 1, pageSize: REPORT_PAGE_SIZE },
    });
    expect(calls).toHaveLength(2);
  });

  it("HTTP 416 狀態碼亦視為超頁", async () => {
    totalRows = 10;
    statusOnly = true;
    const r = await listReports({ page: 3 });
    expect(r).toMatchObject({ ok: true, data: { page: 1, total: 10 } });
  });
});
