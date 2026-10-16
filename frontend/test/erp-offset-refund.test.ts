import { describe, it, expect, vi, beforeEach } from "vitest";

// #249（#238 §4 N-2）：0 元沖抵單、溢收轉預收、退款單。
//   * distributeAllocations：預設沖銷不受勾選順序影響
//   * 沖銷檢核 R3（合計為負須先沖清一般單據）、R4（金額 0 需有銷退）
//   * 確認框（沖抵單、退款單）、退款表單檢核
//   * 對帳單：退款增加餘額、沖抵單不影響
//   * 帳齡：沖抵後應收 0、預收 9,500
//   * 預收來源（退款用）、server actions
// supabase / next/cache 以假物件替代。

let moduleGranted = true;
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: {
  data: unknown;
  error: { message: string; details?: string } | null;
} = { data: null, error: null };
let selectCalls: {
  table: string;
  columns: string;
  filters: unknown[][];
}[] = [];
let selectRows: unknown[] = [];

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
    // selectRows 只模擬 erp_payments；其他表（#253 起退款表單另讀 erp_document_balances）回空
    range: (from: number, to: number) =>
      Promise.resolve({
        data: table === "erp_payments" ? selectRows.slice(from, to + 1) : [],
        error: null,
      }),
  };
  return b;
}

const fakeSupabase = {
  from: (table: string) => ({
    select: (columns: string) => selectBuilder(table, columns),
  }),
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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createPaymentAction,
  createRefundAction,
  loadPrepaidAction,
} from "@/app/admin/(protected)/erp/collections/_components/actions";
import {
  allocatedTotal,
  collectAllocationErrors,
  collectPaymentSubmitErrors,
  distributeAllocations,
  isOffsetAmount,
  normalizePaymentInput,
  remainingAmount,
  toAllocationInputs,
  type AllocationRow,
  type OutstandingDoc,
  type PaymentFormInput,
} from "@/app/admin/(protected)/erp/collections/_components/allocation";
import { paymentConfirmSummary } from "@/app/admin/(protected)/erp/collections/_components/payment-confirm";
import {
  collectRefundErrors,
  refundConfirmSummary,
  validateRefundForm,
  type RefundFormInput,
} from "@/app/admin/(protected)/erp/collections/_components/refund";
import { paymentUnallocated, summarizePrepaid } from "@/lib/erp/queries/ar-ap";
import { buildAgingReport, checkFlowLabel } from "@/lib/erp/reports";
import {
  buildStatement,
  signedPaymentAmount,
  type StatementPaymentInput,
} from "@/lib/erp/statement";

beforeEach(() => {
  moduleGranted = true;
  rpcCalls = [];
  rpcResponse = { data: null, error: null };
  selectCalls = [];
  selectRows = [];
});

// #238：S 321,300 已收 20,000 → 未沖 301,300；全退 SR 7,650 + 313,650；另 S3 10,500
const od = (
  document_id: string,
  doc_type: string,
  doc_no: string,
  doc_date: string,
  outstanding: number,
): OutstandingDoc => ({
  document_id,
  doc_type,
  doc_no,
  doc_date,
  total_twd: outstanding,
  allocated: 0,
  outstanding,
});
const DOCS: OutstandingDoc[] = [
  od("s", "S", "S11510002", "2026-10-01", 301300),
  od("s3", "S", "S11510003", "2026-10-02", 10500),
  od("sr1", "SR", "SR11510001", "2026-10-05", -7650),
  od("sr2", "SR", "SR11510002", "2026-10-05", -313650),
];

function blank(docs: OutstandingDoc[] = DOCS): AllocationRow[] {
  return docs.map((d) => ({
    document_id: d.document_id,
    selected: false,
    amount: 0,
  }));
}

/** 模擬 AllocationTable 依序勾選（每次勾選後以 distributeAllocations 重算）。 */
function checkInOrder(
  order: string[],
  capacity: number,
  docs: OutstandingDoc[] = DOCS,
): AllocationRow[] {
  let rows = blank(docs);
  for (const id of order) {
    rows = distributeAllocations(
      docs,
      rows.map((r) => (r.document_id === id ? { ...r, selected: true } : r)),
      capacity,
    );
  }
  return rows;
}

const amounts = (rows: AllocationRow[]) =>
  Object.fromEntries(rows.map((r) => [r.document_id, r.amount]));

describe("distributeAllocations：預設沖銷不受勾選順序影響", () => {
  it("#238：先勾 S 再勾 SR → S 帶入 301,300（不再停在 0）；合計 −9,500、剩餘預收 9,500", () => {
    const rows = checkInOrder(["s", "s3", "sr1", "sr2"], 0);
    expect(amounts(rows)).toEqual({
      s: 301300,
      s3: 10500,
      sr1: -7650,
      sr2: -313650,
    });
    expect(allocatedTotal(rows)).toBe(-9500);
    expect(remainingAmount(0, rows)).toBe(9500);
  });

  it("四種勾選順序結果相同", () => {
    const orders = [
      ["s", "s3", "sr1", "sr2"],
      ["sr1", "sr2", "s", "s3"],
      ["s3", "sr2", "s", "sr1"],
      ["sr2", "s", "sr1", "s3"],
    ];
    const results = orders.map((o) => amounts(checkInOrder(o, 0)));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("額度不足時依日期（docs 順序）分配給一般單據，不是依勾選順序", () => {
    // 只有 SR1 7,650 的貸項 + 收款 1,000 → 先給較早的 S，S3 為 0
    const rows = checkInOrder(["s3", "sr1", "s"], 1000);
    expect(amounts(rows)).toEqual({ s: 8650, s3: 0, sr1: -7650, sr2: 0 });
  });

  it("取消勾選也重算：取消 SR2 後 S 只剩 SR1 的額度", () => {
    let rows = checkInOrder(["s", "sr1", "sr2"], 0);
    expect(amounts(rows).s).toBe(301300);
    rows = distributeAllocations(
      DOCS,
      rows.map((r) =>
        r.document_id === "sr2" ? { ...r, selected: false } : r,
      ),
      0,
    );
    expect(amounts(rows)).toEqual({ s: 7650, s3: 0, sr1: -7650, sr2: 0 });
  });

  it("未勾選列為 0、回傳順序同 docs；沒有負數單據時等同 min(未沖, 剩餘)", () => {
    const docs = [
      od("a", "S", "S1", "2026-09-01", 50000),
      od("b", "S", "S2", "2026-09-02", 30000),
    ];
    const rows = checkInOrder(["b", "a"], 60000, docs);
    expect(rows.map((r) => r.document_id)).toEqual(["a", "b"]);
    expect(amounts(rows)).toEqual({ a: 50000, b: 10000 });
  });
});

describe("沖銷檢核（R2–R4）", () => {
  const all = checkInOrder(["s", "s3", "sr1", "sr2"], 0);

  it("沖清所有銷貨後合計為負 → 通過（溢收 9,500 轉預收）", () => {
    expect(collectAllocationErrors(0, all, DOCS, "in")).toEqual([]);
  });

  it("合計為負但仍有未沖清的銷貨單 → 擋，並列出單號（不可憑空產生預收）", () => {
    const onlySr = checkInOrder(["sr1"], 0);
    const errs = collectAllocationErrors(0, onlySr, DOCS, "in");
    expect(errs).toEqual([
      "沖銷合計為 -7650：銷退貸項要轉為預收，須先沖清所有未結銷貨單（尚未沖清：S11510002、S11510003）。",
    ]);
    const noS3 = checkInOrder(["s", "sr1", "sr2"], 0);
    expect(collectAllocationErrors(0, noS3, DOCS, "in")[0]).toContain(
      "尚未沖清：S11510003",
    );
  });

  it("付款端用「進退／預付／進貨」", () => {
    const docs = [
      od("i", "I", "I1", "2026-10-01", 7000),
      od("pr", "PR", "PR1", "2026-10-02", -10000),
    ];
    const rows = checkInOrder(["pr"], 0, docs);
    expect(collectAllocationErrors(0, rows, docs, "out")[0]).toBe(
      "沖銷合計為 -10000：進退貸項要轉為預付，須先沖清所有未結進貨單（尚未沖清：I1）。",
    );
  });

  it("合計為正且超過額度仍擋（R2）；合計 0 的純沖抵通過", () => {
    const rows: AllocationRow[] = [
      { document_id: "s3", selected: true, amount: 10500 },
      { document_id: "sr1", selected: true, amount: -7650 },
    ];
    expect(collectAllocationErrors(0, rows, DOCS, "in")).toEqual([
      "沖銷合計 2850 超過可沖銷金額 0。",
    ]);
    const zero: AllocationRow[] = [
      { document_id: "s3", selected: true, amount: 7650 },
      { document_id: "sr1", selected: true, amount: -7650 },
    ];
    expect(collectAllocationErrors(0, zero, DOCS, "in")).toEqual([]);
  });

  const payForm = (
    patch: Partial<PaymentFormInput> = {},
  ): PaymentFormInput => ({
    direction: "in",
    pay_date: "2026-10-13",
    party_id: "kk897",
    method: "transfer",
    amount: 0,
    allocations: [],
    ...patch,
  });

  it("金額 0：方式與支票欄位不檢查；沒有銷退沖銷 → 擋（R4）", () => {
    const onlyS = checkInOrder(["s3"], 0);
    expect(
      collectPaymentSubmitErrors(
        payForm({ method: "check", allocations: toAllocationInputs(onlyS) }),
        onlyS,
        DOCS,
      ),
    ).toEqual([
      "金額 0 為沖抵單，需至少勾選一張銷退單。",
      // 只勾 S3 時沒有額度，預設沖銷為 0
      "單據 S11510003 的沖銷金額不可為 0。",
    ]);
    expect(
      collectPaymentSubmitErrors(
        payForm({ method: "check", allocations: toAllocationInputs(all) }),
        all,
        DOCS,
      ),
    ).toEqual([]);
  });

  it("normalizePaymentInput：金額 0 → 方式 other、清除票號／票期／銀行；其他金額不動", () => {
    const n = normalizePaymentInput(
      payForm({
        method: "check",
        check_no: "CK",
        check_due_date: "2026-11-01",
        bank: "台銀",
      }),
    );
    expect(n).toMatchObject({
      amount: 0,
      method: "other",
      check_no: null,
      check_due_date: null,
      bank: null,
    });
    const keep = payForm({ amount: 100, method: "check", check_no: "CK" });
    expect(normalizePaymentInput(keep)).toBe(keep);
    expect(isOffsetAmount(0.001)).toBe(true);
    expect(isOffsetAmount(0.01)).toBe(false);
  });
});

describe("確認框", () => {
  it("沖抵單：標題、確認鈕、方式為沖抵、不列銀行；轉入預收 9,500", () => {
    const s = paymentConfirmSummary({
      direction: "in",
      partyLabel: "KK897 兆泰",
      payDate: "2026-10-13",
      amount: 0,
      method: "check",
      checkNo: "X",
      checkDueDate: "2026-11-01",
      bank: "台銀",
      rows: checkInOrder(["s", "s3", "sr1", "sr2"], 0),
      docs: DOCS,
    });
    expect(s.offset).toBe(true);
    expect(s.title).toBe("確定過帳此沖抵單？");
    expect(s.confirmLabel).toBe("過帳沖抵單");
    expect(s.details).toEqual([
      { label: "客戶", value: "KK897 兆泰" },
      { label: "收款日期", value: "民國115/10/13" },
      { label: "方式", value: "沖抵（以銷退沖抵，不收款）" },
    ]);
    expect(s.allocationCount).toBe(4);
    expect(s.allocationTotalText).toBe("-9,500");
    expect(s.remainingLabel).toBe("預收");
    expect(s.remainingText).toBe("9,500");
  });

  it("一般收款不受影響（offset = false）", () => {
    const s = paymentConfirmSummary({
      direction: "in",
      partyLabel: null,
      payDate: "2026-10-13",
      amount: 20000,
      method: "transfer",
      checkNo: "",
      checkDueDate: "",
      bank: "",
      rows: [],
      docs: [],
    });
    expect(s.offset).toBe(false);
    expect(s.confirmLabel).toBe("過帳收款");
  });

  it("退款單：金額、方式、預收 9,500 → 0", () => {
    const s = refundConfirmSummary({
      direction: "in",
      partyLabel: "KK897 兆泰",
      payDate: "2026-10-13",
      amount: 9500,
      method: "check",
      checkNo: "RF001",
      checkDueDate: "2026-10-30",
      bank: "一銀",
      prepaid: 9500,
    });
    expect(s.title).toBe("確定過帳此客戶退款？");
    expect(s.confirmLabel).toBe("過帳客戶退款");
    expect(s.amountLabel).toBe("退款金額（TWD）");
    expect(s.amountText).toBe("9,500");
    expect(s.details).toEqual([
      { label: "客戶", value: "KK897 兆泰" },
      { label: "退款日期", value: "民國115/10/13" },
      { label: "方式", value: "支票" },
      { label: "銀行", value: "一銀" },
      { label: "票號", value: "RF001" },
      { label: "到期日", value: "民國115/10/30" },
    ]);
    expect(s.prepaidLabel).toBe("預收");
    expect(s.prepaidBeforeText).toBe("9,500");
    expect(s.prepaidAfterText).toBe("0");
  });

  it("廠商退款：收回金額、預付", () => {
    const s = refundConfirmSummary({
      direction: "out",
      partyLabel: "V249",
      payDate: "2026-10-13",
      amount: 3000.5,
      method: "transfer",
      checkNo: "",
      checkDueDate: "",
      bank: "",
      prepaid: 5000,
    });
    expect(s.confirmLabel).toBe("過帳廠商退款");
    expect(s.amountLabel).toBe("收回金額（TWD）");
    expect(s.prepaidLabel).toBe("預付");
    expect(s.prepaidAfterText).toBe("1,999.50");
  });
});

describe("退款表單檢核", () => {
  const rf = (patch: Partial<RefundFormInput> = {}): RefundFormInput => ({
    direction: "in",
    pay_date: "2026-10-13",
    party_id: "kk897",
    method: "transfer",
    amount: 9500,
    ...patch,
  });

  it("通過：金額 ≤ 預收", () => {
    expect(collectRefundErrors(rf(), 9500)).toEqual([]);
  });

  it("超過預收 → 擋；沒有預收 → 提示先以沖抵單轉預收", () => {
    expect(collectRefundErrors(rf({ amount: 9500.01 }), 9500)).toEqual([
      "退款金額 9500.01 超過預收餘額 9500。",
    ]);
    expect(collectRefundErrors(rf(), 0)).toEqual([
      "此客戶沒有預收餘額可退款；銷退的負數餘額請先以 0 元沖抵單轉為預收。",
    ]);
  });

  it("方式限匯款／現金／支票；金額需 > 0；支票欄位必填；一次列出", () => {
    expect(
      collectRefundErrors(
        rf({ party_id: null, method: "other", amount: 0 }),
        100,
      ),
    ).toEqual([
      "請選擇客戶。",
      "退款方式需為匯款、現金或支票。",
      "退款金額需大於 0。",
    ]);
    expect(collectRefundErrors(rf({ method: "check" }), 9500)).toEqual([
      "支票需填寫票號。",
      "支票需填寫到期日（票期）。",
      "支票需填寫銀行。",
    ]);
    expect(validateRefundForm(rf({ direction: "out", party_id: null }))).toBe(
      "請選擇廠商。",
    );
    // server 端不知道預收，交給 DB
    expect(validateRefundForm(rf({ amount: 1e9 }))).toBeNull();
  });
});

describe("對帳單（#238 逐列）", () => {
  const pay = (
    id: string,
    pay_date: string,
    amount: number,
    patch: Partial<StatementPaymentInput> = {},
  ): StatementPaymentInput => ({
    id,
    doc_no: id,
    pay_date,
    method: "transfer",
    amount,
    status: "posted",
    ...patch,
  });

  it("銷貨 → 收款 → 銷退 → 0 元沖抵（不影響）→ 退款（增加餘額）→ 期末 0", () => {
    const s = buildStatement({
      openingDocs: [],
      openingPayments: [],
      docs: [
        {
          id: "s",
          doc_type: "S",
          doc_no: "S11510002",
          doc_date: "2026-10-01",
          total_twd: 321300,
        },
        {
          id: "s3",
          doc_type: "S",
          doc_no: "S11510003",
          doc_date: "2026-10-02",
          total_twd: 10500,
        },
        {
          id: "sr1",
          doc_type: "SR",
          doc_no: "SR11510001",
          doc_date: "2026-10-05",
          total_twd: 7650,
        },
        {
          id: "sr2",
          doc_type: "SR",
          doc_no: "SR11510002",
          doc_date: "2026-10-05",
          total_twd: 313650,
        },
      ],
      payments: [
        pay("RC11510002", "2026-10-03", 20000),
        pay("RC11510003", "2026-10-13", 0, { method: "other" }),
        pay("RF11510001", "2026-10-13", 9500, { kind: "refund" }),
      ],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(
      s.rows.map((r) => [r.doc_no, r.charge, r.payment, r.balance]),
    ).toEqual([
      ["S11510002", 321300, null, 321300],
      ["S11510003", 10500, null, 331800],
      ["RC11510002", null, 20000, 311800],
      ["SR11510001", -7650, null, 304150],
      ["SR11510002", -313650, null, -9500],
      ["RC11510003", null, 0, -9500],
      ["RF11510001", null, -9500, 0],
    ]);
    expect(s.rows[5].description).toBe("沖抵（以銷退沖抵銷貨）");
    expect(s.rows[6].description).toBe("退款（匯款）");
    expect(s.paymentsTotal).toBe(10500);
    expect(s.closing).toBe(0);
  });

  it("期初也計入退款；廠商退款描述", () => {
    const s = buildStatement({
      openingDocs: [],
      openingPayments: [
        pay("PM1", "2026-09-01", 5000),
        pay("VR1", "2026-09-10", 2000, { kind: "refund" }),
      ],
      docs: [],
      payments: [pay("VR2", "2026-10-02", 1000, { kind: "refund" })],
      from: "2026-10-01",
      to: "2026-10-31",
      partyType: "vendor",
    });
    expect(s.opening).toBe(-3000);
    expect(s.rows[0].description).toBe("廠商退款（匯款）");
    expect(s.closing).toBe(-2000);
    expect(signedPaymentAmount({ kind: "refund", amount: -5 })).toBe(-5);
    expect(signedPaymentAmount({ amount: -5 })).toBe(5);
  });
});

describe("帳齡（應收／預收分欄）", () => {
  it("沖抵前：應收 −9,500、預收 0；沖抵後：應收 0、預收 9,500；退款後不列出", () => {
    const docs = (outstanding: Record<string, number>) =>
      DOCS.map((d) => ({
        doc_type: d.doc_type as "S" | "SR",
        doc_date: d.doc_date,
        customer_id: "kk897",
        vendor_id: null,
        outstanding: outstanding[d.document_id],
      }));
    const before = buildAgingReport(
      docs({ s: 301300, s3: 10500, sr1: -7650, sr2: -313650 }),
      [{ party_id: "kk897", balance: -9500, unallocated: 0 }],
      "2026-10-13",
      "customer",
    );
    expect(before.rows[0]).toMatchObject({
      outstanding: -9500,
      unallocated: 0,
      net: -9500,
    });
    const after = buildAgingReport(
      docs({ s: 0, s3: 0, sr1: 0, sr2: 0 }),
      [{ party_id: "kk897", balance: 0, unallocated: 9500 }],
      "2026-10-13",
      "customer",
    );
    expect(after.rows[0]).toMatchObject({
      outstanding: 0,
      unallocated: 9500,
      net: -9500,
    });
    expect(after.rows[0].buckets.d0_30).toBe(0);
    const refunded = buildAgingReport(
      docs({ s: 0, s3: 0, sr1: 0, sr2: 0 }),
      [{ party_id: "kk897", balance: 0, unallocated: 0 }],
      "2026-10-13",
      "customer",
    );
    expect(refunded.rows).toEqual([]);
  });
});

describe("總覽到期支票：收／開票別", () => {
  it("收款收票、付款開票；退款給客戶是開票、廠商退款是收票", () => {
    expect(checkFlowLabel({ direction: "in" })).toBe("收票");
    expect(checkFlowLabel({ direction: "out", kind: "payment" })).toBe("開票");
    expect(checkFlowLabel({ direction: "in", kind: "refund" })).toBe(
      "開票（退款）",
    );
    expect(checkFlowLabel({ direction: "out", kind: "refund" })).toBe(
      "收票（退款）",
    );
  });
});

describe("預收餘額與來源", () => {
  it("paymentUnallocated：金額 − 沖銷 − 已退款；沖抵單負數沖銷成為預收；退款單與作廢為 0", () => {
    expect(
      paymentUnallocated({
        status: "posted",
        kind: "payment",
        amount: 0,
        allocated: -9500,
        refunded: 0,
      }),
    ).toBe(9500);
    expect(
      paymentUnallocated({
        status: "posted",
        kind: "payment",
        amount: 0,
        allocated: -9500,
        refunded: 9500,
      }),
    ).toBe(0);
    expect(
      paymentUnallocated({
        status: "posted",
        kind: "refund",
        amount: 9500,
        allocated: 0,
        refunded: 0,
      }),
    ).toBe(0);
    expect(
      paymentUnallocated({
        status: "voided",
        amount: 1000,
        allocated: 0,
        refunded: 0,
      }),
    ).toBe(0);
  });

  it("summarizePrepaid：只列可退 > 0、依日期排序（同 DB 的 FIFO 順序）", () => {
    const s = summarizePrepaid([
      {
        id: "late",
        doc_no: "RC3",
        pay_date: "2026-10-14",
        amount: 1000,
        status: "posted",
        kind: "payment",
        allocated: 0,
        refunded: 500,
      },
      {
        id: "offset",
        doc_no: "RC2",
        pay_date: "2026-10-13",
        amount: 0,
        status: "posted",
        kind: "payment",
        allocated: -9500,
        refunded: 0,
      },
      {
        id: "used",
        doc_no: "RC1",
        pay_date: "2026-10-03",
        amount: 20000,
        status: "posted",
        kind: "payment",
        allocated: 20000,
        refunded: 0,
      },
    ]);
    expect(s.total).toBe(10000);
    expect(s.sources.map((r) => [r.id, r.available])).toEqual([
      ["offset", 9500],
      ["late", 500],
    ]);
  });
});

describe("server actions（#249）", () => {
  it("未授權：退款與預收查詢皆拒絕，不碰 DB", async () => {
    moduleGranted = false;
    const denied = { ok: false, error: "沒有 ERP 權限" };
    expect(
      await createRefundAction({
        direction: "in",
        pay_date: "2026-10-13",
        party_id: "kk897",
        method: "transfer",
        amount: 1,
      }),
    ).toEqual(denied);
    expect(await loadPrepaidAction("in", "kk897")).toEqual(denied);
    expect(rpcCalls).toHaveLength(0);
    expect(selectCalls).toHaveLength(0);
  });

  it("createPaymentAction：金額 0 + 銷退沖銷 → erp_post_payment，方式正規化為 other、不帶票號", async () => {
    rpcResponse = { data: { id: "off-1", doc_no: "RC11510003" }, error: null };
    const rows = checkInOrder(["s", "s3", "sr1", "sr2"], 0);
    const res = await createPaymentAction({
      direction: "in",
      pay_date: "2026-10-13",
      party_id: "kk897",
      method: "check",
      amount: 0,
      check_no: "CK",
      check_due_date: "2026-11-01",
      bank: "台銀",
      allocations: toAllocationInputs(rows),
    });
    expect(res.ok).toBe(true);
    expect(rpcCalls[0].fn).toBe("erp_post_payment");
    expect(rpcCalls[0].args).toMatchObject({
      p_payment: {
        amount: 0,
        method: "other",
        check_no: null,
        check_due_date: null,
        bank: null,
        check_status: null,
      },
    });
  });

  it("createPaymentAction：金額 0 沒有銷退 → 拒絕，不呼叫 RPC", async () => {
    const res = await createPaymentAction({
      direction: "in",
      pay_date: "2026-10-13",
      party_id: "kk897",
      method: "transfer",
      amount: 0,
      allocations: [{ document_id: "s3", amount: 10500 }],
    });
    expect(res).toEqual({
      ok: false,
      error: "金額 0 為沖抵單，需至少勾選一張銷退單。",
    });
    expect(rpcCalls).toHaveLength(0);
  });

  it("createRefundAction：以 customer_id 呼叫 erp_post_refund；支票預設 pending", async () => {
    rpcResponse = { data: { id: "rf-1", doc_no: "RF11510001" }, error: null };
    const res = await createRefundAction({
      direction: "in",
      pay_date: "2026-10-13",
      party_id: "kk897",
      method: "check",
      amount: 9500,
      check_no: " RF001 ",
      check_due_date: "2026-10-30",
      bank: "一銀",
      note: " 退還溢收 ",
    });
    expect(res).toEqual({
      ok: true,
      data: { id: "rf-1", doc_no: "RF11510001" },
    });
    expect(rpcCalls).toEqual([
      {
        fn: "erp_post_refund",
        args: {
          p_refund: {
            direction: "in",
            pay_date: "2026-10-13",
            customer_id: "kk897",
            vendor_id: null,
            method: "check",
            amount: 9500,
            check_no: "RF001",
            check_due_date: "2026-10-30",
            bank: "一銀",
            check_status: "pending",
            note: "退還溢收",
          },
        },
      },
    ]);
  });

  it("createRefundAction：廠商退款以 vendor_id；方式 other 擋；DB 超額錯誤轉中文", async () => {
    expect(
      await createRefundAction({
        direction: "out",
        pay_date: "2026-10-13",
        party_id: "v1",
        method: "other",
        amount: 1,
      }),
    ).toEqual({ ok: false, error: "退款方式需為匯款、現金或支票。" });
    expect(rpcCalls).toHaveLength(0);

    rpcResponse = {
      data: null,
      error: {
        message: "over_allocation",
        details: "退款金額 3001 超過預付餘額 3000.00",
      },
    };
    const res = await createRefundAction({
      direction: "out",
      pay_date: "2026-10-13",
      party_id: "v1",
      method: "transfer",
      amount: 3001,
    });
    expect(res).toEqual({
      ok: false,
      error: "退款金額 3001 超過預付餘額 3000.00",
    });
    expect(rpcCalls[0].args).toMatchObject({
      p_refund: { direction: "out", customer_id: null, vendor_id: "v1" },
    });
  });

  it("loadPrepaidAction：只讀該對象有效的收付款，依日期回傳可退來源", async () => {
    selectRows = [
      {
        id: "offset",
        kind: "payment",
        doc_no: "RC11510003",
        pay_date: "2026-10-13",
        amount: "0",
        status: "posted",
        erp_payment_allocations: [{ amount: "-321300" }, { amount: "311800" }],
        refunded_by: [],
      },
      {
        id: "rc",
        kind: "payment",
        doc_no: "RC11510002",
        pay_date: "2026-10-03",
        amount: "20000",
        status: "posted",
        erp_payment_allocations: [{ amount: "20000" }],
        refunded_by: [],
      },
    ];
    const res = await loadPrepaidAction("in", "kk897");
    expect(res).toEqual({
      ok: true,
      data: {
        total: 9500,
        sources: [
          {
            id: "offset",
            doc_no: "RC11510003",
            pay_date: "2026-10-13",
            amount: 0,
            available: 9500,
          },
        ],
        // #253：沒有未結單據 → 最多可退 = 預收
        openTotal: 0,
        refundable: 9500,
        openDocs: [],
      },
    });
    expect(selectCalls[0].table).toBe("erp_payments");
    expect(selectCalls[0].columns).toContain(
      "erp_refund_sources!source_payment_id",
    );
    expect(selectCalls[0].filters).toEqual([
      ["eq", "direction", "in"],
      ["eq", "customer_id", "kk897"],
      ["eq", "status", "posted"],
      ["eq", "kind", "payment"],
    ]);
  });
});
