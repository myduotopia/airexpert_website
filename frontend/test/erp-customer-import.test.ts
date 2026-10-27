import { describe, expect, it } from "vitest";

// #266 舊系統客戶資料匯入的純邏輯（lib/erp/customer-import.ts）：
//   標題對應（依名稱、不依位置）、(FA) → FB、送貨郵遞＋地址合併、note 分段合併（可重跑）、
//   Email 失敗改寫入 note、比對既有客戶只補空白、衝突只列欄位名、統計。
// 資料全為虛構。
import {
  CUSTOMER_IMPORT_HEADERS,
  CUSTOMER_IMPORT_MAX_LENGTH,
  DEFAULT_CUSTOMER_IMPORT_SHEET,
  buildCustomerImportPlan,
  combineDeliveryAddress,
  customerImportOps,
  hasFaMark,
  mapCustomerHeaders,
  mergeNote,
  parseCustomerSheet,
  summarizeCustomerImport,
  type ExistingCustomer,
} from "@/lib/erp/customer-import";

const H = CUSTOMER_IMPORT_HEADERS;

/** 舊系統匯出的標題列（順序刻意打亂，驗證依名稱找欄）。 */
const HEADER = [
  H.name,
  H.code,
  "客戶簡稱備註說明",
  H.tax_id,
  H.payment_terms,
  "報價聯絡方式（傳真/L/MAIL）",
  H.source,
  H.contact_person,
  H.mail_recipient,
  H.phone,
  H.fax,
  H.address,
  "送貨郵遞",
  "送貨地址",
  "開戶帳號",
  "備註一",
  "備註二",
  "備註三",
  "備註四",
  "備註五",
  "Memo",
  "E-Mail",
];

type RowInput = Partial<Record<string, string>>;

/** 依標題名稱組一列（未給的欄位為空字串）。 */
function row(v: RowInput): string[] {
  return HEADER.map((h) => v[h] ?? "");
}

function sheet(...rows: RowInput[]): string[][] {
  return [HEADER, ...rows.map(row)];
}

function existing(patch: Partial<ExistingCustomer> = {}): ExistingCustomer {
  return {
    id: "c-1",
    code: "ZZ001",
    name: "測試甲公司",
    tax_id: null,
    payment_terms: null,
    contact_person: null,
    mail_recipient: null,
    phone: null,
    fax: null,
    address: null,
    delivery_address: null,
    email: null,
    note: null,
    source: null,
    erp_active: true,
    ...patch,
  };
}

function parseOk(grid: string[][]) {
  const res = parseCustomerSheet(grid);
  if (!res.ok) throw new Error(res.error);
  return res;
}

describe("預設值", () => {
  it("預設工作表為「工作表4」", () => {
    expect(DEFAULT_CUSTOMER_IMPORT_SHEET).toBe("工作表4");
  });
});

describe("mapCustomerHeaders：依標題名稱找欄", () => {
  it("順序打亂仍對得上；全形括號、空白、大小寫不影響", () => {
    const res = mapCustomerHeaders([
      " 客戶簡稱 ",
      "客戶編號",
      "報價聯絡方式 (傳真/L/MAIL)",
      "e-mail",
      "MEMO",
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.map.fields.code).toBe(1);
    expect(res.map.fields.name).toBe(0);
    expect(res.map.email).toBe(3);
    expect(res.map.notes.map((n) => [n.label, n.index])).toEqual([
      ["報價聯絡方式(傳真/L/MAIL)", 2],
      ["Memo", 4],
    ]);
    // 沒有的選填欄位列為 missing（只列標題名稱）
    expect(res.missing).toContain("電話");
    expect(res.missing).not.toContain("客戶編號");
  });

  it("缺少客戶編號或客戶簡稱 → 錯誤", () => {
    expect(mapCustomerHeaders(["客戶簡稱", "電話"])).toEqual({
      ok: false,
      error: "找不到標題「客戶編號」（標題列需在第 1 列）。",
    });
    expect(mapCustomerHeaders(["客戶編號"]).ok).toBe(false);
  });
});

describe("hasFaMark：名稱含 (FA) → FB 客戶", () => {
  it.each([
    ["測試甲(FA)", true],
    ["測試甲（FA）", true],
    ["測試甲 ( fa )", true],
    ["(Fa)測試甲", true],
    ["測試甲（ ＦＡ ）", true],
    ["測試甲(F)", false],
    ["測試甲(FAX)", false],
    ["測試甲 FA", false],
    ["測試甲(LMF)", false],
  ])("%s → %s", (name, expected) => {
    expect(hasFaMark(name)).toBe(expected);
  });
});

describe("combineDeliveryAddress：送貨郵遞＋送貨地址", () => {
  it.each([
    ["999", "測試市測試路1號", "999 測試市測試路1號"],
    [" 99901 ", " 測試市測試路1號 ", "99901 測試市測試路1號"],
    ["測試郵遞", "測試市測試路1號", "測試郵遞 測試市測試路1號"],
    ["", "測試市測試路1號", "測試市測試路1號"],
    ["999", "", "999"],
    ["", "", null],
    // 地址本身已以郵遞區號開頭 → 不重複加
    ["999", "999測試市測試路1號", "999測試市測試路1號"],
  ])("%j + %j → %j", (zip, addr, expected) => {
    expect(combineDeliveryAddress(zip, addr)).toBe(expected);
  });
});

describe("parseCustomerSheet：欄位對應", () => {
  it("一般欄位 trim、空字串視為 null、名稱維持原文", () => {
    const { rows, errors } = parseOk(
      sheet({
        客戶編號: " ZZ001 ",
        客戶簡稱: " 測試甲公司(FA) ",
        統一編號: "12345678",
        付款方式: " 月結30天 ",
        聯絡人: "王先生 0900-000-000",
        收信人: "  ",
        電話: "00-0000000",
        傳真機: "00-0000001",
        公司地址: "測試市測試路1號",
        送貨郵遞: "999",
        送貨地址: "測試市測試路2號",
      }),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 2,
      code: "ZZ001",
      values: {
        name: "測試甲公司(FA)",
        tax_id: "12345678",
        payment_terms: "月結30天",
        contact_person: "王先生 0900-000-000",
        mail_recipient: null,
        phone: "00-0000000",
        fax: "00-0000001",
        address: "測試市測試路1號",
        delivery_address: "999 測試市測試路2號",
        email: null,
      },
      source: "FB",
      faMark: true,
    });
  });

  it("note：依序合併各備註欄，每段【欄名】內容，以換行分隔，空白欄略過", () => {
    const { rows } = parseOk(
      sheet({
        客戶編號: "ZZ002",
        客戶簡稱: "測試乙",
        Memo: "備忘",
        備註三: "第三",
        備註一: " 第一 ",
        "報價聯絡方式（傳真/L/MAIL）": "L",
        客戶簡稱備註說明: "說明",
        開戶帳號: "000-000",
        備註二: "   ",
      }),
    );
    expect(rows[0].noteSegments).toEqual([
      "【客戶簡稱備註說明】說明",
      "【報價聯絡方式(傳真/L/MAIL)】L",
      "【開戶帳號】000-000",
      "【備註一】第一",
      "【備註三】第三",
      "【Memo】備忘",
    ]);
  });

  it("source：只有「客戶來源」→ 原文；兩者皆有 → FB，原文寫入 note 的【客戶來源】", () => {
    const { rows } = parseOk(
      sheet(
        { 客戶編號: "ZZ003", 客戶簡稱: "測試丙", 客戶來源: " 展覽 " },
        { 客戶編號: "ZZ004", 客戶簡稱: "測試丁（FA）", 客戶來源: "介紹" },
        { 客戶編號: "ZZ005", 客戶簡稱: "測試戊" },
        { 客戶編號: "ZZ006", 客戶簡稱: "測試己", 客戶來源: "fb" },
      ),
    );
    expect(rows.map((r) => [r.source, r.faMark])).toEqual([
      ["展覽", false],
      ["FB", true],
      [null, false],
      ["FB", false],
    ]);
    expect(rows[1].noteSegments).toEqual(["【客戶來源】介紹"]);
    expect(rows[0].noteSegments).toEqual([]);
  });

  it("E-Mail：多筆正規化；格式失敗 → email 留空、原文放 note 並標示，不中止", () => {
    const { rows, errors } = parseOk(
      sheet(
        {
          客戶編號: "ZZ007",
          客戶簡稱: "測試庚",
          "E-Mail": "a@example.com，b@example.com",
        },
        {
          客戶編號: "ZZ008",
          客戶簡稱: "測試辛",
          "E-Mail": "會計 a@example",
          備註一: "一",
        },
      ),
    );
    expect(errors).toEqual([]);
    expect(rows[0].values.email).toBe("a@example.com; b@example.com");
    expect(rows[0].emailInvalid).toBe(false);
    expect(rows[1].values.email).toBeNull();
    expect(rows[1].emailInvalid).toBe(true);
    expect(rows[1].noteSegments).toEqual([
      "【備註一】一",
      "【E-Mail】會計 a@example（Email 格式待確認）",
    ]);
  });

  it("統編非 8 位數字 → 原文保存、標記 taxIdNonStandard", () => {
    const { rows } = parseOk(
      sheet(
        { 客戶編號: "ZZ009", 客戶簡稱: "測試壬", 統一編號: "測試文字" },
        { 客戶編號: "ZZ010", 客戶簡稱: "測試癸", 統一編號: "12345678" },
      ),
    );
    expect(rows[0].values.tax_id).toBe("測試文字");
    expect(rows.map((r) => r.taxIdNonStandard)).toEqual([true, false]);
  });

  it("錯誤列只回列號與原因（不含值）；空白列略過", () => {
    const { rows, errors } = parseOk(
      sheet(
        { 客戶編號: "ZZ011", 客戶簡稱: "測試一" },
        {},
        { 客戶簡稱: "沒有編號" },
        { 客戶編號: "ZZ012" },
        { 客戶編號: "zz011 ", 客戶簡稱: "重複編號" },
        { 客戶編號: "ZZ013", 客戶簡稱: "測試二", 電話: "1".repeat(501) },
      ),
    );
    expect(rows.map((r) => r.code)).toEqual(["ZZ011"]);
    expect(errors).toEqual([
      { line: 4, reason: "缺少客戶編號" },
      { line: 5, reason: "缺少客戶簡稱" },
      { line: 6, reason: "客戶編號與第 2 列重複" },
      {
        line: 7,
        reason: `「電話」超過 ${CUSTOMER_IMPORT_MAX_LENGTH.phone} 字`,
      },
    ]);
    for (const e of errors) {
      expect(e.reason).not.toMatch(/測試|沒有編號|重複編號|ZZ/);
    }
  });

  it("標題列缺必要欄 → ok:false", () => {
    const res = parseCustomerSheet([["客戶簡稱"], ["測試"]]);
    expect(res.ok).toBe(false);
  });
});

describe("mergeNote：與既有 note 合併（可重跑）", () => {
  it("既有為空 → 直接寫入各段", () => {
    expect(mergeNote(null, ["【備註一】一", "【Memo】二"])).toBe(
      "【備註一】一\n【Memo】二",
    );
    expect(mergeNote("  ", ["【備註一】一"])).toBe("【備註一】一");
  });

  it("沒有新段落 → 回傳既有值（同一字串）", () => {
    expect(mergeNote("手寫備註", [])).toBe("手寫備註");
    expect(mergeNote(null, [])).toBeNull();
  });

  it("附加在既有內容之後；已存在的段落不重複附加", () => {
    const once = mergeNote("手寫備註", ["【備註一】一", "【Memo】二"]);
    expect(once).toBe("手寫備註\n【備註一】一\n【Memo】二");
    expect(mergeNote(once, ["【備註一】一", "【Memo】二"])).toBe(once);
  });

  it("只認整行相同的段落（前綴相同不算已存在）；CRLF 也認得", () => {
    expect(mergeNote("【備註一】一二", ["【備註一】一"])).toBe(
      "【備註一】一二\n【備註一】一",
    );
    expect(mergeNote("x\r\n【備註一】一\r\n", ["【備註一】一"])).toBe(
      "x\r\n【備註一】一\r\n",
    );
  });

  it("多行內容的段落：整段相同才算已存在", () => {
    const seg = "【Memo】第一行\n第二行";
    const once = mergeNote("手寫", [seg]);
    expect(once).toBe("手寫\n【Memo】第一行\n第二行");
    expect(mergeNote(once, [seg])).toBe(once);
  });
});

describe("buildCustomerImportPlan：比對既有客戶", () => {
  it("編號不分大小寫、去空白比對；未對到 → 新增（erp_active=true）", () => {
    const { rows } = parseOk(
      sheet(
        { 客戶編號: "zz001", 客戶簡稱: "測試甲公司" },
        {
          客戶編號: "ZZ100",
          客戶簡稱: "新客戶(FA)",
          電話: "00-1",
          備註一: "一",
        },
      ),
    );
    const plan = buildCustomerImportPlan(rows, [existing({ code: " ZZ001 " })]);
    expect(plan[0]).toMatchObject({
      action: "unchanged",
      existingId: "c-1",
    });
    expect(plan[1]).toMatchObject({ action: "insert", existingId: null });
    const ops = customerImportOps(plan);
    expect(ops.inserts).toEqual([
      {
        code: "ZZ100",
        name: "新客戶(FA)",
        tax_id: null,
        payment_terms: null,
        contact_person: null,
        mail_recipient: null,
        phone: "00-1",
        fax: null,
        address: null,
        delivery_address: null,
        email: null,
        note: "【備註一】一",
        source: "FB",
        erp_active: true,
      },
    ]);
    expect(ops.updates).toEqual([]);
  });

  it("對到 → 只補空白欄位；既有值不覆蓋，不同值列為衝突（只列欄位）", () => {
    const { rows } = parseOk(
      sheet({
        客戶編號: "ZZ001",
        客戶簡稱: "測試甲公司（新名）",
        電話: "00-2",
        傳真機: "00-3",
        統一編號: "12345678",
        聯絡人: "李小姐",
        "E-Mail": "A@Example.com",
      }),
    );
    const plan = buildCustomerImportPlan(rows, [
      existing({
        phone: "00-9", // 不同 → 衝突、不覆蓋
        fax: "  ", // 空白 → 補
        tax_id: "12345678", // 相同 → 不變
        contact_person: "李小姐", // 相同
        email: "a@example.com", // 大小寫不同視為相同
      }),
    ]);
    expect(plan[0].action).toBe("fill");
    expect(plan[0].patch).toEqual({ fax: "00-3" });
    expect(plan[0].conflicts).toEqual(["name", "phone"]);
    expect(customerImportOps(plan).updates).toEqual([
      { id: "c-1", patch: { fax: "00-3" } },
    ]);
  });

  it("source：既有為空才補；既有不同 → 衝突", () => {
    const { rows } = parseOk(
      sheet(
        { 客戶編號: "ZZ001", 客戶簡稱: "測試甲公司(FA)" },
        { 客戶編號: "ZZ002", 客戶簡稱: "測試乙(FA)" },
        { 客戶編號: "ZZ003", 客戶簡稱: "測試丙(FA)" },
      ),
    );
    const plan = buildCustomerImportPlan(rows, [
      existing({ id: "a", code: "ZZ001", name: "測試甲公司(FA)" }),
      existing({ id: "b", code: "ZZ002", name: "測試乙(FA)", source: "展覽" }),
      existing({ id: "c", code: "ZZ003", name: "測試丙(FA)", source: "fb" }),
    ]);
    expect(plan.map((p) => [p.action, p.patch, p.conflicts])).toEqual([
      ["fill", { source: "FB" }, []],
      ["unchanged", {}, ["source"]],
      ["unchanged", {}, []],
    ]);
  });

  it("note 以附加方式合併，帶 note_base 供寫入時確認未被改動", () => {
    const { rows } = parseOk(
      sheet({ 客戶編號: "ZZ001", 客戶簡稱: "測試甲公司", 備註一: "一" }),
    );
    const plan = buildCustomerImportPlan(rows, [existing({ note: "手寫" })]);
    expect(plan[0].action).toBe("fill");
    expect(plan[0].patch).toEqual({ note: "手寫\n【備註一】一" });
    expect(customerImportOps(plan).updates).toEqual([
      { id: "c-1", patch: { note: "手寫\n【備註一】一" }, note_base: "手寫" },
    ]);
  });

  it("可重跑：套用第一次的結果後再比對 → 全部不變", () => {
    const grid = sheet(
      {
        客戶編號: "ZZ001",
        客戶簡稱: "測試甲公司",
        電話: "00-2",
        備註一: "一",
        "E-Mail": "壞掉的信箱",
      },
      { 客戶編號: "ZZ100", 客戶簡稱: "新客戶(FA)", 客戶來源: "介紹" },
    );
    const { rows } = parseOk(grid);
    const before = [existing({ note: "手寫" })];
    const first = buildCustomerImportPlan(rows, before);
    const ops = customerImportOps(first);

    // 模擬 DB 套用（只補空白）
    const after: ExistingCustomer[] = before.map((c) => {
      const u = ops.updates.find((x) => x.id === c.id);
      return u ? { ...c, ...u.patch } : c;
    });
    ops.inserts.forEach((ins, i) =>
      after.push({ id: `new-${i}`, ...ins } as ExistingCustomer),
    );

    const second = buildCustomerImportPlan(parseOk(grid).rows, after);
    expect(second.map((p) => p.action)).toEqual(["unchanged", "unchanged"]);
    expect(customerImportOps(second)).toEqual({ inserts: [], updates: [] });
  });
});

describe("summarizeCustomerImport：統計（不含個資）", () => {
  it("新增／補欄位／不變／衝突欄位／FB／Email 待確認／錯誤列", () => {
    const parsed = parseOk(
      sheet(
        { 客戶編號: "ZZ001", 客戶簡稱: "測試甲公司(FA)", 電話: "00-2" },
        { 客戶編號: "ZZ002", 客戶簡稱: "不同名稱", 電話: "00-3" },
        { 客戶編號: "ZZ003", 客戶簡稱: "測試丙" },
        {
          客戶編號: "ZZ100",
          客戶簡稱: "新客戶(FA)",
          "E-Mail": "x",
          統一編號: "123",
        },
        { 客戶簡稱: "缺編號" },
      ),
    );
    const plan = buildCustomerImportPlan(parsed.rows, [
      existing({ id: "a", code: "ZZ001", name: "測試甲公司(FA)" }),
      existing({ id: "b", code: "ZZ002", name: "測試乙", phone: "00-9" }),
      existing({ id: "c", code: "ZZ003", name: "測試丙", erp_active: false }),
      existing({ id: "d", code: "ZZ999", name: "檔案外客戶" }),
    ]);
    const s = summarizeCustomerImport(plan, parsed.errors, 4);
    expect(s).toEqual({
      rows: 4,
      insert: 1,
      fill: 1,
      unchanged: 2,
      filledByField: { phone: 1, source: 1 },
      conflictRows: 1,
      conflictsByField: { name: 1, phone: 1 },
      fb: 2,
      emailInvalid: 1,
      taxIdNonStandard: 1,
      matchedErpInactive: 1,
      existingUnmatched: 1,
      errors: [{ line: 6, reason: "缺少客戶編號" }],
    });
  });
});
