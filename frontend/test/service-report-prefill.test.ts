import { describe, it, expect } from "vitest";
import {
  customerOptionLabel,
  machineOptionLabel,
  prefillFromCustomer,
  prefillFromMachine,
  type SrCustomerOption,
  type SrMachineOption,
} from "@/lib/service-report/prefill";

const customer: SrCustomerOption = {
  id: "c1",
  code: "KK855",
  name: "金凱",
  invoice_title: "金凱工業股份有限公司",
  phone: "02-2222-3333",
  tax_id: "12345678",
  contact_person: "王先生 0912-345-678",
  address: "新北市樹林區",
  delivery_address: "測試市送貨路 1 號",
};

const machine: SrMachineOption = {
  id: "m1",
  customer_id: "c1",
  card_type: "compressor",
  machine_no: "2",
  serial_no: "SN-001",
  model: "PUMA SP50VH5",
  horsepower: "50HP",
  voltage: "220V",
};

describe("prefillFromCustomer", () => {
  it("發票抬頭優先作為客戶名稱，其餘欄位對應", () => {
    expect(prefillFromCustomer(customer)).toEqual({
      customer_id: "c1",
      customer_name: "金凱工業股份有限公司",
      phone: "02-2222-3333",
      tax_id: "12345678",
      contact: "王先生 0912-345-678",
      address: "新北市樹林區",
    });
  });
  it("無發票抬頭（null / 空白）→ 用名稱；空白欄位 → null", () => {
    const r = prefillFromCustomer({
      ...customer,
      invoice_title: "  ",
      phone: "",
      tax_id: null,
      contact_person: null,
      address: " ",
      delivery_address: "",
    });
    expect(r.customer_name).toBe("金凱");
    expect(r.phone).toBeNull();
    expect(r.tax_id).toBeNull();
    expect(r.contact).toBeNull();
    expect(r.address).toBeNull();
  });
  it("地址：聯絡地址優先；聯絡地址空白 → 改帶送貨地址（#281）", () => {
    // 兩者皆有 → 聯絡地址
    expect(prefillFromCustomer(customer).address).toBe("新北市樹林區");
    // 只有送貨地址（舊系統匯入客戶常見）→ 送貨地址（去空白）
    expect(
      prefillFromCustomer({
        ...customer,
        address: null,
        delivery_address: " 測試市送貨路 1 號 ",
      }).address,
    ).toBe("測試市送貨路 1 號");
    expect(prefillFromCustomer({ ...customer, address: "  " }).address).toBe(
      "測試市送貨路 1 號",
    );
    // 兩者皆空 → null
    expect(
      prefillFromCustomer({ ...customer, address: "", delivery_address: null })
        .address,
    ).toBeNull();
  });
});

describe("prefillFromMachine", () => {
  it("設備 = 型號 + 馬力；代號 = 客戶編號-機台代號", () => {
    expect(prefillFromMachine(machine, customer)).toEqual({
      machine_id: "m1",
      equipment: "PUMA SP50VH5 50HP",
      model: "PUMA SP50VH5",
      voltage: "220V",
      serial_no: "SN-001",
      header_code: "KK855-2",
    });
  });
  it("缺者省略：無客戶編號 → 只有機台代號；無機台代號 → 只有客戶編號", () => {
    expect(prefillFromMachine(machine).header_code).toBe("2");
    expect(prefillFromMachine(machine, { code: " " }).header_code).toBe("2");
    expect(
      prefillFromMachine({ ...machine, machine_no: null }, customer)
        .header_code,
    ).toBe("KK855");
    expect(
      prefillFromMachine({ ...machine, machine_no: "" }, null).header_code,
    ).toBeNull();
  });
  it("設備：只有型號或只有馬力；皆無 → null", () => {
    expect(prefillFromMachine({ ...machine, horsepower: null }).equipment).toBe(
      "PUMA SP50VH5",
    );
    expect(prefillFromMachine({ ...machine, model: " " }).equipment).toBe(
      "50HP",
    );
    const r = prefillFromMachine({ ...machine, model: null, horsepower: "" });
    expect(r.equipment).toBeNull();
    expect(r.model).toBeNull();
  });
});

describe("選單顯示文字", () => {
  it("機台：代號 / 機號 / 型號，缺者省略", () => {
    expect(machineOptionLabel(machine)).toBe("2 / SN-001 / PUMA SP50VH5");
    expect(machineOptionLabel({ ...machine, machine_no: null })).toBe(
      "SN-001 / PUMA SP50VH5",
    );
    expect(
      machineOptionLabel({
        ...machine,
        machine_no: null,
        serial_no: null,
        model: null,
      }),
    ).toBe("（未命名機台）");
  });
  it("客戶：編號 名稱", () => {
    expect(customerOptionLabel(customer)).toBe("KK855 金凱");
    expect(customerOptionLabel({ ...customer, code: null })).toBe("金凱");
  });
});
