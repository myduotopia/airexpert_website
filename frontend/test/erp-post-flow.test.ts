import { describe, expect, it } from "vitest";

// #240（#238 B-07、B-08）：
// - B-08a：前端檢核一次列出所有錯誤（collect* 版本）；validate* 仍回第一條（server 沿用）。
// - B-07a：收付款過帳確認框的內容（對象、金額、方式、票號／到期日、沖銷筆數與金額、預收餘額）。
import {
  collectAllocationErrors,
  collectPaymentFormErrors,
  collectPaymentSubmitErrors,
  validateAllocations,
  validatePaymentForm,
  type AllocationRow,
  type OutstandingDoc,
  type PaymentFormInput,
} from "@/app/admin/(protected)/erp/collections/_components/allocation";
import {
  paymentConfirmSummary,
  wanHint,
} from "@/app/admin/(protected)/erp/collections/_components/payment-confirm";
import {
  lineMissingItem,
  newDraftDocument,
  newDraftLine,
} from "@/lib/erp/draft";
import {
  collectDraftDocumentErrors,
  collectPostErrors,
  excludeLiveHints,
  mergeErrors,
  validateDraftDocument,
} from "@/lib/erp/validate";
import type { DraftDocument, ItemOption } from "@/lib/erp/types";

const item = (
  id: string,
  code: string,
  track_serial = false,
): Pick<ItemOption, "id" | "code" | "track_serial"> => ({
  id,
  code,
  track_serial,
});
const ITEMS = [item("m1", "AM3-08A30", true), item("p1", "TOK-0304-S")];

function sale(patch: Partial<DraftDocument> = {}): DraftDocument {
  return {
    ...newDraftDocument("S", "2026-10-13"),
    customer_id: "c1",
    warehouse_id: "w1",
    lines: [newDraftLine("item", { item_id: "p1", unit_price: 100 })],
    ...patch,
  };
}

describe("collectDraftDocumentErrors（存草稿檢核一次列出）", () => {
  it("合法草稿回空陣列", () => {
    expect(collectDraftDocumentErrors(sale())).toEqual([]);
  });

  it("表頭與各行的錯誤全部列出，順序同畫面（表頭 → 第 1 行 → 第 2 行）", () => {
    const doc = sale({
      customer_id: null,
      doc_date: "",
      exchange_rate: 0,
      lines: [
        newDraftLine("item"),
        newDraftLine("item", { item_id: "p1", qty: Number.NaN }),
        newDraftLine("subtotal"),
      ],
    });
    expect(collectDraftDocumentErrors(doc)).toEqual([
      "請填寫單據日期。",
      "請選擇客戶。",
      "匯率需大於 0。",
      "第 1 行請選擇品項或填寫品名規格。",
      "第 2 行數量不正確。",
      "第 3 行「小計」只能用於報價單。",
    ]);
  });

  it("validateDraftDocument 仍回第一條（server 存草稿沿用）", () => {
    const doc = sale({ customer_id: null, lines: [newDraftLine("item")] });
    expect(validateDraftDocument(doc)).toBe("請選擇客戶。");
    expect(validateDraftDocument(sale())).toBeNull();
  });

  it("調撥單兩倉皆未選只列一次（不再加報「不可相同」）", () => {
    const t = { ...newDraftDocument("T", "2026-10-13"), lines: [] };
    expect(collectDraftDocumentErrors(t)).toEqual([
      "調撥單需選擇來源倉與目的倉。",
    ]);
  });

  it("同一行數個問題都列出；重複訊息只列一次", () => {
    const doc = sale({
      lines: [
        newDraftLine("item", {
          item_id: "p1",
          qty: Number.NaN,
          unit_price: Number.NaN,
          serial_ids: ["s1", "s1"],
        }),
      ],
    });
    expect(collectDraftDocumentErrors(doc)).toEqual([
      "第 1 行數量不正確。",
      "第 1 行單價不正確。",
      "第 1 行機號重複選取。",
    ]);
  });
});

describe("collectPostErrors（過帳前的前端檢核，對齊 erp_post_document）", () => {
  it("#238 B-08 情境：機號數不符與未選品項等問題一次列出", () => {
    const doc = sale({
      warehouse_id: null,
      lines: [
        newDraftLine("item", { item_id: "m1", qty: 1 }),
        newDraftLine("item", { description: "AB-37 空壓機" }),
        newDraftLine("item", { item_id: "p1", qty: 0 }),
        newDraftLine("note", { description: "備註不檢查" }),
      ],
    });
    expect(collectPostErrors(doc, ITEMS)).toEqual([
      "請選擇出庫倉。",
      "第 1 行（AM3-08A30）選取機號數 0 與數量 1 不符。",
      "第 2 行尚未選擇品項，過帳前需選定。",
      "第 3 行（TOK-0304-S）數量不可為 0。",
    ]);
  });

  it("可過帳的單回空陣列；機號數相符即通過", () => {
    const doc = sale({
      lines: [
        newDraftLine("item", { item_id: "m1", qty: 2, serial_ids: ["a", "b"] }),
        newDraftLine("discount", { amount: -100 }),
      ],
    });
    expect(collectPostErrors(doc, ITEMS)).toEqual([]);
  });

  it("至少一個品項行；數量需為正數；追蹤機號數量需為整數", () => {
    expect(
      collectPostErrors(
        sale({ lines: [newDraftLine("note", { description: "x" })] }),
        ITEMS,
      ),
    ).toEqual(["單據至少需要一個品項行。"]);
    expect(
      collectPostErrors(
        sale({
          lines: [
            newDraftLine("item", { item_id: "p1", qty: -1 }),
            newDraftLine("item", { item_id: "m1", qty: 1.5 }),
          ],
        }),
        ITEMS,
      ),
    ).toEqual([
      "第 1 行（TOK-0304-S）數量需為正數。",
      "第 2 行（AM3-08A30）追蹤機號的品項數量需為整數。",
    ]);
  });

  it("進貨單以新機號（serial_nos）計數，空白或重複另列", () => {
    const receipt: DraftDocument = {
      ...newDraftDocument("I", "2026-10-13"),
      vendor_id: "v1",
      warehouse_id: "w1",
      lines: [
        newDraftLine("item", { item_id: "m1", qty: 2, serial_nos: ["A1"] }),
        newDraftLine("item", {
          item_id: "m1",
          qty: 2,
          serial_nos: ["B1", "b1"],
        }),
      ],
    };
    expect(collectPostErrors(receipt, ITEMS)).toEqual([
      "第 1 行（AM3-08A30）機號數 1 與數量 2 不符。",
      "第 2 行（AM3-08A30）機號有空白或重複。",
    ]);
  });

  it("報價單：免倉庫、可不選品項（自由輸入），不檢查機號", () => {
    const quote: DraftDocument = {
      ...newDraftDocument("Q", "2026-10-13"),
      customer_id: "c1",
      lines: [
        newDraftLine("item", { item_text: "LS-20" }),
        newDraftLine("item", { item_id: "m1", qty: 1 }),
      ],
    };
    expect(collectPostErrors(quote, ITEMS)).toEqual([]);
  });

  it("全空的品項行沿用存草稿的訊息（與 collectDraftDocumentErrors 合併後只列一次）", () => {
    const doc = sale({ lines: [newDraftLine("item")] });
    expect(collectPostErrors(doc, ITEMS)).toEqual([
      "第 1 行請選擇品項或填寫品名規格。",
    ]);
    expect(
      mergeErrors(
        collectDraftDocumentErrors(doc),
        collectPostErrors(doc, ITEMS),
      ),
    ).toEqual(["第 1 行請選擇品項或填寫品名規格。"]);
  });

  it("找不到品項設定（例如本頁就地新增）時不檢查機號，交給 server", () => {
    const doc = sale({
      lines: [newDraftLine("item", { item_id: "new-item", qty: 1 })],
    });
    expect(collectPostErrors(doc, ITEMS)).toEqual([]);
  });

  it("銷退單未選倉庫 → 請選擇入庫倉", () => {
    const doc: DraftDocument = {
      ...sale(),
      doc_type: "SR",
      warehouse_id: null,
    };
    expect(collectPostErrors(doc, ITEMS)).toEqual(["請選擇入庫倉。"]);
  });
});

describe("mergeErrors", () => {
  it("略過 null／空字串、保留順序並去重", () => {
    expect(mergeErrors(["a", "b"], null, "b", undefined, "", ["c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("lineMissingItem 接受明細頁的資料列（description／item_text 可為 null）", () => {
  it("DB 列也能判斷", () => {
    expect(
      lineMissingItem({
        line_type: "item",
        item_id: null,
        description: "AB-37",
        item_text: null,
      }),
    ).toBe(true);
    expect(
      lineMissingItem({
        line_type: "item",
        item_id: null,
        description: null,
        item_text: null,
      }),
    ).toBe(false);
  });
});

// ── 收付款 ───────────────────────────────────────────────────

const od = (
  document_id: string,
  outstanding: number,
  doc_type = "S",
): OutstandingDoc => ({
  document_id,
  doc_type,
  doc_no: `${doc_type}1150900${document_id}`,
  doc_date: "2026-09-11",
  total_twd: outstanding,
  allocated: 0,
  outstanding,
});

function payForm(patch: Partial<PaymentFormInput> = {}): PaymentFormInput {
  return {
    direction: "in",
    pay_date: "2026-10-13",
    party_id: "cust-1",
    method: "transfer",
    amount: 75000,
    allocations: [],
    ...patch,
  };
}

describe("collectPaymentFormErrors / collectAllocationErrors", () => {
  it("表頭錯誤全部列出；validatePaymentForm 仍回第一條", () => {
    const bad = payForm({
      party_id: null,
      amount: -5,
      method: "check",
    });
    expect(collectPaymentFormErrors(bad)).toEqual([
      "請選擇客戶。",
      "金額不可為負數。",
      "支票需填寫票號。",
      "支票需填寫到期日（票期）。",
      "支票需填寫銀行。",
    ]);
    expect(validatePaymentForm(bad)).toBe("請選擇客戶。");
    expect(collectPaymentFormErrors(payForm())).toEqual([]);
  });

  it("沖銷列錯誤逐列列出；validateAllocations 仍回第一條", () => {
    const docs = [od("1", 1000), od("2", 2000), od("3", -300, "SR")];
    const rows: AllocationRow[] = [
      { document_id: "1", selected: true, amount: 0 },
      { document_id: "2", selected: true, amount: 2500 },
      { document_id: "3", selected: true, amount: 300 },
    ];
    expect(collectAllocationErrors(1000, rows, docs)).toEqual([
      "單據 S11509001 的沖銷金額不可為 0。",
      "單據 S11509002 沖銷金額需介於 0 與未沖餘額 2000 之間。",
      "退貨單 SR11509003 沖銷金額需介於 -300 與 0 之間。",
      "沖銷合計 2800 超過可沖銷金額 1000。",
    ]);
    expect(validateAllocations(1000, rows, docs)).toBe(
      "單據 S11509001 的沖銷金額不可為 0。",
    );
  });

  it("新增收款送出：表頭 + 沖銷一次列出，不重複報沖銷合計", () => {
    const docs = [od("1", 100000)];
    const rows: AllocationRow[] = [
      { document_id: "1", selected: true, amount: 80000 },
    ];
    const input = payForm({
      method: "check",
      amount: 75000,
      allocations: [{ document_id: "1", amount: 80000 }],
    });
    expect(collectPaymentSubmitErrors(input, rows, docs)).toEqual([
      "支票需填寫票號。",
      "支票需填寫到期日（票期）。",
      "支票需填寫銀行。",
      "沖銷合計 80000 超過可沖銷金額 75000。",
    ]);
  });
});

describe("paymentConfirmSummary（過帳收付款確認框內容）", () => {
  const docs = [od("1", 50000), od("2", 30000), od("3", -3000, "SR")];

  it("收款：對象、金額、方式、沖銷筆數與金額、預收餘額；確認鈕為「過帳收款」", () => {
    const s = paymentConfirmSummary({
      direction: "in",
      partyLabel: "KE108 測試客戶",
      payDate: "2026-10-13",
      amount: 750000,
      method: "transfer",
      checkNo: "",
      checkDueDate: "",
      bank: "台銀",
      rows: [
        { document_id: "1", selected: true, amount: 50000 },
        { document_id: "2", selected: false, amount: 30000 },
        { document_id: "3", selected: true, amount: -3000 },
      ],
      docs,
    });
    expect(s.title).toBe("確定過帳此收款？");
    expect(s.confirmLabel).toBe("過帳收款");
    expect(s.amountLabel).toBe("收款金額（TWD）");
    expect(s.amountText).toBe("750,000");
    expect(s.amountHint).toBe("75 萬");
    expect(s.details).toEqual([
      { label: "客戶", value: "KE108 測試客戶" },
      { label: "收款日期", value: "民國115/10/13" },
      { label: "方式", value: "匯款" },
      { label: "銀行", value: "台銀" },
    ]);
    expect(s.allocationCount).toBe(2);
    expect(s.allocationTotalText).toBe("47,000");
    expect(s.allocations).toEqual([
      { docNo: "S11509001", amountText: "50,000" },
      { docNo: "SR11509003", amountText: "-3,000" },
    ]);
    expect(s.remainingLabel).toBe("預收");
    expect(s.remainingText).toBe("703,000");
  });

  it("付款支票：顯示票號與到期日；無沖銷時全額為預付", () => {
    const s = paymentConfirmSummary({
      direction: "out",
      partyLabel: "KA405 測試廠商",
      payDate: "2026-10-13",
      amount: 12000,
      method: "check",
      checkNo: " CK001 ",
      checkDueDate: "2026-11-30",
      bank: "",
      rows: [],
      docs: [],
    });
    expect(s.title).toBe("確定過帳此付款？");
    expect(s.confirmLabel).toBe("過帳付款");
    expect(s.details).toEqual([
      { label: "廠商", value: "KA405 測試廠商" },
      { label: "付款日期", value: "民國115/10/13" },
      { label: "方式", value: "支票" },
      { label: "票號", value: "CK001" },
      { label: "到期日", value: "民國115/11/30" },
    ]);
    expect(s.allocationCount).toBe(0);
    expect(s.allocationTotalText).toBe("0");
    expect(s.remainingLabel).toBe("預付");
    expect(s.remainingText).toBe("12,000");
  });

  it("沒有對象名稱時顯示「—」", () => {
    const s = paymentConfirmSummary({
      direction: "in",
      partyLabel: null,
      payDate: "2026-10-13",
      amount: 1,
      method: "cash",
      checkNo: "",
      checkDueDate: "",
      bank: "",
      rows: [],
      docs: [],
    });
    expect(s.details[0]).toEqual({ label: "客戶", value: "—" });
  });
});

describe("wanHint（以「萬」複述金額，N-1 多打一個 0 時一眼看出）", () => {
  it("一萬以上換算為萬，非整除加「約」；未滿一萬不顯示", () => {
    expect(wanHint(75000)).toBe("7.5 萬");
    expect(wanHint(750000)).toBe("75 萬");
    expect(wanHint(1234567)).toBe("約 123.46 萬");
    expect(wanHint(9999)).toBeNull();
    expect(wanHint(0)).toBeNull();
  });
});

// #248 N-5：銷退超額時，同一句錯誤同時出現在黃底即時提示與紅底儲存錯誤。
// 紅底清單排除已由即時提示顯示的訊息（相同字串），其餘錯誤照常列出。
describe("excludeLiveHints", () => {
  const over =
    "銷退金額（含稅）12,000 超過原銷貨單可退金額 10,500（原單 10,500、已退 0）；請調低退貨單價或數量。";

  it("儲存錯誤與即時提示相同 → 紅底不再列出", () => {
    expect(excludeLiveHints([over], over)).toEqual([]);
  });

  it("即時提示存在時，只列其他錯誤（保留順序）", () => {
    expect(
      excludeLiveHints(["請選擇入庫倉。", over, "第 1 行數量需大於 0。"], over),
    ).toEqual(["請選擇入庫倉。", "第 1 行數量需大於 0。"]);
  });

  it("沒有即時提示（null／空字串）→ 原樣回傳", () => {
    expect(excludeLiveHints([over], null)).toEqual([over]);
    expect(excludeLiveHints([over], undefined, "")).toEqual([over]);
  });

  it("即時提示內容不同（例如金額已改）→ 只排除完全相同的字串，不誤刪", () => {
    const amountChanged = over.replace("12,000", "11,000");
    const returnedChanged = over.replace("已退 0", "已退 500");
    expect(excludeLiveHints([amountChanged, returnedChanged], over)).toEqual([
      amountChanged,
      returnedChanged,
    ]);
  });

  it("搭配 mergeErrors：存檔檢核結果排除即時提示後為空 → 不顯示紅底", () => {
    const problems = mergeErrors([], [], over);
    expect(problems).toEqual([over]);
    expect(excludeLiveHints(problems, over)).toEqual([]);
  });
});
