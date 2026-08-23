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
  parseCardType,
  parseColumnDefs,
  MAX_COLUMN_DEFS,
  columnFieldName,
  filterRecordPayloadFromForm,
  readRecordValues,
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

  it("defaults card_type to compressor and keeps filter specs null", () => {
    const fd = new FormData();
    fd.set("serial_no", "B072303002");
    const out = machinePayloadFromForm(fd);
    expect(out.card_type).toBe("compressor");
    expect(out.filter_spec).toBeNull();
    expect(out.drain_spec).toBeNull();
  });

  it("reads filter card header fields", () => {
    const fd = new FormData();
    fd.set("card_type", "filter");
    fd.set("serial_no", " KF115-3 ");
    fd.set("model", "AD-250S");
    fd.set("location", "五股區五工六路24號");
    fd.set("filter_spec", " EA350-Q*1只\nEA350-S*1只\nEA350-P*1只 ");
    fd.set("drain_spec", '外置式排水器CKD*3只+桶下AD480\n16"馬達+葉片');
    const out = machinePayloadFromForm(fd);
    expect(out.card_type).toBe("filter");
    expect(out.serial_no).toBe("KF115-3");
    expect(out.filter_spec).toBe("EA350-Q*1只\nEA350-S*1只\nEA350-P*1只");
    expect(out.drain_spec).toContain('16"馬達+葉片');
  });
});

describe("parseCardType", () => {
  it("only accepts 'filter', everything else falls back to compressor", () => {
    expect(parseCardType("filter")).toBe("filter");
    expect(parseCardType("compressor")).toBe("compressor");
    expect(parseCardType("dryer")).toBe("compressor");
    expect(parseCardType(undefined)).toBe("compressor");
    expect(parseCardType(null)).toBe("compressor");
  });
});

describe("parseColumnDefs", () => {
  it("parses editor json, keeping order and trimming labels", () => {
    const raw = JSON.stringify([
      { id: null, label: "  EA350-Q 濾蕊 " },
      { id: "11111111-1111-1111-1111-111111111111", label: "CKD 排水器" },
    ]);
    expect(parseColumnDefs(raw)).toEqual([
      { id: null, label: "EA350-Q 濾蕊" },
      { id: "11111111-1111-1111-1111-111111111111", label: "CKD 排水器" },
    ]);
  });

  it("drops blank labels and never throws on garbage", () => {
    expect(
      parseColumnDefs(JSON.stringify([{ label: "  " }, { label: "A" }])),
    ).toEqual([{ id: null, label: "A" }]);
    expect(parseColumnDefs("not json")).toEqual([]);
    expect(parseColumnDefs(JSON.stringify({ label: "A" }))).toEqual([]);
    expect(parseColumnDefs("")).toEqual([]);
    expect(parseColumnDefs(null)).toEqual([]);
    expect(parseColumnDefs(JSON.stringify(["x", 1, null, [], true]))).toEqual(
      [],
    );
    expect(
      parseColumnDefs(JSON.stringify([{ id: 42, label: { a: 1 } }])),
    ).toEqual([]);
  });

  it("keeps only the first entry per repeated column id", () => {
    const raw = JSON.stringify([
      { id: "a", label: "第一次" },
      { id: "b", label: "B" },
      { id: "a", label: "重複" },
      { id: null, label: "新欄" },
      { id: null, label: "另一個新欄" },
    ]);
    expect(parseColumnDefs(raw)).toEqual([
      { id: "a", label: "第一次" },
      { id: "b", label: "B" },
      { id: null, label: "新欄" },
      { id: null, label: "另一個新欄" },
    ]);
  });

  it("caps a hostile huge array at MAX_COLUMN_DEFS", () => {
    const raw = JSON.stringify(
      Array.from({ length: 5000 }, (_, i) => ({ id: null, label: `c${i}` })),
    );
    expect(parseColumnDefs(raw)).toHaveLength(MAX_COLUMN_DEFS);
  });
});

describe("filterRecordPayloadFromForm", () => {
  // 重現 xlsx 的 KF115-3 表格：日期 + 6 個動態耗材欄 + 維護員（+ 備註）。
  // 日期 / 維護員 / 備註 是兩種卡共用的固定欄，只有耗材欄進 mx_machine_columns。
  const columns = [
    { id: "c1", label: "EA350-Q 濾蕊" },
    { id: "c2", label: "EA350-S 濾蕊" },
    { id: "c3", label: "EA350-P 濾蕊" },
    { id: "c4", label: "CKD 排水器" },
    { id: "c5", label: "AD480 排水器" },
    { id: "c6", label: '16" 散熱馬達+葉片' },
  ];

  it("builds the values jsonb from the dynamic column inputs", () => {
    const fd = new FormData();
    fd.set("service_date", "2025-04-20");
    fd.set("technician", " 江 ");
    fd.set("note", "");
    fd.set(columnFieldName("c1"), " 1只 ");
    fd.set(columnFieldName("c4"), "3只");
    const out = filterRecordPayloadFromForm(fd, columns);
    expect(out.service_date).toBe("2025-04-20");
    expect(out.technician).toBe("江");
    expect(out.note).toBeNull();
    expect(out.values).toEqual({ c1: "1只", c4: "3只" });
  });

  it("returns null values when every consumable cell is blank", () => {
    const fd = new FormData();
    fd.set("service_date", "2025-04-20");
    fd.set(columnFieldName("c1"), "   ");
    expect(filterRecordPayloadFromForm(fd, columns).values).toBeNull();
  });

  it("ignores form keys that are not declared columns", () => {
    const fd = new FormData();
    fd.set(columnFieldName("c1"), "1只");
    fd.set("col_not-a-column", "hack");
    fd.set("hours", "8342");
    const out = filterRecordPayloadFromForm(fd, columns);
    expect(out.values).toEqual({ c1: "1只" });
  });
});

describe("readRecordValues", () => {
  it("coerces jsonb into a string map, tolerating null / junk", () => {
    expect(readRecordValues({ c1: "1只", c2: 3, c3: null })).toEqual({
      c1: "1只",
      c2: "3",
    });
    expect(readRecordValues(null)).toEqual({});
    expect(readRecordValues([1, 2])).toEqual({});
    expect(readRecordValues("x")).toEqual({});
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

  it("收下合法的 service_type，非法值視為未判定", () => {
    const fd = new FormData();
    fd.set("service_type", "inspection");
    expect(recordPayloadFromForm(fd).service_type).toBe("inspection");

    const bad = new FormData();
    bad.set("service_type", "例檢");
    expect(recordPayloadFromForm(bad).service_type).toBeNull();

    expect(recordPayloadFromForm(new FormData()).service_type).toBeNull();
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

  it("採用 AI 給的合法 service_type", () => {
    const out = parseExtraction({
      records: [
        { service_date: "2023-07-12", oil: "例", service_type: "repair" },
      ],
    });
    // AI 明確給了合法值就尊重它（人工仍可在核對畫面改）。
    expect(out.records[0].service_type).toBe("repair");
  });

  it("AI 缺值或給非法值時，改用本地規則推導", () => {
    const out = parseExtraction({
      records: [
        // 缺 service_type → 專用油=例 → 例檢
        { service_date: "2023-07-12", oil: "例" },
        // 非法值 → 耗材欄有量 → 保養
        {
          service_date: "2023-08-22",
          oil: "4",
          oil_filter: "1",
          service_type: "保養",
        },
        // 空字串 → 變頻器自由文字 → 維修
        { service_date: "2023-05-15", inverter: "AD480×1", service_type: "" },
        // 都判不出來 → null
        { service_date: "2023-06-20", hours: "3508" },
      ],
    });
    expect(out.records.map((r) => r.service_type)).toEqual([
      "inspection",
      "maintenance",
      "repair",
      null,
    ]);
  });

  it("只有 service_type 的列仍視為空列丟棄", () => {
    const out = parseExtraction({
      records: [{ service_type: "inspection" }],
    });
    expect(out.records).toEqual([]);
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
