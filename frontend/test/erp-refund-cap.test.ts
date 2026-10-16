import { describe, it, expect, vi, beforeEach } from "vitest";

// #253：退款上限 = max(0, 預收 − 未結應收淨額)；未結應收淨額 ≤ 0 時上限即預收（R5）。
//   * refundCap、summarizeRefundContext：上限計算（SR／PR 負數降低未結應收）
//   * collectRefundErrors：超過上限列為錯誤（一次給齊）
//   * refundConfirmSummary：確認框顯示預收、未結應收、最多可退
//   * loadPrepaidAction：一併讀出未結單據
// supabase / next/cache 以假物件替代。

let moduleGranted = true;
let selectCalls: {
  table: string;
  columns: string;
  filters: unknown[][];
}[] = [];
let rowsByTable: Record<string, unknown[]> = {};
let errorByTable: Record<string, { message: string; details?: string }> = {};

function selectBuilder(table: string, columns: string) {
  const rec = { table, columns, filters: [] as unknown[][] };
  selectCalls.push(rec);
  const b = {
    eq: (...args: unknown[]) => {
      rec.filters.push(["eq", ...args]);
      return b;
    },
    in: (...args: unknown[]) => {
      rec.filters.push(["in", ...args]);
      return b;
    },
    neq: (...args: unknown[]) => {
      rec.filters.push(["neq", ...args]);
      return b;
    },
    order: () => b,
    range: (from: number, to: number) =>
      Promise.resolve(
        errorByTable[table]
          ? { data: null, error: errorByTable[table] }
          : {
              data: (rowsByTable[table] ?? []).slice(from, to + 1),
              error: null,
            },
      ),
  };
  return b;
}

const fakeSupabase = {
  from: (table: string) => ({
    select: (columns: string) => selectBuilder(table, columns),
  }),
  rpc: async () => ({ data: null, error: null }),
};

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(async () => moduleGranted),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { loadPrepaidAction } from "@/app/admin/(protected)/erp/collections/_components/actions";
import {
  collectRefundErrors,
  refundCap,
  refundConfirmSummary,
  summarizeRefundContext,
  type RefundFormInput,
} from "@/app/admin/(protected)/erp/collections/_components/refund";
import type { ErpDocumentBalance } from "@/lib/erp/types";

beforeEach(() => {
  moduleGranted = true;
  selectCalls = [];
  rowsByTable = {};
  errorByTable = {};
});

const bal = (
  document_id: string,
  doc_type: ErpDocumentBalance["doc_type"],
  doc_no: string,
  doc_date: string,
  outstanding: number,
): ErpDocumentBalance => ({
  document_id,
  doc_type,
  doc_no,
  doc_date,
  customer_id: "c1",
  vendor_id: null,
  total_twd: outstanding,
  allocated: 0,
  outstanding,
});

describe("refundCap：max(0, 預收 − 未結應收淨額)，且不超過預收", () => {
  it("無未結應收 → 全額", () => {
    expect(refundCap(5000, 0)).toBe(5000);
  });
  it("有未結應收 → 預收 − 未結應收", () => {
    expect(refundCap(5000, 3000)).toBe(2000);
    expect(refundCap(11000, 9000)).toBe(2000);
  });
  it("未結應收 ≥ 預收 → 0", () => {
    expect(refundCap(5000, 5000)).toBe(0);
    expect(refundCap(5000, 20000)).toBe(0);
  });
  it("未結應收淨額為負（銷退貸項未轉預收）→ 上限仍為預收", () => {
    expect(refundCap(500, -1000)).toBe(500);
  });
  it("取到分", () => {
    expect(refundCap(0.3, 0.1)).toBe(0.2);
    expect(refundCap(1000.105, 0)).toBe(1000.11);
  });
});

describe("summarizeRefundContext", () => {
  it("SR 負數計入未結應收；只列 outstanding ≠ 0 的單據、保留順序", () => {
    const ctx = summarizeRefundContext(
      {
        total: 11000,
        sources: [
          {
            id: "rc",
            doc_no: "RC1",
            pay_date: "2026-10-01",
            amount: 5000,
            available: 3000,
          },
          {
            id: "rc2",
            doc_no: "RC2",
            pay_date: "2026-10-06",
            amount: 8000,
            available: 8000,
          },
        ],
      },
      [
        bal("s1", "S", "S1", "2026-10-01", 10000),
        bal("s2", "S", "S2", "2026-10-02", 3000),
        bal("zero", "S", "S0", "2026-10-03", 0),
        bal("sr", "SR", "SR1", "2026-10-05", -4000),
      ],
    );
    expect(ctx.total).toBe(11000);
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.openTotal).toBe(9000);
    expect(ctx.refundable).toBe(2000);
    expect(ctx.openDocs).toEqual([
      {
        document_id: "s1",
        doc_type: "S",
        doc_no: "S1",
        doc_date: "2026-10-01",
        outstanding: 10000,
      },
      {
        document_id: "s2",
        doc_type: "S",
        doc_no: "S2",
        doc_date: "2026-10-02",
        outstanding: 3000,
      },
      {
        document_id: "sr",
        doc_type: "SR",
        doc_no: "SR1",
        doc_date: "2026-10-05",
        outstanding: -4000,
      },
    ]);
  });

  it("沒有未結單據 → 可退 = 預收", () => {
    const ctx = summarizeRefundContext({ total: 9500, sources: [] }, []);
    expect(ctx.openTotal).toBe(0);
    expect(ctx.refundable).toBe(9500);
    expect(ctx.openDocs).toEqual([]);
  });
});

describe("退款表單檢核：超過上限", () => {
  const rf = (patch: Partial<RefundFormInput> = {}): RefundFormInput => ({
    direction: "in",
    pay_date: "2026-10-13",
    party_id: "c1",
    method: "transfer",
    amount: 2000,
    ...patch,
  });

  it("等於上限通過", () => {
    expect(collectRefundErrors(rf(), 5000, 3000)).toEqual([]);
  });

  it("超過上限 → 列出預收、未結應收、最多可退，建議補沖銷", () => {
    expect(collectRefundErrors(rf({ amount: 2000.01 }), 5000, 3000)).toEqual([
      "退款金額 2,000.01 超過最多可退 2,000（預收 5,000 − 未結應收 3,000）；請先以「補沖銷」把預收沖到未結單據。",
    ]);
  });

  it("同時超過預收：只給一條上限訊息", () => {
    expect(collectRefundErrors(rf({ amount: 6000 }), 5000, 3000)).toEqual([
      "退款金額 6,000 超過最多可退 2,000（預收 5,000 − 未結應收 3,000）；請先以「補沖銷」把預收沖到未結單據。",
    ]);
  });

  it("未結應收 ≥ 預收 → 目前不可退款", () => {
    expect(collectRefundErrors(rf({ amount: 1 }), 5000, 20000)).toEqual([
      "此客戶尚有未結應收 20,000，不少於預收 5,000，目前不可退款；請先以「補沖銷」把預收沖到未結單據。",
    ]);
  });

  it("未結應收淨額為負 → 上限即預收（沿用原訊息）", () => {
    expect(collectRefundErrors(rf({ amount: 500 }), 500, -1000)).toEqual([]);
    expect(collectRefundErrors(rf({ amount: 500.01 }), 500, -1000)).toEqual([
      "退款金額 500.01 超過預收餘額 500。",
    ]);
  });

  it("沒有預收：不論未結應收，提示先以沖抵單轉預收", () => {
    expect(collectRefundErrors(rf(), 0, 3000)).toEqual([
      "此客戶沒有預收餘額可退款；銷退的負數餘額請先以 0 元沖抵單轉為預收。",
    ]);
  });

  it("與其他欄位錯誤一起列出", () => {
    expect(
      collectRefundErrors(rf({ method: "other", amount: 3000 }), 5000, 3000),
    ).toEqual([
      "退款方式需為匯款、現金或支票。",
      "退款金額 3,000 超過最多可退 2,000（預收 5,000 − 未結應收 3,000）；請先以「補沖銷」把預收沖到未結單據。",
    ]);
  });

  it("廠商退款：預付、未結應付", () => {
    expect(
      collectRefundErrors(
        rf({ direction: "out", amount: 3000.01 }),
        8000,
        5000,
      ),
    ).toEqual([
      "退款金額 3,000.01 超過最多可退 3,000（預付 8,000 − 未結應付 5,000）；請先以「補沖銷」把預付沖到未結單據。",
    ]);
    expect(
      collectRefundErrors(rf({ direction: "out", amount: 1 }), 3000, 3000),
    ).toEqual([
      "此廠商尚有未結應付 3,000，不少於預付 3,000，目前不可退款；請先以「補沖銷」把預付沖到未結單據。",
    ]);
  });
});

describe("退款確認框：顯示上限", () => {
  const base = {
    direction: "in" as const,
    partyLabel: "CAP253 退款上限測試",
    payDate: "2026-10-13",
    amount: 2000,
    method: "transfer" as const,
    checkNo: "",
    checkDueDate: "",
    bank: "",
    prepaid: 5000,
  };

  it("有未結應收：預收 − 未結應收 = 最多可退", () => {
    const s = refundConfirmSummary({ ...base, openTotal: 3000 });
    expect(s.openLabel).toBe("未結應收");
    expect(s.openText).toBe("3,000");
    expect(s.hasOpen).toBe(true);
    expect(s.capText).toBe("2,000");
    expect(s.prepaidBeforeText).toBe("5,000");
    expect(s.prepaidAfterText).toBe("3,000");
  });

  it("沒有未結應收：最多可退 = 預收", () => {
    const s = refundConfirmSummary(base);
    expect(s.openText).toBe("0");
    expect(s.hasOpen).toBe(false);
    expect(s.capText).toBe("5,000");
  });

  it("未結應收淨額為負：最多可退 = 預收，不列算式", () => {
    const s = refundConfirmSummary({ ...base, prepaid: 500, openTotal: -1000 });
    expect(s.hasOpen).toBe(false);
    expect(s.capText).toBe("500");
  });

  it("廠商：未結應付", () => {
    const s = refundConfirmSummary({
      ...base,
      direction: "out",
      prepaid: 8000,
      openTotal: 5000,
      amount: 3000,
    });
    expect(s.openLabel).toBe("未結應付");
    expect(s.capText).toBe("3,000");
  });
});

describe("loadPrepaidAction：一併讀出未結單據與上限", () => {
  it("讀預收來源與 erp_document_balances，算出未結應收與最多可退", async () => {
    rowsByTable.erp_payments = [
      {
        id: "rc",
        kind: "payment",
        doc_no: "RC1",
        pay_date: "2026-10-01",
        amount: "5000",
        status: "posted",
        erp_payment_allocations: [],
        refunded_by: [],
      },
    ];
    rowsByTable.erp_document_balances = [
      {
        document_id: "s2",
        doc_type: "S",
        doc_no: "S2",
        doc_date: "2026-10-02",
        customer_id: "c1",
        vendor_id: null,
        total_twd: "3000",
        allocated: "0",
        outstanding: "3000",
      },
    ];
    const res = await loadPrepaidAction("in", "c1");
    expect(res).toEqual({
      ok: true,
      data: {
        total: 5000,
        sources: [
          {
            id: "rc",
            doc_no: "RC1",
            pay_date: "2026-10-01",
            amount: 5000,
            available: 5000,
          },
        ],
        openTotal: 3000,
        refundable: 2000,
        openDocs: [
          {
            document_id: "s2",
            doc_type: "S",
            doc_no: "S2",
            doc_date: "2026-10-02",
            outstanding: 3000,
          },
        ],
      },
    });
    const docs = selectCalls.find((c) => c.table === "erp_document_balances");
    expect(docs?.filters).toEqual([
      ["eq", "customer_id", "c1"],
      ["in", "doc_type", ["S", "SR"]],
      ["neq", "outstanding", 0],
    ]);
  });

  it("廠商：以 vendor_id、I／PR 讀取", async () => {
    await loadPrepaidAction("out", "v1");
    const docs = selectCalls.find((c) => c.table === "erp_document_balances");
    expect(docs?.filters).toEqual([
      ["eq", "vendor_id", "v1"],
      ["in", "doc_type", ["I", "PR"]],
      ["neq", "outstanding", 0],
    ]);
  });

  it("未結單據讀取失敗 → 回錯誤（不可只憑預收放行）", async () => {
    errorByTable.erp_document_balances = { message: "boom" };
    const res = await loadPrepaidAction("in", "c1");
    expect(res).toEqual({ ok: false, error: "操作失敗：boom" });
  });

  it("未授權 → 拒絕，不碰 DB", async () => {
    moduleGranted = false;
    expect(await loadPrepaidAction("in", "c1")).toEqual({
      ok: false,
      error: "沒有 ERP 權限",
    });
    expect(selectCalls).toHaveLength(0);
  });
});
