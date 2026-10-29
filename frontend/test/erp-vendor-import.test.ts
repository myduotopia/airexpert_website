import { describe, expect, it } from "vitest";

// #273 舊系統廠商資料匯入的純邏輯（lib/erp/vendor-import.ts）：
//   標題列檢查（無標題列 → 報錯，錯誤訊息不含儲存格內容）、依名稱找欄、欄位對應、
//   note 分段合併（備註→備註一→備註二→匯款帳號，每段一行、可重跑）、地址以送貨郵遞＋送貨地址補值、
//   比對既有廠商只補空白、衝突只列欄位名、統計。
// 資料全為虛構。
import {
  DEFAULT_VENDOR_IMPORT_SHEET,
  VENDOR_HEADER_ROW_ERROR,
  VENDOR_IMPORT_HEADERS,
  VENDOR_IMPORT_MAX_LENGTH,
  buildVendorImportPlan,
  mapVendorHeaders,
  parseVendorSheet,
  summarizeVendorImport,
  vendorImportOps,
  type ExistingVendor,
} from "@/lib/erp/vendor-import";

const H = VENDOR_IMPORT_HEADERS;

/** 舊系統匯出的標題列（順序刻意與實際不同，驗證依名稱找欄）。 */
const HEADER = [
  H.name,
  H.code,
  H.address,
  "備註",
  H.phone,
  H.fax,
  H.tax_id,
  H.contact_person,
  "送貨郵遞",
  "送貨地址",
  "匯款帳號",
  "備註一",
  "備註二",
];

type RowInput = Partial<Record<string, string>>;

function row(v: RowInput): string[] {
  return HEADER.map((h) => v[h] ?? "");
}

function sheet(...rows: RowInput[]): string[][] {
  return [HEADER, ...rows.map(row)];
}

function existing(patch: Partial<ExistingVendor> = {}): ExistingVendor {
  return {
    id: "v-1",
    code: "ZV001",
    name: "測試甲廠商",
    tax_id: null,
    contact_person: null,
    phone: null,
    fax: null,
    address: null,
    note: null,
    active: true,
    ...patch,
  };
}

function parseOk(grid: string[][]) {
  const res = parseVendorSheet(grid);
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** 模擬 DB 套用 ops（只補空白、新增 active=true），回傳套用後的既有廠商。 */
function applyOps(
  before: ExistingVendor[],
  ops: ReturnType<typeof vendorImportOps>,
): ExistingVendor[] {
  const after: ExistingVendor[] = before.map((v) => {
    const u = ops.updates.find((x) => x.id === v.id);
    return u ? { ...v, ...u.patch } : v;
  });
  ops.inserts.forEach((ins, i) => {
    const { code, name, tax_id, contact_person, phone, fax, address, note } =
      ins;
    after.push({
      id: `new-${i}`,
      code,
      name,
      tax_id,
      contact_person,
      phone,
      fax,
      address,
      note,
      active: ins.active,
    });
  });
  return after;
}

describe("預設值", () => {
  it("預設工作表為「1」", () => {
    expect(DEFAULT_VENDOR_IMPORT_SHEET).toBe("1");
  });
});

describe("標題列檢查：沒有標題列直接報錯，不印儲存格內容", () => {
  it("第 1 列是資料（無標題列的工作表）→ 報錯；錯誤訊息不含任何儲存格內容", () => {
    // 模擬「工作表2」：與工作表「1」內容相同但沒有標題列
    const firstData = [
      "ZV-SECRET-01",
      "機密測試廠商",
      "測試市機密路9號",
      "月結30天",
      "00-1234-5678",
      "00-8765-4321",
      "98765432",
      "王先生 0900-000-000",
      "999",
      "測試市送貨路1號",
      "000-1234567890",
      "備註一內容",
      "備註二內容",
    ];
    const grid = [firstData, firstData.map((c) => `${c}-2`)];
    const res = parseVendorSheet(grid);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe(VENDOR_HEADER_ROW_ERROR);
    for (const c of [...grid[0], ...grid[1]]) {
      expect(res.error).not.toContain(c);
    }
    expect(res.error).toContain("廠商編號");
    expect(res.error).toContain("廠商簡稱");
    expect(res.error).toContain("有標題列的工作表");
  });

  it("缺「廠商編號」或「廠商簡稱」任一 → 報錯（同一則固定訊息）", () => {
    expect(mapVendorHeaders(["廠商簡稱", "電話"])).toEqual({
      ok: false,
      error: VENDOR_HEADER_ROW_ERROR,
    });
    expect(mapVendorHeaders(["廠商編號", "機密值X"])).toEqual({
      ok: false,
      error: VENDOR_HEADER_ROW_ERROR,
    });
  });

  it("標題列在第 2 列（第 1 列空白或其他）也不接受", () => {
    const res = parseVendorSheet([["", ""], HEADER, row({})]);
    expect(res).toEqual({ ok: false, error: VENDOR_HEADER_ROW_ERROR });
    expect(parseVendorSheet([])).toEqual({
      ok: false,
      error: VENDOR_HEADER_ROW_ERROR,
    });
  });

  it("依名稱找欄：順序打亂、空白、全形不影響；缺的選填欄只列標題名", () => {
    const res = mapVendorHeaders([" 廠商簡稱 ", "廠商編號", "備註二", "電話"]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.map.fields.code).toBe(1);
    expect(res.map.fields.name).toBe(0);
    expect(res.map.fields.phone).toBe(3);
    expect(res.map.notes).toEqual([{ label: "備註二", index: 2 }]);
    expect(res.missing).toEqual([
      "統一編號",
      "聯絡人",
      "傳真機",
      "公司地址",
      "送貨郵遞",
      "送貨地址",
      "備註",
      "備註一",
      "匯款帳號",
    ]);
  });
});

describe("parseVendorSheet：欄位對應", () => {
  it("一對一欄位；trim；空字串 → null；聯絡人混電話原文保存", () => {
    const { rows, errors } = parseOk(
      sheet({
        廠商編號: " ZV001 ",
        廠商簡稱: " 測試甲廠商 ",
        統一編號: "12345678",
        聯絡人: "王先生 0900-000-000",
        電話: "00-1111",
        傳真機: "00-2222",
        公司地址: "測試市測試路1號",
      }),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 2,
      code: "ZV001",
      values: {
        name: "測試甲廠商",
        tax_id: "12345678",
        contact_person: "王先生 0900-000-000",
        phone: "00-1111",
        fax: "00-2222",
        address: "測試市測試路1號",
      },
      noteSegments: [],
      addressFromDelivery: false,
      taxIdNonStandard: false,
    });
  });

  it("note 依序：備註 → 備註一 → 備註二 → 匯款帳號；每段「【欄名】內容」一行", () => {
    const { rows } = parseOk(
      sheet({
        廠商編號: "ZV001",
        廠商簡稱: "測試甲廠商",
        匯款帳號: "000-111",
        備註二: "二",
        備註: "月結30天",
        備註一: "一",
      }),
    );
    expect(rows[0].noteSegments).toEqual([
      "【備註】月結30天",
      "【備註一】一",
      "【備註二】二",
      "【匯款帳號】000-111",
    ]);
  });

  it("儲存格內多行 → 合成一行（每段一行，供 #274 逐行解析）", () => {
    const { rows } = parseOk(
      sheet({
        廠商編號: "ZV001",
        廠商簡稱: "測試甲廠商",
        備註: "第一行\r\n  第二行\n\n第三行",
      }),
    );
    expect(rows[0].noteSegments).toEqual(["【備註】第一行 / 第二行 / 第三行"]);
    expect(rows[0].noteSegments.every((s) => !s.includes("\n"))).toBe(true);
  });

  it("公司地址空白、有送貨地址 → 以送貨郵遞＋送貨地址補上，並在 note 加【送貨地址】", () => {
    const { rows } = parseOk(
      sheet({
        廠商編號: "ZV001",
        廠商簡稱: "測試甲廠商",
        送貨郵遞: "999",
        送貨地址: "測試市送貨路1號",
        備註: "甲",
      }),
    );
    expect(rows[0].values.address).toBe("999 測試市送貨路1號");
    expect(rows[0].addressFromDelivery).toBe(true);
    expect(rows[0].noteSegments).toEqual([
      "【備註】甲",
      "【送貨地址】999 測試市送貨路1號",
    ]);
  });

  it("公司地址有值 → 不動 address；送貨地址不同時保留在 note、相同時不加", () => {
    const { rows } = parseOk(
      sheet(
        {
          廠商編號: "ZV001",
          廠商簡稱: "測試甲廠商",
          公司地址: "測試市公司路1號",
          送貨郵遞: "999",
          送貨地址: "測試市送貨路1號",
        },
        {
          廠商編號: "ZV002",
          廠商簡稱: "測試乙廠商",
          公司地址: "999 測試市同址路2號",
          送貨郵遞: "999",
          送貨地址: "測試市同址路2號",
        },
      ),
    );
    expect(rows[0].values.address).toBe("測試市公司路1號");
    expect(rows[0].addressFromDelivery).toBe(false);
    expect(rows[0].noteSegments).toEqual(["【送貨地址】999 測試市送貨路1號"]);
    expect(rows[1].values.address).toBe("999 測試市同址路2號");
    expect(rows[1].noteSegments).toEqual([]);
  });

  it("只有送貨郵遞、沒有送貨地址 → 不補 address", () => {
    const { rows } = parseOk(
      sheet({ 廠商編號: "ZV001", 廠商簡稱: "測試甲廠商", 送貨郵遞: "999" }),
    );
    expect(rows[0].values.address).toBeNull();
    expect(rows[0].addressFromDelivery).toBe(false);
    expect(rows[0].noteSegments).toEqual([]);
  });

  it("付款條件不自動拆欄：留在 note", () => {
    const { rows } = parseOk(
      sheet({ 廠商編號: "ZV001", 廠商簡稱: "測試甲廠商", 備註: "月結30天" }),
    );
    expect(rows[0].values).not.toHaveProperty("payment_terms");
    expect(rows[0].noteSegments).toEqual(["【備註】月結30天"]);
  });

  it("統編非 8 碼 → 照原文保存並標記", () => {
    const { rows } = parseOk(
      sheet(
        { 廠商編號: "ZV001", 廠商簡稱: "甲", 統一編號: "1234567" },
        { 廠商編號: "ZV002", 廠商簡稱: "乙", 統一編號: "12345678" },
        { 廠商編號: "ZV003", 廠商簡稱: "丙" },
      ),
    );
    expect(rows.map((r) => [r.values.tax_id, r.taxIdNonStandard])).toEqual([
      ["1234567", true],
      ["12345678", false],
      [null, false],
    ]);
  });

  it("錯誤列：缺編號／缺簡稱／編號重複（不分大小寫）／編號過長；空白列略過；只含列號與欄名", () => {
    const tooLong = "Z".repeat(VENDOR_IMPORT_MAX_LENGTH.code! + 1);
    const { rows, errors } = parseOk(
      sheet(
        { 廠商編號: "ZV001", 廠商簡稱: "甲" },
        {},
        { 廠商簡稱: "機密名稱" },
        { 廠商編號: "ZV002" },
        { 廠商編號: "zv001", 廠商簡稱: "重複" },
        { 廠商編號: tooLong, 廠商簡稱: "過長" },
      ),
    );
    expect(rows.map((r) => r.code)).toEqual(["ZV001"]);
    expect(errors).toEqual([
      { line: 4, reason: "缺少廠商編號" },
      { line: 5, reason: "缺少廠商簡稱" },
      { line: 6, reason: "廠商編號與第 2 列重複" },
      { line: 7, reason: "「廠商編號」超過 500 字" },
    ]);
  });
});

describe("buildVendorImportPlan：比對既有廠商（只補空白）", () => {
  it("編號去空白、不分大小寫比對；未對到 → 新增（active=true）", () => {
    const { rows } = parseOk(
      sheet(
        { 廠商編號: "zv001", 廠商簡稱: "測試甲廠商" },
        {
          廠商編號: "ZV100",
          廠商簡稱: "新廠商",
          電話: "00-1",
          送貨郵遞: "999",
          送貨地址: "測試市送貨路1號",
          備註: "甲",
        },
      ),
    );
    const plan = buildVendorImportPlan(rows, [existing({ code: " ZV001 " })]);
    expect(plan.map((p) => [p.action, p.existingId])).toEqual([
      ["unchanged", "v-1"],
      ["insert", null],
    ]);
    expect(vendorImportOps(plan)).toEqual({
      inserts: [
        {
          code: "ZV100",
          name: "新廠商",
          tax_id: null,
          contact_person: null,
          phone: "00-1",
          fax: null,
          address: "999 測試市送貨路1號",
          note: "【備註】甲\n【送貨地址】999 測試市送貨路1號",
          active: true,
        },
      ],
      updates: [],
    });
  });

  it("對到 → 只補空白；既有值不覆蓋，不同值列為衝突（只列欄位名）", () => {
    const { rows } = parseOk(
      sheet({
        廠商編號: "ZV001",
        廠商簡稱: "測試甲廠商（新名）",
        電話: "00-2",
        傳真機: "00-3",
        統一編號: "12345678",
        聯絡人: "王先生",
        公司地址: "測試市測試路1號",
      }),
    );
    const plan = buildVendorImportPlan(rows, [
      existing({
        phone: "00-9", // 不同 → 衝突、不覆蓋
        fax: "  ", // 空白 → 補
        tax_id: " 12345678 ", // 去空白後相同
        contact_person: "王先生",
        address: null, // 空 → 補
      }),
    ]);
    expect(plan[0].action).toBe("fill");
    expect(plan[0].patch).toEqual({
      fax: "00-3",
      address: "測試市測試路1號",
    });
    expect(plan[0].conflicts).toEqual(["name", "phone"]);
    expect(vendorImportOps(plan).updates).toEqual([
      { id: "v-1", patch: { fax: "00-3", address: "測試市測試路1號" } },
    ]);
  });

  it("note 以附加方式合併（既有手寫保留），帶 note_base", () => {
    const { rows } = parseOk(
      sheet({ 廠商編號: "ZV001", 廠商簡稱: "測試甲廠商", 備註一: "一" }),
    );
    const plan = buildVendorImportPlan(rows, [existing({ note: "手寫" })]);
    expect(plan[0].patch).toEqual({ note: "手寫\n【備註一】一" });
    expect(vendorImportOps(plan).updates).toEqual([
      { id: "v-1", patch: { note: "手寫\n【備註一】一" }, note_base: "手寫" },
    ]);
  });

  it("可重跑：套用第一次結果後再比對 → 全部不變、note 不重複附加", () => {
    const grid = sheet(
      {
        廠商編號: "ZV001",
        廠商簡稱: "測試甲廠商",
        電話: "00-2",
        備註: "月結30天\n先電話",
        匯款帳號: "000-111",
      },
      {
        廠商編號: "ZV100",
        廠商簡稱: "新廠商",
        送貨郵遞: "999",
        送貨地址: "測試市送貨路1號",
        備註二: "二",
      },
    );
    const before = [existing({ note: "手寫" })];
    const first = buildVendorImportPlan(parseOk(grid).rows, before);
    expect(first.map((p) => p.action)).toEqual(["fill", "insert"]);
    const after = applyOps(before, vendorImportOps(first));
    expect(after[0].note).toBe(
      "手寫\n【備註】月結30天 / 先電話\n【匯款帳號】000-111",
    );

    const second = buildVendorImportPlan(parseOk(grid).rows, after);
    expect(second.map((p) => p.action)).toEqual(["unchanged", "unchanged"]);
    expect(vendorImportOps(second)).toEqual({ inserts: [], updates: [] });
  });
});

describe("summarizeVendorImport：統計（不含任何值）", () => {
  it("新增／補欄位／不變／衝突欄位／統編非 8 碼／地址由送貨地址補／錯誤列", () => {
    const parsed = parseOk(
      sheet(
        { 廠商編號: "ZV001", 廠商簡稱: "測試甲廠商", 電話: "00-2" },
        { 廠商編號: "ZV002", 廠商簡稱: "不同名稱", 電話: "00-3" },
        { 廠商編號: "ZV003", 廠商簡稱: "測試丙" },
        {
          廠商編號: "ZV100",
          廠商簡稱: "新廠商",
          統一編號: "123",
          送貨地址: "測試市送貨路1號",
        },
        { 廠商簡稱: "缺編號" },
      ),
    );
    const plan = buildVendorImportPlan(parsed.rows, [
      existing({ id: "a", code: "ZV001", name: "測試甲廠商" }),
      existing({ id: "b", code: "ZV002", name: "測試乙", phone: "00-9" }),
      existing({ id: "c", code: "ZV003", name: "測試丙", active: false }),
      existing({ id: "d", code: "ZV999", name: "檔案外廠商" }),
    ]);
    expect(summarizeVendorImport(plan, parsed.errors, 4)).toEqual({
      rows: 4,
      insert: 1,
      fill: 1,
      unchanged: 2,
      filledByField: { phone: 1 },
      conflictRows: 1,
      conflictsByField: { name: 1, phone: 1 },
      taxIdNonStandard: 1,
      addressFromDelivery: 1,
      matchedInactive: 1,
      existingUnmatched: 1,
      errors: [{ line: 6, reason: "缺少廠商編號" }],
    });
  });
});
