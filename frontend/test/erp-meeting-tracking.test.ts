import { describe, it, expect } from "vitest";
import {
  normalizeDeliveryInput,
  normalizeMachineIssueInput,
  normalizeProgressInput,
  normalizeRepairInput,
} from "@/lib/erp/tracking/normalize";
import { autoDeposit, resolveDeposit } from "@/lib/erp/tracking/deposit";
import {
  formatDeliveryWindow,
  formatTrackingDate,
  latestProgressText,
} from "@/lib/erp/tracking/display";
import {
  filtersToParams,
  parseTrackingFilters,
  trackingQuerySpec,
} from "@/lib/erp/tracking/filters";
import {
  deliveryCsvTable,
  machineIssuesCsvTable,
  repairsCsvTable,
  trackingCsvFilename,
} from "@/lib/erp/tracking/csv";
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
    expect(r.reason).toContain("預收");
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
  it("預設：只看未結案、無日期、第 1 頁", () => {
    expect(parseTrackingFilters("delivery", {})).toEqual({
      q: "",
      status: "open",
      owner: "",
      from: "",
      to: "",
      page: 1,
    });
  });

  it("不合法的狀態／負責人／日期 → 忽略；起迄顛倒 → 對調", () => {
    const f = parseTrackingFilters("repairs", {
      status: "delivered",
      owner: "not-a-uuid",
      from: "2026-10-31",
      to: "2026-10-01",
      page: "0",
    });
    expect(f).toMatchObject({
      status: "open",
      owner: "",
      from: "2026-10-01",
      to: "2026-10-31",
      page: 1,
    });
    expect(parseTrackingFilters("repairs", { from: "2026/10/01" }).from).toBe(
      "",
    );
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

  it("filtersToParams 省略預設值（分頁連結）", () => {
    expect(filtersToParams(parseTrackingFilters("delivery", {}))).toEqual({});
    expect(
      filtersToParams({
        q: "壓縮機",
        status: "all",
        owner: "none",
        from: "2026-10-01",
        to: "",
        page: 3,
      }),
    ).toEqual({
      q: "壓縮機",
      status: "all",
      owner: "none",
      from: "2026-10-01",
    });
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

  it("查詢規格：日期區間（交機時間重疊／進廠日期／發生日期）", () => {
    const range = { from: "2026-11-01", to: "2026-11-07" };
    expect(
      trackingQuerySpec("delivery", {
        ...parseTrackingFilters("delivery", range),
      }).filters,
    ).toEqual(
      expect.arrayContaining([
        { op: "gte", column: "delivery_end", value: "2026-11-01" },
        { op: "lte", column: "delivery_start", value: "2026-11-07" },
      ]),
    );
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
        parseTrackingFilters("machine-issues", { to: "2026-11-07" }),
      ).filters,
    ).toEqual([
      { op: "not_in", column: "status", values: ["resolved"] },
      { op: "lte", column: "occurred_on", value: "2026-11-07" },
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
    expect(pending[4]).toBe("未確認");
    expect(pending[6]).toBe("待確認");
    expect(pending[9]).toBe("");
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

  it("檔名：類別 + 日期區間或今天", () => {
    expect(
      trackingCsvFilename(
        "delivery",
        { from: "2026-11-01", to: "2026-11-07" },
        "2026-10-29",
      ),
    ).toBe("交機進度_2026-11-01_2026-11-07.csv");
    expect(
      trackingCsvFilename("machine-issues", { from: "", to: "" }, "2026-10-29"),
    ).toBe("新機問題_2026-10-29.csv");
  });
});
