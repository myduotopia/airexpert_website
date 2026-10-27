import { beforeEach, describe, expect, it, vi } from "vitest";

// #267 客戶／廠商詳情頁「相關單據」：網址參數解析、分頁計算、列的顯示文字與連結路徑、RPC 參數。
// supabase / auth 以假物件替代。

let moduleGranted = true;
let rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResponse: {
  data: unknown;
  error: { message: string; details?: string } | null;
} = { data: null, error: null };

const fakeSupabase = {
  rpc: async (fn: string, args: Record<string, unknown>) => {
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
  activityDocTypes,
  activityPageCount,
  activityRowView,
  normalizeActivityResult,
  PARTY_ACTIVITY_PAGE_SIZE,
  parsePartyActivityParams,
  partyActivityFilters,
  partyActivityHref,
  type PartyActivityRow,
} from "@/lib/erp/party-activity";
import { listPartyActivity } from "@/lib/erp/queries/party-activity";

beforeEach(() => {
  moduleGranted = true;
  rpcCalls = [];
  rpcResponse = { data: { total: 0, rows: [] }, error: null };
});

const row = (over: Partial<PartyActivityRow>): PartyActivityRow => ({
  kind: "document",
  id: "11111111-1111-1111-1111-111111111111",
  doc_type: "S",
  doc_no: "S11509001",
  date: "2026-09-05",
  status: "posted",
  amount_twd: 5000,
  outstanding: 3000,
  unallocated: null,
  created_at: "2026-09-05T01:00:00+00:00",
  ...over,
});

describe("parsePartyActivityParams", () => {
  it("預設：第 1 頁、全部、不含作廢", () => {
    expect(parsePartyActivityParams({}, "customer")).toEqual({
      page: 1,
      filter: "all",
      includeVoided: false,
    });
  });

  it("讀 docs_page／docs_type／docs_voided，不受其他參數影響", () => {
    expect(
      parsePartyActivityParams(
        {
          docs_page: "3",
          docs_type: "SR",
          docs_voided: "1",
          page: "9",
          type: "Q",
        },
        "customer",
      ),
    ).toEqual({ page: 3, filter: "SR", includeVoided: true });
    expect(
      parsePartyActivityParams({ docs_type: "pay" }, "vendor").filter,
    ).toBe("pay");
  });

  it("陣列值取第一個", () => {
    expect(
      parsePartyActivityParams({ docs_page: ["2", "5"] }, "vendor").page,
    ).toBe(2);
  });

  it("無效頁碼回第 1 頁", () => {
    for (const p of ["0", "-1", "abc", "1.5", "2x", "", "99999999999"]) {
      expect(parsePartyActivityParams({ docs_page: p }, "customer").page).toBe(
        1,
      );
    }
  });

  it("不屬於該對象的單別視為全部", () => {
    expect(
      parsePartyActivityParams({ docs_type: "P" }, "customer").filter,
    ).toBe("all");
    expect(parsePartyActivityParams({ docs_type: "S" }, "vendor").filter).toBe(
      "all",
    );
    expect(
      parsePartyActivityParams({ docs_type: "RC" }, "customer").filter,
    ).toBe("all");
  });

  it("docs_voided 只有 1 才顯示作廢", () => {
    expect(
      parsePartyActivityParams({ docs_voided: "true" }, "customer")
        .includeVoided,
    ).toBe(false);
  });
});

describe("篩選選項與 RPC 單別", () => {
  it("客戶：全部、報價、銷貨、銷退、收付款", () => {
    expect(partyActivityFilters("customer").map((f) => f.value)).toEqual([
      "all",
      "Q",
      "S",
      "SR",
      "pay",
    ]);
    expect(partyActivityFilters("customer").map((f) => f.label)).toEqual([
      "全部",
      "報價單",
      "銷貨單",
      "銷退單",
      "收款／退款",
    ]);
  });

  it("廠商：全部、採購、進貨、進退、收付款", () => {
    expect(partyActivityFilters("vendor").map((f) => f.value)).toEqual([
      "all",
      "P",
      "I",
      "PR",
      "pay",
    ]);
    expect(partyActivityFilters("vendor").at(-1)?.label).toBe("付款／退款");
  });

  it("activityDocTypes", () => {
    expect(activityDocTypes("customer", "all")).toBeNull();
    expect(activityDocTypes("customer", "pay")).toEqual(["RC", "RF"]);
    expect(activityDocTypes("vendor", "pay")).toEqual(["PM", "VR"]);
    expect(activityDocTypes("vendor", "PR")).toEqual(["PR"]);
  });
});

describe("分頁", () => {
  it("每頁 20 筆", () => {
    expect(PARTY_ACTIVITY_PAGE_SIZE).toBe(20);
  });

  it("總頁數至少 1", () => {
    expect(activityPageCount(0)).toBe(1);
    expect(activityPageCount(1)).toBe(1);
    expect(activityPageCount(20)).toBe(1);
    expect(activityPageCount(21)).toBe(2);
    expect(activityPageCount(40)).toBe(2);
    expect(activityPageCount(41)).toBe(3);
  });
});

describe("partyActivityHref", () => {
  const base = "/admin/erp/customers/c1";

  it("保留頁面其他參數、換頁碼並帶錨點", () => {
    expect(
      partyActivityHref(base, { tab: "x", docs_type: "S" }, { page: 2 }),
    ).toBe(`${base}?tab=x&docs_type=S&docs_page=2#party-activity`);
  });

  it("第 1 頁、全部、不含作廢時不帶參數", () => {
    expect(
      partyActivityHref(
        base,
        { docs_page: "3", docs_type: "S", docs_voided: "1" },
        { page: 1, filter: "all", includeVoided: false },
      ),
    ).toBe(`${base}#party-activity`);
  });

  it("切換篩選或作廢會回到第 1 頁", () => {
    expect(partyActivityHref(base, { docs_page: "3" }, { filter: "pay" })).toBe(
      `${base}?docs_type=pay#party-activity`,
    );
    expect(
      partyActivityHref(
        base,
        { docs_page: "3", docs_type: "Q" },
        { includeVoided: true },
      ),
    ).toBe(`${base}?docs_type=Q&docs_voided=1#party-activity`);
  });

  it("陣列參數保留全部值", () => {
    expect(partyActivityHref(base, { k: ["a", "b"] }, { page: 2 })).toBe(
      `${base}?k=a&k=b&docs_page=2#party-activity`,
    );
  });
});

describe("activityRowView", () => {
  it("已過帳銷貨：民國日期、單別、單號、狀態、金額、未沖餘額、連結", () => {
    expect(activityRowView(row({}))).toEqual({
      key: "document:11111111-1111-1111-1111-111111111111",
      dateText: "民國115/09/05",
      typeLabel: "銷貨單",
      docNoText: "S11509001",
      statusText: "已過帳",
      tag: null,
      amount: 5000,
      open: 3000,
      voided: false,
      href: "/admin/erp/sales/11111111-1111-1111-1111-111111111111",
    });
  });

  it("報價已過帳顯示「已確認」、無未沖餘額", () => {
    const v = activityRowView(
      row({ doc_type: "Q", doc_no: "Q11509001", outstanding: null }),
    );
    expect(v.statusText).toBe("已確認");
    expect(v.typeLabel).toBe("報價單");
    expect(v.open).toBeNull();
    expect(v.href).toBe(
      "/admin/erp/quotes/11111111-1111-1111-1111-111111111111",
    );
  });

  it("草稿單號顯示「草稿」", () => {
    const v = activityRowView(
      row({ status: "draft", doc_no: null, outstanding: null }),
    );
    expect(v.docNoText).toBe("草稿");
    expect(v.statusText).toBe("草稿");
  });

  it("作廢單據", () => {
    const v = activityRowView(
      row({ doc_type: "SR", status: "voided", outstanding: null }),
    );
    expect(v.statusText).toBe("已作廢");
    expect(v.voided).toBe(true);
    expect(v.href).toBe(
      "/admin/erp/sales-returns/11111111-1111-1111-1111-111111111111",
    );
  });

  it("採購區各單別連結", () => {
    expect(activityRowView(row({ doc_type: "P", id: "p1" })).href).toBe(
      "/admin/erp/purchases/p1",
    );
    expect(activityRowView(row({ doc_type: "I", id: "i1" })).href).toBe(
      "/admin/erp/receipts/i1",
    );
    expect(activityRowView(row({ doc_type: "PR", id: "r1" })).href).toBe(
      "/admin/erp/purchase-returns/r1",
    );
    expect(activityRowView(row({ doc_type: "PR" })).typeLabel).toBe("進退單");
  });

  it("收款：未沖銷（預收）、連到收款詳情", () => {
    const v = activityRowView(
      row({
        kind: "payment",
        id: "rc1",
        doc_type: "RC",
        doc_no: "RC11509001",
        amount_twd: 3000,
        outstanding: null,
        unallocated: 500,
      }),
    );
    expect(v).toMatchObject({
      typeLabel: "收款",
      docNoText: "RC11509001",
      statusText: "已過帳",
      tag: null,
      amount: 3000,
      open: 500,
      href: "/admin/erp/collections/rc1",
    });
  });

  it("0 元收款 = 沖抵", () => {
    const v = activityRowView(
      row({
        kind: "payment",
        doc_type: "RC",
        amount_twd: 0,
        outstanding: null,
        unallocated: 1000,
      }),
    );
    expect(v.tag).toBe("沖抵");
    expect(v.open).toBe(1000);
  });

  it("客戶退款：負數金額、退款標示、無未沖銷", () => {
    const v = activityRowView(
      row({
        kind: "payment",
        id: "rf1",
        doc_type: "RF",
        doc_no: "RF11509001",
        amount_twd: 500,
        outstanding: null,
        // 退款單本身沒有未沖銷；即使資料帶 0 也顯示「—」
        unallocated: 0,
      }),
    );
    expect(v).toMatchObject({
      typeLabel: "客戶退款",
      tag: "退款",
      amount: -500,
      open: null,
      href: "/admin/erp/collections/rf1",
    });
  });

  it("付款與廠商退款連到付款詳情；作廢付款", () => {
    const pm = activityRowView(
      row({
        kind: "payment",
        id: "pm1",
        doc_type: "PM",
        status: "voided",
        outstanding: null,
        unallocated: 100,
      }),
    );
    expect(pm).toMatchObject({
      typeLabel: "付款",
      statusText: "已作廢",
      voided: true,
      open: null,
      href: "/admin/erp/disbursements/pm1",
    });
    const vr = activityRowView(
      row({ kind: "payment", id: "vr1", doc_type: "VR", amount_twd: 50 }),
    );
    expect(vr).toMatchObject({
      typeLabel: "廠商退款",
      tag: "退款",
      amount: -50,
      href: "/admin/erp/disbursements/vr1",
    });
    const offset = activityRowView(
      row({ kind: "payment", doc_type: "PM", amount_twd: 0 }),
    );
    expect(offset.tag).toBe("沖抵");
  });
});

describe("normalizeActivityResult", () => {
  it("numeric 字串轉數字、null 保留", () => {
    expect(
      normalizeActivityResult({
        total: "2",
        rows: [
          {
            ...row({}),
            amount_twd: "5000.00",
            outstanding: "3000.00",
            unallocated: null,
          },
        ],
      }),
    ).toEqual({
      total: 2,
      rows: [row({ amount_twd: 5000, outstanding: 3000, unallocated: null })],
    });
  });

  it("單據未沖餘額 null（報價、草稿）保留 null，不變成 0", () => {
    const res = normalizeActivityResult({
      total: 1,
      rows: [{ ...row({}), outstanding: null, unallocated: undefined }],
    });
    expect(res.rows[0].outstanding).toBeNull();
    expect(res.rows[0].unallocated).toBeNull();
  });

  it("空值回 0 筆", () => {
    expect(normalizeActivityResult(null)).toEqual({ total: 0, rows: [] });
    expect(normalizeActivityResult({ total: 3 })).toEqual({
      total: 3,
      rows: [],
    });
  });
});

describe("listPartyActivity", () => {
  it("組 RPC 參數：offset 依頁碼、篩選單別、作廢", async () => {
    rpcResponse = {
      data: { total: 45, rows: [row({ amount_twd: "5000" as never })] },
      error: null,
    };
    const res = await listPartyActivity("customer", "c1", {
      page: 3,
      filter: "pay",
      includeVoided: true,
    });
    expect(rpcCalls).toEqual([
      {
        fn: "erp_party_activity",
        args: {
          p_party_type: "customer",
          p_party_id: "c1",
          p_doc_types: ["RC", "RF"],
          p_include_voided: true,
          p_limit: 20,
          p_offset: 40,
        },
      },
    ]);
    expect(res).toEqual({
      ok: true,
      data: { total: 45, rows: [row({ amount_twd: 5000 })] },
    });
  });

  it("全部 → p_doc_types null", async () => {
    await listPartyActivity("vendor", "v1", {
      page: 1,
      filter: "all",
      includeVoided: false,
    });
    expect(rpcCalls[0].args).toMatchObject({
      p_party_type: "vendor",
      p_doc_types: null,
      p_include_voided: false,
      p_offset: 0,
    });
  });

  it("無 erp 權限不呼叫 RPC", async () => {
    moduleGranted = false;
    const res = await listPartyActivity("customer", "c1", {
      page: 1,
      filter: "all",
      includeVoided: false,
    });
    expect(res).toEqual({ ok: false, error: "沒有 ERP 權限" });
    expect(rpcCalls).toEqual([]);
  });

  it("RPC 錯誤轉中文訊息", async () => {
    rpcResponse = {
      data: null,
      error: { message: "validation", details: "單別篩選不屬於此對象：P" },
    };
    const res = await listPartyActivity("customer", "c1", {
      page: 1,
      filter: "all",
      includeVoided: false,
    });
    expect(res.ok).toBe(false);
  });
});
