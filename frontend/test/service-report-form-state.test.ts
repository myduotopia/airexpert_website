import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PREFILL_FIELDS,
  applyCustomerPrefill,
  applyMachinePrefill,
  clearCustomer,
  clearMachine,
  customerPrefillConflicts,
  emptyFormState,
  formStateFromReport,
  formStateToInput,
  formStateToSheetData,
  normalizeParts,
  setFilterConsumable,
  setResultField,
  sheetDataFromReport,
  toggleSingle,
  toggleValue,
  updatePart,
  type ReportFormState,
} from "@/components/service-report/form-state";
import type {
  SrCustomerOption,
  SrMachineOption,
} from "@/lib/service-report/prefill";
import {
  defaultParts,
  type ServiceItem,
  type ServiceReport,
} from "@/lib/service-report/types";

const TODAY = "2026-09-15";

const CUSTOMER: SrCustomerOption = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "KK855",
  name: "鼎佑電子股份有限公司",
  invoice_title: "鼎佑電子(股)公司",
  phone: "02-1234-5678",
  tax_id: "12345678",
  contact_person: "王先生 0912-000-000",
  address: "新北市三重區重新路一段 1 號",
};

const OTHER_CUSTOMER: SrCustomerOption = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "AA001",
  name: "另一家客戶",
  invoice_title: null,
  phone: "02-9999-9999",
  tax_id: "87654321",
  contact_person: null,
  address: null,
};

const MACHINE: SrMachineOption = {
  id: "33333333-3333-4333-8333-333333333333",
  customer_id: CUSTOMER.id,
  card_type: "compressor",
  machine_no: "2",
  serial_no: "AM3-37A-E30",
  model: "SP50VH5",
  horsepower: "50HP",
  voltage: "220V",
};

function stateWith(patch: Partial<ReportFormState>): ReportFormState {
  return { ...emptyFormState(TODAY), ...patch };
}

describe("emptyFormState / normalizeParts", () => {
  it("新表單：派工單號留空（儲存時自動編號）、料件 10 列預設品名", () => {
    const s = emptyFormState(TODAY);
    expect(s.report_no).toBe("");
    expect(s.report_date).toBe(TODAY);
    expect(s.parts).toHaveLength(10);
    expect(s.parts[0]).toEqual({ no: 1, name: "螺旋專用油", qty: "" });
    expect(s.parts[9].name).toBe("維護及保養工資");
  });

  it("normalizeParts：缺列補預設、多餘列捨去、編號固定 1–10", () => {
    const rows = normalizeParts([
      { no: 3, name: "自訂濾芯", qty: "2" },
      { no: 99, name: "不存在", qty: "1" },
    ]);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows[2]).toEqual({ no: 3, name: "自訂濾芯", qty: "2" });
    expect(rows[0].name).toBe("螺旋專用油");
  });
});

describe("客戶帶入的覆蓋判斷（spec §6）", () => {
  it("欄位全空 → 沒有衝突，直接帶入", () => {
    expect(customerPrefillConflicts(emptyFormState(TODAY), CUSTOMER)).toEqual(
      [],
    );
  });

  it("已填且與帶入值不同的欄位才算衝突（相同值不算）", () => {
    const s = stateWith({
      customer_name: "手動打的名字",
      phone: CUSTOMER.phone!,
      tax_id: "",
    });
    expect(customerPrefillConflicts(s, CUSTOMER)).toEqual(["customer_name"]);
  });

  it("不覆蓋：只補空白欄位，已填內容原封不動", () => {
    const s = stateWith({ customer_name: "手動打的名字" });
    const next = applyCustomerPrefill(s, CUSTOMER, false);
    expect(next.customer_name).toBe("手動打的名字");
    expect(next.phone).toBe(CUSTOMER.phone);
    expect(next.address).toBe(CUSTOMER.address);
    expect(next.customer_id).toBe(CUSTOMER.id);
  });

  it("覆蓋：全部改成客戶資料（發票抬頭優先），代號先帶客戶編號", () => {
    const s = stateWith({ customer_name: "手動打的名字", tax_id: "00000000" });
    const next = applyCustomerPrefill(s, CUSTOMER, true);
    expect(next.customer_name).toBe(CUSTOMER.invoice_title);
    expect(next.tax_id).toBe(CUSTOMER.tax_id);
    expect(next.contact).toBe(CUSTOMER.contact_person);
    expect(next.header_code).toBe("KK855");
    expect(CUSTOMER_PREFILL_FIELDS).toContain("header_code");
  });

  it("覆蓋時帶入值為空 → 該欄位清空", () => {
    const s = stateWith({ contact: "舊聯絡人", address: "舊地址" });
    const next = applyCustomerPrefill(s, OTHER_CUSTOMER, true);
    expect(next.contact).toBe("");
    expect(next.address).toBe("");
  });

  it("換客戶會清掉已選機台（機台清單以客戶為範圍）", () => {
    const s = stateWith({ customer_id: CUSTOMER.id, machine_id: MACHINE.id });
    expect(applyCustomerPrefill(s, OTHER_CUSTOMER, true).machine_id).toBeNull();
    // 同一客戶重新帶入不動機台
    expect(applyCustomerPrefill(s, CUSTOMER, false).machine_id).toBe(
      MACHINE.id,
    );
  });

  it("清除客戶只清選取，快照文字保留", () => {
    const s = stateWith({
      customer_id: CUSTOMER.id,
      machine_id: MACHINE.id,
      customer_name: "鼎佑",
    });
    const next = clearCustomer(s);
    expect(next.customer_id).toBeNull();
    expect(next.machine_id).toBeNull();
    expect(next.customer_name).toBe("鼎佑");
  });
});

describe("機台帶入", () => {
  it("一律覆蓋設備／型號／電壓／編號，代號＝客戶編號-機台代號", () => {
    const s = stateWith({ equipment: "舊設備", customer_id: CUSTOMER.id });
    const next = applyMachinePrefill(s, MACHINE, CUSTOMER);
    expect(next.equipment).toBe("SP50VH5 50HP");
    expect(next.model).toBe("SP50VH5");
    expect(next.voltage).toBe("220V");
    expect(next.serial_no).toBe("AM3-37A-E30");
    expect(next.header_code).toBe("KK855-2");
    expect(next.machine_id).toBe(MACHINE.id);
  });

  it("沒有客戶時代號只剩機台代號；清除機台只清選取", () => {
    const next = applyMachinePrefill(emptyFormState(TODAY), MACHINE, null);
    expect(next.header_code).toBe("2");
    const cleared = clearMachine(next);
    expect(cleared.machine_id).toBeNull();
    expect(cleared.equipment).toBe("SP50VH5 50HP");
  });
});

describe("表單狀態 → 預覽 / 儲存", () => {
  it("空字串轉 null（紙上留白），列舉與陣列原樣帶出", () => {
    const s = stateWith({
      customer_name: "鼎佑電子",
      time_slot: "afternoon",
      service_items: ["periodic"] as ServiceItem[],
    });
    const sheet = formStateToSheetData(s);
    expect(sheet.customer_name).toBe("鼎佑電子");
    expect(sheet.phone).toBeNull();
    expect(sheet.time_slot).toBe("afternoon");
    expect(sheet.service_items).toEqual(["periodic"]);
    expect(sheet.parts).toHaveLength(10);
    // ServiceReportSheetData 不含這些欄位
    expect("note" in sheet).toBe(false);
    expect("customer_id" in sheet).toBe(false);
  });

  it("formStateToInput：有 id 才帶 id，note / customer_id / machine_id 一併送出", () => {
    const s = stateWith({
      customer_id: CUSTOMER.id,
      machine_id: MACHINE.id,
      note: "內部備註",
    });
    expect(formStateToInput(s).id).toBeUndefined();
    const input = formStateToInput(s, "44444444-4444-4444-8444-444444444444");
    expect(input.id).toBe("44444444-4444-4444-8444-444444444444");
    expect(input.customer_id).toBe(CUSTOMER.id);
    expect(input.machine_id).toBe(MACHINE.id);
    expect(input.note).toBe("內部備註");
  });

  it("DB 資料列 → 表單狀態 → 送出，內容不失真", () => {
    const report = makeReport();
    const state = formStateFromReport(report);
    expect(state.report_no).toBe("X11509009");
    expect(state.customer_name).toBe("鼎佑電子");
    expect(state.summary).toBe("");
    expect(state.results.compressor?.run_hours).toBe("22278");
    expect(state.parts).toHaveLength(10);

    const input = formStateToInput(state, report.id);
    expect(input.report_no).toBe("X11509009");
    expect(input.summary).toBeNull();
    expect(input.results).toEqual(report.results);

    expect(sheetDataFromReport(report).customer_name).toBe("鼎佑電子");
  });
});

describe("欄位編輯", () => {
  it("updatePart 只改指定列；編號超出範圍不動", () => {
    const parts = defaultParts();
    const next = updatePart(parts, 3, { qty: "2支" });
    expect(next[2]).toEqual({ no: 3, name: "空氣濾清器(外)", qty: "2支" });
    expect(next[0]).toEqual(parts[0]);
    expect(parts[2].qty).toBe(""); // 原陣列不變
    expect(updatePart(parts, 0, { qty: "x" })).toEqual(parts);
    expect(updatePart(parts, 11, { qty: "x" })).toEqual(parts);
  });

  it("品名可改", () => {
    const next = updatePart(defaultParts(), 8, { name: "冷卻水塔清洗" });
    expect(next[7]).toEqual({ no: 8, name: "冷卻水塔清洗", qty: "" });
  });

  it("toggleValue / toggleSingle", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleSingle("morning", "noon")).toBe("noon");
    expect(toggleSingle("noon", "noon")).toBeNull();
  });

  it("setResultField 寫入 / 清空；整組清空時移除該區塊", () => {
    let r = setResultField({}, "compressor", "run_hours", "22278");
    expect(r.compressor).toEqual({ run_hours: "22278" });
    r = setResultField(r, "compressor", "fan", "normal");
    expect(r.compressor?.fan).toBe("normal");
    r = setResultField(r, "compressor", "fan", null);
    expect(r.compressor).toEqual({ run_hours: "22278" });
    r = setResultField(r, "compressor", "run_hours", "");
    expect(r.compressor).toBeUndefined();
  });

  it("setFilterConsumable 可選可取消", () => {
    const r = setFilterConsumable({}, "replace");
    expect(r.filter_consumable).toBe("replace");
    expect(setFilterConsumable(r, null).filter_consumable).toBeUndefined();
  });
});

function makeReport(): ServiceReport {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    report_no: "X11509009",
    report_date: "2026-09-15",
    time_slot: "afternoon",
    status: "printed",
    customer_id: CUSTOMER.id,
    machine_id: MACHINE.id,
    header_code: "KK855-2",
    customer_name: "鼎佑電子",
    phone: "02-1234-5678",
    tax_id: "12345678",
    contact: "王先生",
    address: "新北市三重區",
    equipment: "SP50VH5 50HP",
    model: "SP50VH5",
    voltage: "220V",
    serial_no: "AM3-37A-E30",
    machine_state: "running",
    service_items: ["periodic"],
    summary: null,
    results: { compressor: { run_hours: "22278" } },
    parts: defaultParts(),
    suggestions: ["motor"],
    technician: "陳技師",
    customer_signer: null,
    note: null,
    print_count: 1,
    first_printed_at: "2026-09-15T02:00:00Z",
    last_printed_at: "2026-09-15T02:00:00Z",
    completed_at: null,
    voided_at: null,
    void_reason: null,
    created_by: null,
    created_at: "2026-09-15T01:00:00Z",
    updated_at: "2026-09-15T02:00:00Z",
  };
}
