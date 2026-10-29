import { describe, it, expect } from "vitest";
import {
  normalizeDeliveryInput,
  normalizeMachineIssueInput,
  normalizeProgressInput,
  normalizeRepairInput,
} from "@/lib/erp/tracking/normalize";
import {
  autoDeposit,
  depositBasisLabel,
  resolveDeposit,
} from "@/lib/erp/tracking/deposit";
import { autofill, autofillEmployee } from "@/lib/erp/tracking/autofill";
import {
  formatDeliveryWindow,
  formatTrackingDate,
  latestProgressText,
} from "@/lib/erp/tracking/display";
import {
  pageSlice,
  parseTrackingFilters as parseFilters,
  trackingParams,
  trackingQuery,
  trackingQuerySpec,
} from "@/lib/erp/tracking/filters";
import {
  deliveryCsvTable,
  machineIssuesCsvTable,
  repairsCsvTable,
  trackingCsvFile,
} from "@/lib/erp/tracking/csv";
import type { MeetingSearchParams } from "@/lib/erp/meeting/params";
import type {
  DeliveryJobInput,
  DeliveryJobRow,
  MachineIssueInput,
  MachineIssueRow,
  RepairJobInput,
  RepairJobRow,
} from "@/lib/erp/tracking/types";

// 週報追蹤資料（#272）的純邏輯：表單 normalize、訂金自動判斷、交機時間顯示、篩選參數、清單排序、CSV 列。
// 測試資料全為虛構。

const C1 = "11111111-1111-4111-8111-111111111111";
const E1 = "22222222-2222-4222-8222-222222222222";
const E2 = "33333333-3333-4333-8333-333333333333";
const D1 = "44444444-4444-4444-8444-444444444444";
/** 測試基準日：2026-10-29（星期四）。 */
const TODAY = "2026-10-29";
const parseTrackingFilters = (
  kind: "delivery" | "repairs" | "machine-issues",
  sp: MeetingSearchParams,
) => parseFilters(kind, sp, TODAY);
const ALL_RANGE = { preset: "all", from: "", to: "", error: null } as const;

function deliveryInput(
  patch: Partial<DeliveryJobInput> = {},
): DeliveryJobInput {
  return {
    customer_id: C1,
    document_id: null,
    deposit_override: null,
    sales_rep_id: null,
    delivery_owner_id: null,
    materials_confirmed: false,
    equipment: "",
    delivery_start: "",
    delivery_end: "",
    note: "",
    status: "in_progress",
    ...patch,
  };
}

describe("normalizeDeliveryInput", () => {
  it("去頭尾空白、空字串轉 null", () => {
    const r = normalizeDeliveryInput(
      deliveryInput({ equipment: "  測試機 A  ", note: "   " }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.equipment).toBe("測試機 A");
    expect(r.row.note).toBeNull();
    expect(r.row.delivery_start).toBeNull();
    expect(r.row.delivery_end).toBeNull();
  });

  it("客戶必填", () => {
    const r = normalizeDeliveryInput(deliveryInput({ customer_id: null }));
    expect(r).toMatchObject({ ok: false, field: "customer_id" });
  });

  it("只填起或迄 → 視為單日", () => {
    const a = normalizeDeliveryInput(
      deliveryInput({ delivery_start: "2026-11-03" }),
    );
    expect(a.ok && [a.row.delivery_start, a.row.delivery_end]).toEqual([
      "2026-11-03",
      "2026-11-03",
    ]);
    const b = normalizeDeliveryInput(
      deliveryInput({ delivery_end: "2026-11-05" }),
    );
    expect(b.ok && [b.row.delivery_start, b.row.delivery_end]).toEqual([
      "2026-11-05",
      "2026-11-05",
    ]);
  });

  it("迄早於起 → 錯誤；不合法日期 → 錯誤", () => {
    expect(
      normalizeDeliveryInput(
        deliveryInput({
          delivery_start: "2026-11-05",
          delivery_end: "2026-11-03",
        }),
      ),
    ).toMatchObject({ ok: false, field: "delivery_end" });
    expect(
      normalizeDeliveryInput(deliveryInput({ delivery_start: "2026-02-30" })),
    ).toMatchObject({ ok: false, field: "delivery_start" });
  });

  it("文字長度上限、狀態與訂金覆寫值檢查", () => {
    expect(
      normalizeDeliveryInput(deliveryInput({ equipment: "x".repeat(501) })),
    ).toMatchObject({ ok: false, field: "equipment" });
    expect(
      normalizeDeliveryInput(
        deliveryInput({ status: "done" as DeliveryJobInput["status"] }),
      ),
    ).toMatchObject({ ok: false, field: "status" });
    expect(
      normalizeDeliveryInput(
        deliveryInput({
          deposit_override: "auto" as DeliveryJobInput["deposit_override"],
        }),
      ),
    ).toMatchObject({ ok: false, field: "deposit_override" });
  });

  it("保留連結單據、人員與材料確認", () => {
    const r = normalizeDeliveryInput(
      deliveryInput({
        document_id: D1,
        sales_rep_id: E1,
        delivery_owner_id: E2,
        materials_confirmed: true,
        deposit_override: "received",
      }),
    );
    expect(r.ok && r.row).toMatchObject({
      document_id: D1,
      sales_rep_id: E1,
      delivery_owner_id: E2,
      materials_confirmed: true,
      deposit_override: "received",
    });
  });
});

function repairInput(patch: Partial<RepairJobInput> = {}): RepairJobInput {
  return {
    customer_id: C1,
    received_on: "2026-10-20",
    model: "",
    description: "異音",
    owner_id: null,
    status: "pending",
    ...patch,
  };
}

describe("normalizeRepairInput", () => {
  it("必填：客戶、進廠日期、問題描述", () => {
    expect(
      normalizeRepairInput(repairInput({ customer_id: null })),
    ).toMatchObject({ ok: false, field: "customer_id" });
    expect(
      normalizeRepairInput(repairInput({ received_on: "" })),
    ).toMatchObject({ ok: false, field: "received_on" });
    expect(
      normalizeRepairInput(repairInput({ description: "  " })),
    ).toMatchObject({ ok: false, field: "description" });
  });

  it("機型空白轉 null、描述去空白", () => {
    const r = normalizeRepairInput(
      repairInput({ model: " ", description: " 漏油 " }),
    );
    expect(r.ok && r.row).toMatchObject({ model: null, description: "漏油" });
  });

  it("狀態須為允許值", () => {
    expect(
      normalizeRepairInput(
        repairInput({ status: "closed" as RepairJobInput["status"] }),
      ),
    ).toMatchObject({ ok: false, field: "status" });
  });
});

function issueInput(patch: Partial<MachineIssueInput> = {}): MachineIssueInput {
  return {
    customer_id: C1,
    machine_id: null,
    model: "TEST-M100",
    delivered_on: "",
    description: "高溫跳機",
    occurred_on: "2026-10-15",
    owner_id: null,
    status: "handling",
    is_key: false,
    ...patch,
  };
}

describe("normalizeMachineIssueInput", () => {
  it("必填：客戶、發生日期、問題描述；交機日期選填但須合法", () => {
    expect(
      normalizeMachineIssueInput(issueInput({ occurred_on: "" })),
    ).toMatchObject({ ok: false, field: "occurred_on" });
    expect(
      normalizeMachineIssueInput(issueInput({ description: "" })),
    ).toMatchObject({ ok: false, field: "description" });
    expect(
      normalizeMachineIssueInput(issueInput({ delivered_on: "2026-13-01" })),
    ).toMatchObject({ ok: false, field: "delivered_on" });
    const ok = normalizeMachineIssueInput(issueInput({ is_key: true }));
    expect(ok.ok && ok.row).toMatchObject({
      delivered_on: null,
      is_key: true,
      model: "TEST-M100",
    });
  });
});

describe("normalizeProgressInput", () => {
  it("日期與內容必填", () => {
    expect(
      normalizeProgressInput({ progress_date: "", content: "x" }),
    ).toMatchObject({ ok: false, field: "progress_date" });
    expect(
      normalizeProgressInput({ progress_date: "2026-10-29", content: " " }),
    ).toMatchObject({ ok: false, field: "content" });
    expect(
      normalizeProgressInput({
        progress_date: "2026-10-29",
        content: " 已聯絡原廠 ",
      }),
    ).toEqual({
      ok: true,
      row: { progress_date: "2026-10-29", content: "已聯絡原廠" },
    });
  });
});

describe("訂金自動判斷", () => {
  it("未連結單據：無自動判斷，預設未收，可手動設已收", () => {
    const facts = {
      hasDocument: false,
      linkedAllocated: 0,
      customerPrepaid: 900,
    };
    expect(autoDeposit(facts)).toBeNull();
    expect(resolveDeposit(null, facts)).toMatchObject({
      status: "not_received",
      source: "default",
      auto: null,
    });
    expect(resolveDeposit("received", facts)).toMatchObject({
      status: "received",
      source: "manual",
    });
  });

  it("連結單據：相關銷貨單有沖銷 → 已收", () => {
    const r = resolveDeposit(null, {
      hasDocument: true,
      linkedAllocated: 3000,
      customerPrepaid: 0,
    });
    expect(r).toMatchObject({
      status: "received",
      source: "auto",
      auto: "received",
    });
    expect(r.reason).toContain("3,000");
  });

  it("連結單據：無沖銷但客戶有預收 → 已收", () => {
    const r = resolveDeposit(null, {
      hasDocument: true,
      linkedAllocated: 0,
      customerPrepaid: 500,
    });
    expect(r.status).toBe("received");
    expect(r).toMatchObject({ source: "auto", basis: "prepaid" });
    expect(r.reason).toContain("依客戶預收判斷");
    // 清單／列印／CSV 明確標示依據（客戶層級預收，未必是此筆訂金）
    expect(depositBasisLabel(r)).toBe("依客戶預收");
  });

  it("訂金依據標示：手動 →「手動」；依沖銷或未收不另標示", () => {
    const facts = {
      hasDocument: true,
      linkedAllocated: 3000,
      customerPrepaid: 0,
    };
    expect(depositBasisLabel(resolveDeposit(null, facts))).toBe("");
    expect(depositBasisLabel(resolveDeposit("received", facts))).toBe("手動");
    expect(
      depositBasisLabel(resolveDeposit(null, { ...facts, linkedAllocated: 0 })),
    ).toBe("");
    // 同時有沖銷與預收：以沖銷為依據（不標「依客戶預收」）
    expect(resolveDeposit(null, { ...facts, customerPrepaid: 500 }).basis).toBe(
      "linked",
    );
  });

  it("連結單據：無沖銷、無預收 → 未收；負數（銷退沖抵）不算", () => {
    expect(
      resolveDeposit(null, {
        hasDocument: true,
        linkedAllocated: 0,
        customerPrepaid: 0,
      }).status,
    ).toBe("not_received");
    expect(
      resolveDeposit(null, {
        hasDocument: true,
        linkedAllocated: -100,
        customerPrepaid: -1,
      }).status,
    ).toBe("not_received");
  });

  it("手動覆寫優先於自動判斷，並保留自動結果供顯示", () => {
    const r = resolveDeposit("not_received", {
      hasDocument: true,
      linkedAllocated: 3000,
      customerPrepaid: 0,
    });
    expect(r).toMatchObject({
      status: "not_received",
      source: "manual",
      auto: "received",
    });
  });
});

describe("交機時間顯示", () => {
  it("起迄皆空 → 待確認（紅字）", () => {
    expect(formatDeliveryWindow(null, null, 2026)).toEqual({
      text: "待確認",
      pending: true,
    });
  });
  it("同日 → 單日；不同日 → 區間", () => {
    expect(formatDeliveryWindow("2026-11-03", "2026-11-03", 2026)).toEqual({
      text: "11/03",
      pending: false,
    });
    expect(formatDeliveryWindow("2026-11-03", "2026-11-05", 2026)).toEqual({
      text: "11/03~11/05",
      pending: false,
    });
  });
  it("跨年／非今年 → 加民國年；refYear null → 完整西元日期（CSV）", () => {
    expect(formatDeliveryWindow("2026-12-30", "2027-01-02", 2026).text).toBe(
      "12/30~116/01/02",
    );
    expect(formatDeliveryWindow("2026-11-03", "2026-11-05", null).text).toBe(
      "2026-11-03~2026-11-05",
    );
  });
  it("日期格式", () => {
    expect(formatTrackingDate("2026-01-09", 2026)).toBe("01/09");
    expect(formatTrackingDate("2025-12-31", 2026)).toBe("114/12/31");
    expect(formatTrackingDate(null, 2026)).toBe("");
  });
  it("最新進度：日期 + 內容；無進度為空字串", () => {
    expect(latestProgressText("2026-10-23", "試車完成", 2026)).toBe(
      "10/23 試車完成",
    );
    expect(latestProgressText(null, null, 2026)).toBe("");
  });
});

describe("篩選參數", () => {
  it("預設：只看未結案、不限日期（range=all）、第 1 頁", () => {
    expect(parseTrackingFilters("delivery", {})).toEqual({
      q: "",
      status: "open",
      owner: "",
      range: ALL_RANGE,
      page: 1,
    });
  });

  it("期間沿用 #271 週報參數：本週／自訂；不合法的自訂區間退回全部並提示", () => {
    expect(
      parseTrackingFilters("repairs", { range: "this_week" }).range,
    ).toEqual({
      preset: "this_week",
      from: "2026-10-26",
      to: "2026-11-01",
      error: null,
    });
    expect(
      parseTrackingFilters("repairs", {
        range: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
      }).range,
    ).toMatchObject({ preset: "custom", from: "2026-10-01", to: "2026-10-31" });
    const bad = parseTrackingFilters("repairs", {
      range: "custom",
      from: "2026-10-31",
      to: "2026-10-01",
    }).range;
    expect(bad).toMatchObject({ preset: "all", from: "", to: "" });
    expect(bad.error).toMatch(/已改顯示全部/);
    // 舊網址的 from／to（沒有 range=custom）不生效，視為全部
    expect(
      parseTrackingFilters("repairs", { from: "2026-10-01", to: "2026-10-31" })
        .range.preset,
    ).toBe("all");
    expect(
      parseTrackingFilters("repairs", { range: "bogus" }).range.preset,
    ).toBe("all");
  });

  it("不合法的狀態／負責人／頁碼 → 忽略；關鍵字最長 100 字", () => {
    const f = parseTrackingFilters("repairs", {
      status: "delivered",
      owner: "not-a-uuid",
      page: "0",
      q: "x".repeat(150),
    });
    expect(f).toMatchObject({ status: "open", owner: "", page: 1 });
    expect(f.q).toHaveLength(100);
  });

  it("接受各類的狀態值、all、none（負責人待確認）與 uuid", () => {
    expect(
      parseTrackingFilters("repairs", { status: "vendor", owner: E1 }),
    ).toMatchObject({ status: "vendor", owner: E1 });
    expect(
      parseTrackingFilters("machine-issues", { status: "all", owner: "none" }),
    ).toMatchObject({ status: "all", owner: "none" });
    expect(
      parseTrackingFilters("delivery", { status: ["delivered", "x"] }).status,
    ).toBe("delivered");
  });

  it("trackingQuery：期間必帶、省略預設狀態與頁碼（工具列 key、列印、分頁共用）", () => {
    expect(trackingQuery(parseTrackingFilters("delivery", {}))).toBe(
      "range=all",
    );
    const f = parseTrackingFilters("delivery", {
      q: " 壓縮機 ",
      status: "all",
      owner: "none",
      range: "custom",
      from: "2026-10-01",
      to: "2026-10-15",
      page: "3",
    });
    expect(trackingQuery(f)).toBe(
      "range=custom&from=2026-10-01&to=2026-10-15&q=%E5%A3%93%E7%B8%AE%E6%A9%9F&status=all&owner=none",
    );
    expect(trackingParams(f)).toEqual({
      range: "custom",
      from: "2026-10-01",
      to: "2026-10-15",
      q: "壓縮機",
      status: "all",
      owner: "none",
    });
    // 解析回來條件相同（上一頁／下一頁、列印頁讀同一組參數）
    expect(parseTrackingFilters("delivery", trackingParams(f))).toEqual({
      ...f,
      page: 1,
    });
  });

  it("pageSlice：每頁 50 筆；頁碼超過最後一頁 → 最後一頁", () => {
    const rows = Array.from({ length: 120 }, (_, i) => i);
    expect(pageSlice(rows, 1)).toMatchObject({ page: 1, total: 120 });
    expect(pageSlice(rows, 3).rows).toEqual(rows.slice(100));
    expect(pageSlice(rows, 9).page).toBe(3);
    expect(pageSlice([], 2)).toMatchObject({ rows: [], page: 1, total: 0 });
  });

  it("查詢規格：未結案排除結案狀態、關鍵字逐字 ilike（跳脫萬用字元）", () => {
    const spec = trackingQuerySpec("repairs", {
      ...parseTrackingFilters("repairs", {}),
      q: "  50%_ 異音*  ",
    });
    expect(spec.view).toBe("repair_jobs_view");
    expect(spec.filters).toContainEqual({
      op: "not_in",
      column: "status",
      values: ["done", "returned"],
    });
    expect(spec.filters).toContainEqual({
      op: "ilike",
      column: "search_text",
      value: "%50\\%\\_%",
    });
    expect(spec.filters).toContainEqual({
      op: "ilike",
      column: "search_text",
      value: "%異音%",
    });
  });

  it("查詢規格：指定狀態 → eq；all → 不篩狀態", () => {
    const one = trackingQuerySpec("machine-issues", {
      ...parseTrackingFilters("machine-issues", { status: "resolved" }),
    });
    expect(one.filters).toContainEqual({
      op: "eq",
      column: "status",
      value: "resolved",
    });
    const all = trackingQuerySpec("machine-issues", {
      ...parseTrackingFilters("machine-issues", { status: "all" }),
    });
    expect(
      all.filters.some((f) => "column" in f && f.column === "status"),
    ).toBe(false);
  });

  it("查詢規格：交機進度負責人比對業務或交機負責人；none = 交機負責人待確認", () => {
    const f = parseTrackingFilters("delivery", { owner: E1 });
    expect(trackingQuerySpec("delivery", f).filters).toContainEqual({
      op: "or",
      value: `sales_rep_id.eq.${E1},delivery_owner_id.eq.${E1}`,
    });
    expect(
      trackingQuerySpec(
        "delivery",
        parseTrackingFilters("delivery", { owner: "none" }),
      ).filters,
    ).toContainEqual({ op: "is_null", column: "delivery_owner_id" });
    expect(
      trackingQuerySpec(
        "repairs",
        parseTrackingFilters("repairs", { owner: E2 }),
      ).filters,
    ).toContainEqual({ op: "eq", column: "owner_id", value: E2 });
  });

  it("查詢規格：期間 all → 不篩日期", () => {
    for (const kind of ["delivery", "repairs", "machine-issues"] as const) {
      const spec = trackingQuerySpec(kind, parseTrackingFilters(kind, {}));
      expect(spec.filters).toEqual([
        expect.objectContaining({ op: "not_in", column: "status" }),
      ]);
    }
  });

  it("查詢規格：期間（交機時間重疊且列出待確認／進廠日期／發生日期）", () => {
    const range = { range: "custom", from: "2026-11-01", to: "2026-11-07" };
    // 交機進度：與期間重疊，或交機時間待確認（起迄皆空，DB check 保證同時為空）
    expect(
      trackingQuerySpec("delivery", parseTrackingFilters("delivery", range))
        .filters,
    ).toContainEqual({
      op: "or",
      value:
        "and(delivery_end.gte.2026-11-01,delivery_start.lte.2026-11-07),delivery_start.is.null",
    });
    expect(
      trackingQuerySpec("repairs", parseTrackingFilters("repairs", range))
        .filters,
    ).toEqual(
      expect.arrayContaining([
        { op: "gte", column: "received_on", value: "2026-11-01" },
        { op: "lte", column: "received_on", value: "2026-11-07" },
      ]),
    );
    expect(
      trackingQuerySpec(
        "machine-issues",
        parseTrackingFilters("machine-issues", { range: "this_week" }),
      ).filters,
    ).toEqual([
      { op: "not_in", column: "status", values: ["resolved"] },
      { op: "gte", column: "occurred_on", value: "2026-10-26" },
      { op: "lte", column: "occurred_on", value: "2026-11-01" },
    ]);
  });

  it("查詢規格：交機進度同時篩負責人與期間 → 合併成單一 or 參數", () => {
    const spec = trackingQuerySpec(
      "delivery",
      parseTrackingFilters("delivery", { owner: E1, range: "this_week" }),
    );
    const ors = spec.filters.filter((f) => f.op === "or");
    expect(ors).toEqual([
      {
        op: "or",
        value: `and(or(sales_rep_id.eq.${E1},delivery_owner_id.eq.${E1}),or(and(delivery_end.gte.2026-10-26,delivery_start.lte.2026-11-01),delivery_start.is.null))`,
      },
    ]);
  });
});

describe("清單排序", () => {
  const f = (kind: "delivery" | "repairs" | "machine-issues") =>
    trackingQuerySpec(kind, parseTrackingFilters(kind, {})).order;

  it("交機進度：交機時間由近到遠、待確認排最後", () => {
    expect(f("delivery")).toEqual([
      { column: "delivery_start", ascending: true, nullsFirst: false },
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ]);
  });
  it("進廠維修：進廠日期由舊到新（等最久的在前）", () => {
    expect(f("repairs")).toEqual([
      { column: "received_on", ascending: true },
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ]);
  });
  it("新機問題：重點追蹤在前，再依發生日期由舊到新", () => {
    expect(f("machine-issues")).toEqual([
      { column: "is_key", ascending: false },
      { column: "occurred_on", ascending: true },
      { column: "created_at", ascending: true },
      { column: "id", ascending: true },
    ]);
  });
});

function deliveryRow(patch: Partial<DeliveryJobRow> = {}): DeliveryJobRow {
  return {
    id: "j1",
    customer_id: C1,
    document_id: D1,
    deposit_override: null,
    sales_rep_id: E1,
    delivery_owner_id: null,
    materials_confirmed: true,
    equipment: "測試機 A",
    delivery_start: "2026-11-03",
    delivery_end: "2026-11-05",
    note: "後處理設備未交",
    status: "in_progress",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    customer_code: "ZT0001",
    customer_name: "測試客戶甲",
    sales_rep_name: "測試業務",
    delivery_owner_name: null,
    doc_type: "Q",
    doc_no: "Q11510001",
    doc_status: "posted",
    linked_allocated: 0,
    customer_prepaid: 500,
    ...patch,
  };
}

describe("CSV 列", () => {
  it("交機進度：訂金依判斷結果、交機負責人待確認、交機時間完整日期", () => {
    const t = deliveryCsvTable([deliveryRow()]);
    expect(t.headers).toEqual([
      "客戶",
      "訂金",
      "訂金依據",
      "負責業務",
      "交機負責人",
      "材料確認",
      "機器設備",
      "交機時間",
      "注意事項",
      "狀態",
      "來源單據",
    ]);
    expect(t.rows[0]).toEqual([
      "測試客戶甲",
      "已收",
      "依客戶預收",
      "測試業務",
      "待確認",
      "已確認",
      "測試機 A",
      "2026-11-03~2026-11-05",
      "後處理設備未交",
      "進行中",
      "Q11510001",
    ]);
    const pending = deliveryCsvTable([
      deliveryRow({
        delivery_start: null,
        delivery_end: null,
        materials_confirmed: false,
        document_id: null,
        doc_no: null,
        doc_type: null,
        deposit_override: null,
      }),
    ]).rows[0];
    expect(pending[1]).toBe("未收");
    expect(pending[2]).toBe("");
    expect(pending[5]).toBe("未確認");
    expect(pending[7]).toBe("待確認");
    expect(pending[10]).toBe("");
    expect(
      deliveryCsvTable([deliveryRow({ deposit_override: "received" })])
        .rows[0][2],
    ).toBe("手動");
  });

  it("進廠維修：處理進度為最新一筆", () => {
    const row: RepairJobRow = {
      id: "r1",
      customer_id: C1,
      received_on: "2026-10-20",
      model: "TEST-M100",
      description: "異音",
      owner_id: null,
      status: "vendor",
      created_at: "",
      updated_at: "",
      customer_code: null,
      customer_name: "測試客戶乙",
      owner_name: null,
      latest_progress_date: "2026-10-23",
      latest_progress: "送原廠檢測",
      progress_count: 2,
    };
    const t = repairsCsvTable([row]);
    expect(t.headers).toEqual([
      "客戶",
      "進廠日期",
      "機型",
      "問題",
      "處理進度",
      "負責人",
      "狀態",
    ]);
    expect(t.rows[0]).toEqual([
      "測試客戶乙",
      "2026-10-20",
      "TEST-M100",
      "異音",
      "2026-10-23 送原廠檢測",
      "",
      "送廠商檢修",
    ]);
  });

  it("新機問題：重點追蹤欄", () => {
    const row: MachineIssueRow = {
      id: "i1",
      customer_id: C1,
      machine_id: null,
      model: "TEST-M200",
      delivered_on: "2026-08-01",
      description: "面板異常",
      occurred_on: "2026-10-16",
      owner_id: null,
      status: "awaiting_vendor",
      is_key: true,
      created_at: "",
      updated_at: "",
      customer_code: null,
      customer_name: "測試客戶丙",
      machine_serial_no: "SN-0001",
      owner_name: "測試師傅",
      latest_progress_date: null,
      latest_progress: null,
      progress_count: 0,
    };
    const t = machineIssuesCsvTable([row]);
    expect(t.headers).toEqual([
      "客戶",
      "交機日期",
      "機型",
      "機號",
      "問題",
      "發生日期",
      "處理進度",
      "負責人",
      "狀態",
      "重點追蹤",
    ]);
    expect(t.rows[0]).toEqual([
      "測試客戶丙",
      "2026-08-01",
      "TEST-M200",
      "SN-0001",
      "面板異常",
      "2026-10-16",
      "",
      "測試師傅",
      "待原廠",
      "是",
    ]);
  });

  it("trackingCsvFile：#271 共用格式（BOM）；檔名含期間，不限日期為「全部期間」", () => {
    const f = trackingCsvFile("delivery", [deliveryRow()], {
      from: "2026-11-01",
      to: "2026-11-07",
    });
    expect(f.filename).toBe("交機進度_2026-11-01_2026-11-07.csv");
    expect(f.content.startsWith("\uFEFF客戶,訂金,訂金依據")).toBe(true);
    expect(
      trackingCsvFile("machine-issues", [], { from: "", to: "" }).filename,
    ).toBe("新機問題_全部期間.csv");
  });
});

describe("自動帶入不覆蓋已填值", () => {
  it("autofill：空白或仍是上次帶入的值 → 換新值；使用者改過 → 保留", () => {
    expect(autofill("", null, "螺旋式空壓機")).toBe("螺旋式空壓機");
    expect(autofill("  ", null, "A")).toBe("A");
    expect(autofill("自填設備", null, "A")).toBe("自填設備");
    expect(autofill("A", "A", "B")).toBe("B");
    expect(autofill("A 改過", "A", "B")).toBe("A 改過");
    // 新來源沒有值：清掉上次帶入的舊值；空白維持空白；自填保留
    expect(autofill("A", "A", null)).toBe("");
    expect(autofill("", "A", null)).toBe("");
    expect(autofill("自填", "A", null)).toBe("自填");
  });

  it("autofillEmployee：未指定或仍是上次帶入者 → 換人；已自行指定 → 保留", () => {
    const none = { id: null, name: null };
    const a = { id: E1, name: "業務甲" };
    const b = { id: E2, name: "業務乙" };
    expect(autofillEmployee(none, null, a)).toEqual(a);
    expect(autofillEmployee(a, null, b)).toEqual(a);
    expect(autofillEmployee(a, E1, b)).toEqual(b);
    expect(autofillEmployee(a, E1, null)).toEqual(a);
    // 只有文字快照（舊資料）視為已填
    expect(autofillEmployee({ id: null, name: "舊業務" }, null, b)).toEqual({
      id: null,
      name: "舊業務",
    });
  });
});
