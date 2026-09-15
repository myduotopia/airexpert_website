import { describe, it, expect, vi, beforeEach } from "vitest";

// 收付款：純計算（沖銷預設、驗證）+ server actions（未授權、支票必填、RPC 呼叫）。
// supabase / next/cache 以假物件替代（同 erp-documents.test.ts 模式）。

let moduleGranted = true;
let rpcCalls: { fn: string; args: unknown }[] = [];
let rpcResponse: {
  data: unknown;
  error: { message: string; details?: string } | null;
} = { data: null, error: null };
let updates: { table: string; payload: unknown; filters: unknown[][] }[] = [];
let updateResult: { data: unknown; error: unknown } = {
  data: [{ id: "pay-1" }],
  error: null,
};

function updateBuilder(table: string, payload: unknown) {
  const rec = { table, payload, filters: [] as unknown[][] };
  updates.push(rec);
  const b = {
    eq: (...args: unknown[]) => {
      rec.filters.push(args);
      return b;
    },
    select: async () => updateResult,
  };
  return b;
}

const fakeSupabase = {
  from: (table: string) => ({
    update: (payload: unknown) => updateBuilder(table, payload),
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
  allocatePaymentAction,
  createPaymentAction,
  loadOutstandingAction,
  updateCheckStatusAction,
  voidPaymentAction,
} from "@/app/admin/(protected)/erp/collections/_components/actions";
import {
  allocatedTotal,
  defaultAllocation,
  outstandingAfter,
  remainingAmount,
  toAllocationInputs,
  validateAllocations,
  validatePaymentForm,
  type OutstandingDoc,
  type PaymentFormInput,
} from "@/app/admin/(protected)/erp/collections/_components/allocation";
import { ERP_ERROR_MESSAGES } from "@/lib/erp/errors";

beforeEach(() => {
  moduleGranted = true;
  rpcCalls = [];
  rpcResponse = { data: null, error: null };
  updates = [];
  updateResult = { data: [{ id: "pay-1" }], error: null };
});

const od = (
  document_id: string,
  outstanding: number,
  doc_type = "S",
): OutstandingDoc => ({
  document_id,
  doc_type,
  doc_no: `${doc_type}-${document_id}`,
  doc_date: "2026-09-11",
  total_twd: outstanding,
  allocated: 0,
  outstanding,
});

function form(patch: Partial<PaymentFormInput> = {}): PaymentFormInput {
  return {
    direction: "in",
    pay_date: "2026-09-02",
    party_id: "cust-1",
    method: "transfer",
    amount: 70000,
    allocations: [],
    ...patch,
  };
}

describe("沖銷預設值與剩餘", () => {
  it("defaultAllocation = min(未沖餘額, 剩餘)，剩餘不足為 0", () => {
    expect(defaultAllocation(235000, 70000)).toBe(70000);
    expect(defaultAllocation(50000, 70000)).toBe(50000);
    expect(defaultAllocation(50000, 0)).toBe(0);
    expect(defaultAllocation(50000, -10)).toBe(0);
  });

  it("退貨單（負數）預設整張沖銷", () => {
    expect(defaultAllocation(-3000, 0)).toBe(-3000);
  });

  it("剩餘 = 金額 − 已勾選沖銷（未勾選不計）", () => {
    const rows = [
      { document_id: "a", selected: true, amount: 40000 },
      { document_id: "b", selected: false, amount: 99999 },
      { document_id: "c", selected: true, amount: -5000.1 },
    ];
    expect(allocatedTotal(rows)).toBe(34999.9);
    expect(remainingAmount(70000, rows)).toBe(35000.1);
    expect(toAllocationInputs(rows)).toEqual([
      { document_id: "a", amount: 40000 },
      { document_id: "c", amount: -5000.1 },
    ]);
  });

  it("validateAllocations：超沖單據 / 合計超過金額 / 反向皆拒絕", () => {
    const docs = [od("a", 1000), od("r", -300, "SR")];
    expect(
      validateAllocations(
        1000,
        [{ document_id: "a", selected: true, amount: 1000 }],
        docs,
      ),
    ).toBeNull();
    expect(
      validateAllocations(
        5000,
        [{ document_id: "a", selected: true, amount: 1001 }],
        docs,
      ),
    ).toContain("未沖餘額");
    expect(
      validateAllocations(
        500,
        [{ document_id: "a", selected: true, amount: 800 }],
        docs,
      ),
    ).toContain("超過可沖銷金額");
    // 退貨單增加額度：800 − 300 = 500 ≤ 500
    expect(
      validateAllocations(
        500,
        [
          { document_id: "a", selected: true, amount: 800 },
          { document_id: "r", selected: true, amount: -300 },
        ],
        docs,
      ),
    ).toBeNull();
    expect(
      validateAllocations(
        500,
        [{ document_id: "r", selected: true, amount: 300 }],
        docs,
      ),
    ).toContain("退貨單");
  });

  it("情境：訂金 70,000 → S 235,000 補沖 70,000 → 剩 165,000 → 票 165,000 沖清", () => {
    // 09/02 收訂金：尚無單據，全額預收
    expect(remainingAmount(70000, [])).toBe(70000);

    // 09/11 S11509047 過帳 → 補沖銷（capacity = 預收 70,000）
    let outstanding = 235000;
    const first = defaultAllocation(outstanding, 70000);
    expect(first).toBe(70000);
    const deposit = [{ document_id: "s", selected: true, amount: first }];
    expect(validateAllocations(70000, deposit, [od("s", outstanding)])).toBe(
      null,
    );
    expect(remainingAmount(70000, deposit)).toBe(0);
    outstanding = outstandingAfter(outstanding, first);
    expect(outstanding).toBe(165000);

    // 30 天票 165,000 收款並沖銷
    const second = defaultAllocation(outstanding, 165000);
    const cheque = [{ document_id: "s", selected: true, amount: second }];
    expect(validateAllocations(165000, cheque, [od("s", outstanding)])).toBe(
      null,
    );
    expect(remainingAmount(165000, cheque)).toBe(0);
    expect(outstandingAfter(outstanding, second)).toBe(0);
  });
});

describe("validatePaymentForm", () => {
  it("支票需票號、票期、銀行", () => {
    expect(validatePaymentForm(form({ method: "check" }))).toBe(
      "支票需填寫票號。",
    );
    expect(
      validatePaymentForm(form({ method: "check", check_no: "CK1" })),
    ).toBe("支票需填寫票期。");
    expect(
      validatePaymentForm(
        form({
          method: "check",
          check_no: "CK1",
          check_due_date: "2026-10-12",
        }),
      ),
    ).toBe("支票需填寫銀行。");
    expect(
      validatePaymentForm(
        form({
          method: "check",
          check_no: "CK1",
          check_due_date: "2026-10-12",
          bank: "台銀",
        }),
      ),
    ).toBeNull();
  });

  it("未選對象 / 金額 ≤ 0 / 沖銷合計超過金額", () => {
    expect(validatePaymentForm(form({ party_id: null }))).toBe("請選擇客戶。");
    expect(
      validatePaymentForm(form({ direction: "out", party_id: null })),
    ).toBe("請選擇廠商。");
    expect(validatePaymentForm(form({ amount: 0 }))).toBe("金額需大於 0。");
    expect(
      validatePaymentForm(
        form({ allocations: [{ document_id: "d", amount: 70001 }] }),
      ),
    ).toContain("超過收款金額");
  });
});

describe("server actions", () => {
  it("未授權：全部 action 拒絕且不碰 DB", async () => {
    moduleGranted = false;
    const denied = { ok: false, error: "沒有 ERP 權限" };
    expect(await createPaymentAction(form())).toEqual(denied);
    expect(await loadOutstandingAction("in", "cust-1")).toEqual(denied);
    expect(
      await allocatePaymentAction("pay-1", "in", [
        { document_id: "d", amount: 1 },
      ]),
    ).toEqual(denied);
    expect(await updateCheckStatusAction("pay-1", "in", "cleared")).toEqual(
      denied,
    );
    expect(await voidPaymentAction("pay-1", "in", "錯帳")).toEqual(denied);
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("createPaymentAction：支票缺票號票期 → 拒絕，不呼叫 RPC", async () => {
    const res = await createPaymentAction(form({ method: "check" }));
    expect(res.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("createPaymentAction：以 customer_id 呼叫 erp_post_payment，支票預設 pending", async () => {
    rpcResponse = { data: { id: "pay-1", doc_no: "RC11509001" }, error: null };
    const res = await createPaymentAction(
      form({
        method: "check",
        amount: 165000,
        check_no: " CK001 ",
        check_due_date: "2026-10-12",
        bank: "台銀",
        allocations: [{ document_id: "doc-s", amount: 165000 }],
      }),
    );
    expect(res).toEqual({
      ok: true,
      data: { id: "pay-1", doc_no: "RC11509001" },
    });
    expect(rpcCalls[0].fn).toBe("erp_post_payment");
    expect(rpcCalls[0].args).toEqual({
      p_payment: {
        direction: "in",
        pay_date: "2026-09-02",
        customer_id: "cust-1",
        vendor_id: null,
        method: "check",
        amount: 165000,
        check_no: "CK001",
        check_due_date: "2026-10-12",
        bank: "台銀",
        check_status: "pending",
        note: null,
        allocations: [{ document_id: "doc-s", amount: 165000 }],
      },
    });
  });

  it("createPaymentAction：付款以 vendor_id 送出、非支票不帶票號", async () => {
    rpcResponse = { data: { id: "pay-2", doc_no: "PM11509001" }, error: null };
    await createPaymentAction(
      form({ direction: "out", party_id: "ven-1", check_no: "X" }),
    );
    expect(rpcCalls[0].args).toMatchObject({
      p_payment: {
        direction: "out",
        customer_id: null,
        vendor_id: "ven-1",
        check_no: null,
        check_status: null,
      },
    });
  });

  it("allocatePaymentAction：超沖 → over_allocation 中文訊息", async () => {
    rpcResponse = { data: null, error: { message: "over_allocation" } };
    const res = await allocatePaymentAction("pay-1", "in", [
      { document_id: "doc-s", amount: 999999 },
    ]);
    expect(res).toEqual({
      ok: false,
      error: ERP_ERROR_MESSAGES.over_allocation,
    });
    expect(rpcCalls[0]).toEqual({
      fn: "erp_allocate_payment",
      args: {
        p_payment_id: "pay-1",
        p_allocations: [{ document_id: "doc-s", amount: 999999 }],
      },
    });
  });

  it("allocatePaymentAction：沒有勾選 → 拒絕", async () => {
    expect((await allocatePaymentAction("pay-1", "in", [])).ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("updateCheckStatusAction：只更新 posted 支票；狀態值需合法", async () => {
    expect(
      (
        await updateCheckStatusAction(
          "pay-1",
          "in",
          "lost" as unknown as "cleared",
        )
      ).ok,
    ).toBe(false);
    expect(updates).toHaveLength(0);

    expect(await updateCheckStatusAction("pay-1", "in", "cleared")).toEqual({
      ok: true,
      data: null,
    });
    expect(updates[0]).toMatchObject({
      table: "erp_payments",
      payload: { check_status: "cleared" },
    });
    expect(updates[0].filters).toEqual(
      expect.arrayContaining([
        ["id", "pay-1"],
        ["method", "check"],
        ["status", "posted"],
      ]),
    );

    updateResult = { data: [], error: null };
    expect((await updateCheckStatusAction("pay-1", "in", "bounced")).ok).toBe(
      false,
    );
  });

  it("voidPaymentAction：原因必填，方向不合法拒絕", async () => {
    expect((await voidPaymentAction("pay-1", "in", " ")).ok).toBe(false);
    expect(
      (await voidPaymentAction("pay-1", "sideways" as unknown as "in", "錯帳"))
        .ok,
    ).toBe(false);
    expect(rpcCalls).toHaveLength(0);
    expect(await voidPaymentAction("pay-1", "out", " 退票 ")).toEqual({
      ok: true,
      data: null,
    });
    expect(rpcCalls[0]).toEqual({
      fn: "erp_void_payment",
      args: { p_payment_id: "pay-1", p_reason: "退票" },
    });
  });
});
