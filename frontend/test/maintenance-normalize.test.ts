import { describe, it, expect } from "vitest";
import {
  cleanText,
  machinePayloadFromForm,
  recordPayloadFromForm,
  customerPayloadFromForm,
  normalizeSerial,
  normalizeCustomerCode,
  cardTypeLabel,
  parseExtraction,
} from "@/lib/admin/maintenance-normalize";

describe("cleanText", () => {
  it("trims and maps empty to null", () => {
    expect(cleanText("  A ")).toBe("A");
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});

describe("machinePayloadFromForm", () => {
  it("requires serial_no, cleans fields", () => {
    const fd = new FormData();
    fd.set("serial_no", " B072303002 ");
    fd.set("machine_no", " M-01 ");
    fd.set("model", "PMV10");
    fd.set("horsepower", "");
    const out = machinePayloadFromForm(fd);
    expect(out.serial_no).toBe("B072303002");
    expect(out.machine_no).toBe("M-01");
    expect(out.model).toBe("PMV10");
    expect(out.horsepower).toBeNull();
  });

  it("throws when serial_no missing", () => {
    expect(() => machinePayloadFromForm(new FormData())).toThrow(/機號/);
  });
});

describe("recordPayloadFromForm", () => {
  it("cleans all maintenance columns", () => {
    const fd = new FormData();
    fd.set("hours", " 8342 ");
    fd.set("oil", "V190");
    const out = recordPayloadFromForm(fd);
    expect(out.hours).toBe("8342");
    expect(out.oil).toBe("V190");
    expect(out.technician).toBeNull();
  });
});

describe("normalizeSerial", () => {
  it("lowercases and trims for matching", () => {
    expect(normalizeSerial("  B072303002 ")).toBe("b072303002");
    expect(normalizeSerial(null)).toBe("");
  });
});

describe("parseExtraction", () => {
  it("coerces AI json into typed draft, dropping empty rows", () => {
    const raw = {
      basic: {
        customer_name: "念德鋼鐵",
        customer_code: "KC054",
        serial_no: "B072303002",
        machine_no: "M-01",
        model: "PMV10",
      },
      records: [
        { service_date: "2024-06-12", hours: "8342", technician: "陳" },
        { service_date: "", hours: "", technician: "" },
      ],
    };
    const out = parseExtraction(raw);
    expect(out.basic.serial_no).toBe("B072303002");
    expect(out.basic.customer_code).toBe("KC054");
    expect(out.basic.machine_no).toBe("M-01");
    expect(out.records).toHaveLength(1);
    expect(out.records[0].hours).toBe("8342");
  });

  it("tolerates missing fields and non-array records", () => {
    const out = parseExtraction({});
    expect(out.basic.serial_no).toBe("");
    expect(out.records).toEqual([]);
  });
});

describe("customerPayloadFromForm", () => {
  it("清洗客戶主檔欄位，空字串轉 null", () => {
    const fd = new FormData();
    fd.set("name", "  超勁賀股份有限公司 ");
    fd.set("code", " A-001 ");
    fd.set("contact_person", "王先生");
    fd.set("phone", "  ");
    fd.set("address", "台中市…");
    fd.set("note", "");
    const out = customerPayloadFromForm(fd);
    expect(out.name).toBe("超勁賀股份有限公司");
    expect(out.code).toBe("A-001");
    expect(out.contact_person).toBe("王先生");
    expect(out.phone).toBeNull();
    expect(out.address).toBe("台中市…");
    expect(out.note).toBeNull();
  });

  it("缺客戶名稱時丟錯", () => {
    expect(() => customerPayloadFromForm(new FormData())).toThrow(/客戶名稱/);
  });
});

describe("normalizeCustomerCode", () => {
  it("lower + trim，與 0013 索引對齊", () => {
    expect(normalizeCustomerCode(" A-001 ")).toBe("a-001");
    expect(normalizeCustomerCode(null)).toBe("");
    expect(normalizeCustomerCode(undefined)).toBe("");
  });
});

describe("cardTypeLabel", () => {
  it("card_type 尚未落地（undefined / null）時視為空壓機卡", () => {
    expect(cardTypeLabel(undefined)).toBe("空壓機");
    expect(cardTypeLabel(null)).toBe("空壓機");
  });

  it("filter → 過濾系統", () => {
    expect(cardTypeLabel("filter")).toBe("過濾系統");
  });
});
