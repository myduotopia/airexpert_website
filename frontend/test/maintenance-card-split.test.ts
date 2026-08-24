import { describe, it, expect } from "vitest";
import {
  buildCardDrafts,
  splitFilterPlusSuffix,
  classifyRecord,
  detectCardKind,
  filterCardSerial,
  filterCellText,
  isFilterHeaderText,
  normalizeCardHeader,
  parseBelongsTo,
  parseCardKind,
  shouldImportFilterCard,
  splitRecordsByCard,
  suggestFilterColumns,
  type CardBasicDraft,
} from "@/lib/admin/maintenance-card-split";
import { parseExtraction } from "@/lib/admin/maintenance-normalize";
import type { RecordPayload } from "@/lib/admin/maintenance-normalize";

// ── fixture：三張實際照片上寫的內容 ──────────────────────────────
//
// 檔案位置皆在 repo 的 old_website_data/。
// A = 1787019553717.jpg          整張其實是過濾系統卡
// B = 1787033191871.jpg /
//     8bd6416d...829_0.jpg       同一張卡：空壓機 J751307001 + 過濾 100HA
// C = 658362223...42e7_0.jpg     同一台機器（機號 J751307001、KK123-1）的另一張卡，
//                                過濾系統寫成機型行尾的「＋100HA」→ 一樣是混合卡
// D = 合成 fixture               純空壓機卡：表頭無任何過濾標記、列中亦無乾燥機內容

const EMPTY: RecordPayload = {
  service_date: null,
  hours: null,
  oil: null,
  oil_filter: null,
  air_filter: null,
  oil_separator: null,
  inverter: null,
  filter_system: null,
  technician: null,
  note: null,
  service_type: null,
};

function rec(partial: Partial<RecordPayload>): RecordPayload {
  return { ...EMPTY, ...partial };
}

function basic(partial: Partial<CardBasicDraft>): CardBasicDraft {
  return {
    customer_name: "",
    customer_code: "",
    serial_no: "",
    machine_no: "",
    location: "",
    purchased_at: "",
    model: "",
    horsepower: "",
    voltage: "",
    filter_spec: "",
    drain_spec: "",
    ...partial,
  };
}

/** A：客戶「本源興(股)公司(三廠)25」，機號的位置寫「過濾 AL 010N + LM-P-010」。 */
const CARD_A = {
  basic: basic({
    customer_name: "本源興(股)公司(三廠)25",
    customer_code: "KK321-3",
    // AI 常把這串塞進 serial_no（它就寫在機號的位置）。
    serial_no: "過濾 AL 010N + LM-P-010",
    location: "桃園市蘆竹區長安路2段120巷17號",
    model: "BMF8-8",
    horsepower: "10HP",
    voltage: "220V",
  }),
  records: [
    rec({
      service_date: "2023-03-13",
      hours: "3474",
      oil: "例",
      technician: "傑.政",
    }),
    rec({
      service_date: "2023-04-19",
      hours: "3474",
      oil: "例",
      technician: "勳",
    }),
    rec({ service_date: "2023-08-07", note: "沒在用", technician: "傑.政" }),
    rec({
      service_date: "2023-12-12",
      hours: "3475",
      note: "沒在用",
      technician: "傑",
    }),
    rec({
      service_date: "2024-08-02",
      hours: "3504",
      oil: "例",
      note: "未開",
      technician: "傑.政",
    }),
    rec({
      service_date: "2024-11-08",
      hours: "3504",
      oil: "例",
      technician: "政.江",
    }),
    rec({
      service_date: "2025-12-17",
      hours: "3527",
      oil: "例",
      technician: "江",
    }),
    rec({
      service_date: "2026-01-14",
      hours: "3595",
      oil: "例",
      technician: "江",
    }),
    rec({
      service_date: "2026-03-18",
      hours: "3767",
      inverter: "油鏡×1只",
      technician: "江",
    }),
  ],
};

/** B：表頭「機號J751307001 過濾100HA」，紅框內的乾燥機列屬過濾卡。 */
const CARD_B = {
  basic: basic({
    customer_name: "和成欣業(股)公司(二廠) 25",
    customer_code: "KK123-1",
    serial_no: "J751307001",
    filter_spec: "過濾100HA",
    location: "鶯歌區八德路1號(二廠)",
    model: "JNV75/8",
    horsepower: "100HP",
    voltage: "380V",
  }),
  records: [
    rec({
      service_date: "2024-10-09",
      hours: "41302",
      oil: "例",
      technician: "傑",
    }),
    rec({
      service_date: "2024-11-27",
      hours: "41997",
      oil: "例",
      technician: "傑",
    }),
    // 變頻器欄的「散熱器組清洗」是空壓機本體的散熱器，不是乾燥機。
    rec({
      service_date: "2025-02-11",
      hours: "42972",
      oil: "4",
      oil_filter: "1",
      inverter: "散熱器組清洗",
      technician: "傑.江",
    }),
    // 紅框外，但明確是乾燥機 → 過濾卡。
    rec({
      service_date: "2025-06-18",
      filter_system: '乾燥機12"散熱馬達+葉片 16V×1',
      technician: "政.江",
    }),
    rec({ service_date: "2025-07-09", technician: "傑.政" }),
    rec({
      service_date: "2025-08-11",
      hours: "44510",
      oil: "例",
      technician: "江",
    }),
    rec({ service_date: "2025-11-11", note: "馬達修理×1式" }),
    rec({
      service_date: "2025-11-24",
      hours: "45013",
      oil: "1",
      oil_filter: "1",
      inverter: "油鏡×1只",
      filter_system: "散熱器組清潔",
      technician: "傑",
    }),
    // ↓ 紅框內：乾燥機用散熱馬達 / 葉片 → 過濾卡
    rec({
      service_date: "2026-01-23",
      filter_system: '乾燥機用散熱馬達12"×2只 〃葉片12"×2只',
      technician: "江",
    }),
    rec({
      service_date: "2026-05-19",
      filter_system: "乾燥機 同上 ×1組",
      technician: "傑.周",
    }),
    rec({
      service_date: "2026-06-18",
      hours: "46590",
      oil: "例",
      technician: "江",
    }),
  ],
};

/**
 * C：表頭是「A01 銅器部 機型JNV75/8 馬力100HP 電壓380V ＋100HA」+「機號J751307001」。
 * 「＋100HA」＝過濾系統 100HA（與 B 同一台機器），只是沒寫「過濾」二字。
 * 這裡刻意用「AI 把加號註記留在電壓欄」的樣子，測本地表頭正規化能不能撈出來。
 */
const CARD_C = {
  basic: basic({
    customer_name: "和成欣業(股)公司(二廠) 25",
    customer_code: "KK123-1",
    serial_no: "J751307001",
    location: "鶯歌區八德路1號(二廠)",
    model: "JNV75/8",
    horsepower: "100HP",
    voltage: "380V ＋100HA",
  }),
  records: [
    rec({
      service_date: "2023-03-29",
      hours: "34446",
      oil: "3",
      oil_filter: "1",
      oil_separator: "1",
      inverter: "散熱溶劑清洗",
      technician: "傑",
    }),
    rec({
      service_date: "2023-05-15",
      hours: "35018",
      filter_system: "AD480×1",
      technician: "傑",
    }),
    rec({ service_date: "2023-06-20", inverter: '乾燥機12"散熱馬達+葉片' }),
    rec({
      service_date: "2023-07-12",
      hours: "35818",
      oil: "例",
      technician: "傑.勳",
    }),
    rec({
      service_date: "2023-08-08",
      hours: "36883",
      oil: "例",
      technician: "勳",
    }),
    rec({
      service_date: "2024-03-04",
      hours: "38602",
      inverter: '乾修:12"馬達+葉片 空修:變頻器內風扇',
      technician: "傑.政",
    }),
  ],
};

/**
 * D：合成的「純空壓機卡」。守住 #158 的硬性不變量——
 * 表頭沒有任何過濾系統標記、列中也沒有乾燥機內容時，只能產生一張卡，
 * 且絕不可生出一張空的過濾卡。列裡刻意放了「散熱器組清洗 / 散熱溶劑清洗」
 * （空壓機本體的散熱器）與型號中的加號，測分流規則不會被這些字樣誤觸發。
 */
const CARD_D = {
  basic: basic({
    customer_name: "測試工業(股)公司",
    customer_code: "KC054",
    serial_no: "J751307002",
    location: "桃園市蘆竹區長安路2段120巷17號",
    model: "JNV75/8",
    horsepower: "100HP",
    voltage: "380V",
  }),
  records: [
    rec({
      service_date: "2023-03-29",
      hours: "34446",
      oil: "3",
      oil_filter: "1",
      oil_separator: "1",
      inverter: "散熱溶劑清洗",
      technician: "傑",
    }),
    rec({
      service_date: "2023-07-12",
      hours: "35818",
      oil: "例",
      technician: "傑.勳",
    }),
    rec({
      service_date: "2025-02-11",
      hours: "42972",
      oil: "4",
      oil_filter: "1",
      inverter: "散熱器組清洗",
      technician: "傑.江",
    }),
    rec({
      service_date: "2025-11-24",
      hours: "45013",
      filter_system: "散熱器組清潔",
      technician: "傑",
    }),
    rec({
      service_date: "2023-08-01",
      note: "彈性元件×1／回油視窗(1B 1.5 雙外)×1",
    }),
  ],
};

// ── 表頭判定 ──────────────────────────────────────────────────────

describe("isFilterHeaderText / filterCardSerial", () => {
  it("認得以「過濾」開頭的機號欄", () => {
    expect(isFilterHeaderText("過濾 AL 010N + LM-P-010")).toBe(true);
    expect(isFilterHeaderText("過濾100HA")).toBe(true);
    expect(isFilterHeaderText("J751307001")).toBe(false);
    expect(isFilterHeaderText(null)).toBe(false);
  });

  it("整串是「＋100HA」這類加號註記也算過濾器型號", () => {
    expect(isFilterHeaderText("＋100HA")).toBe(true);
    expect(isFilterHeaderText("+100HA")).toBe(true);
    expect(isFilterHeaderText("+ 100HA")).toBe(true);
  });

  it("去掉「過濾」/「＋」前綴當過濾卡的機號建議值", () => {
    expect(filterCardSerial("過濾100HA")).toBe("100HA");
    expect(filterCardSerial("過濾 AL 010N + LM-P-010")).toBe(
      "AL 010N + LM-P-010",
    );
    expect(filterCardSerial("過濾器EA350-Q")).toBe("EA350-Q");
    expect(filterCardSerial("＋100HA")).toBe("100HA");
    expect(filterCardSerial("+ 100HA")).toBe("100HA");
    expect(filterCardSerial(null)).toBe("");
  });
});

describe("splitFilterPlusSuffix — 只認行尾的「加號 + 型號」", () => {
  it("切出加號註記，前段保留原文", () => {
    expect(splitFilterPlusSuffix("380V ＋100HA")).toEqual(["380V", "＋100HA"]);
    expect(splitFilterPlusSuffix("380V+100HA")).toEqual(["380V", "+100HA"]);
    expect(splitFilterPlusSuffix("380V + 100HA")).toEqual(["380V", "+ 100HA"]);
    expect(splitFilterPlusSuffix("J751307001 ＋100HA")).toEqual([
      "J751307001",
      "＋100HA",
    ]);
  });

  it("近似但不是註記的字串一律不動（避免無中生有過濾卡）", () => {
    // 加號後面是中文（維護內容常見的「馬達+葉片」）。
    expect(splitFilterPlusSuffix('12"馬達+葉片')).toEqual(['12"馬達+葉片', ""]);
    // 加號後面沒有東西。
    expect(splitFilterPlusSuffix("TA-100+")).toEqual(["TA-100+", ""]);
    // 加號後面純數字，看不出是型號。
    expect(splitFilterPlusSuffix("JNV75/8+3")).toEqual(["JNV75/8+3", ""]);
    // 加號後面純英文，同樣不算。
    expect(splitFilterPlusSuffix("JNV75/8+AB")).toEqual(["JNV75/8+AB", ""]);
    // 註記不在字串結尾。
    expect(splitFilterPlusSuffix("+100HA 馬力100HP")).toEqual([
      "+100HA 馬力100HP",
      "",
    ]);
    // 根本沒有加號。
    expect(splitFilterPlusSuffix("220V/380V")).toEqual(["220V/380V", ""]);
    expect(splitFilterPlusSuffix(null)).toEqual(["", ""]);
  });
});

describe("detectCardKind", () => {
  it("A：機號的位置寫「過濾 …」→ filter", () => {
    expect(detectCardKind({ serial_no: "過濾 AL 010N + LM-P-010" })).toBe(
      "filter",
    );
  });

  it("B：機號 + 過濾型號都有 → mixed", () => {
    expect(
      detectCardKind({ serial_no: "J751307001", filter_spec: "過濾100HA" }),
    ).toBe("mixed");
  });

  it("D：只有機號 → compressor（不可無中生有過濾卡）", () => {
    expect(detectCardKind({ serial_no: "J751307001" })).toBe("compressor");
    expect(detectCardKind({ serial_no: "J751307001", filter_spec: "  " })).toBe(
      "compressor",
    );
  });

  it("機號空白、只有過濾型號 → filter；兩者皆空 → compressor", () => {
    expect(detectCardKind({ filter_spec: "AL 010N" })).toBe("filter");
    expect(detectCardKind({})).toBe("compressor");
  });
});

describe("normalizeCardHeader", () => {
  it("A：把機號欄的「過濾 …」整串搬到 filter_spec，機號留空", () => {
    const h = normalizeCardHeader(CARD_A.basic);
    expect(h.kind).toBe("filter");
    expect(h.serial_no).toBe("");
    expect(h.filter_spec).toBe("過濾 AL 010N + LM-P-010");
  });

  it("容錯：AI 把整行「J751307001 過濾100HA」塞進 serial_no → 切成 mixed", () => {
    const h = normalizeCardHeader({ serial_no: "J751307001 過濾100HA" });
    expect(h.kind).toBe("mixed");
    expect(h.serial_no).toBe("J751307001");
    expect(h.filter_spec).toBe("過濾100HA");
  });

  it("C：電壓欄尾端的「＋100HA」搬進 filter_spec，電壓只留 380V", () => {
    const h = normalizeCardHeader(CARD_C.basic);
    expect(h.kind).toBe("mixed");
    expect(h.serial_no).toBe("J751307001");
    expect(h.filter_spec).toBe("＋100HA");
    expect(h.voltage).toBe("380V");
    expect(h.model).toBe("JNV75/8");
  });

  it("C 變體：加號註記黏在機號行 / 機型欄也撈得到", () => {
    expect(
      normalizeCardHeader({ serial_no: "J751307001 ＋100HA" }),
    ).toMatchObject({
      kind: "mixed",
      serial_no: "J751307001",
      filter_spec: "＋100HA",
    });
    expect(
      normalizeCardHeader({ serial_no: "J751307001", model: "JNV75/8+100HA" }),
    ).toMatchObject({ kind: "mixed", model: "JNV75/8", filter_spec: "+100HA" });
  });

  it("D：沒有任何過濾標記就不動", () => {
    const h = normalizeCardHeader(CARD_D.basic);
    expect(h.kind).toBe("compressor");
    expect(h.serial_no).toBe("J751307002");
    expect(h.filter_spec).toBe("");
    expect(h.voltage).toBe("380V");
  });

  it("已有 filter_spec 時不再挖掘（冪等：跑兩次結果相同）", () => {
    const once = normalizeCardHeader(CARD_C.basic);
    const twice = normalizeCardHeader(once);
    expect(twice).toEqual(once);
  });

  it("型號中的加號不會被當成過濾標記", () => {
    expect(
      normalizeCardHeader({
        serial_no: "J751307001",
        model: "BMF8-8",
        voltage: "220V/380V",
      }).kind,
    ).toBe("compressor");
    expect(
      normalizeCardHeader({ serial_no: "J751307001", model: "TA-100+" }).kind,
    ).toBe("compressor");
    expect(
      normalizeCardHeader({ serial_no: "J751307001", model: '12"馬達+葉片' })
        .kind,
    ).toBe("compressor");
  });
});

// ── 列的歸屬 ──────────────────────────────────────────────────────

describe("classifyRecord", () => {
  it("乾燥機 / 散熱馬達 / 葉片 → filter", () => {
    expect(
      classifyRecord(
        rec({ filter_system: '乾燥機用散熱馬達12"×2只 〃葉片12"×2只' }),
      ),
    ).toBe("filter");
    expect(classifyRecord(rec({ filter_system: "乾燥機 同上 ×1組" }))).toBe(
      "filter",
    );
    expect(classifyRecord(rec({ inverter: '乾燥機12"散熱馬達+葉片' }))).toBe(
      "filter",
    );
  });

  it("排水器 / CKD / AD480 → filter", () => {
    expect(classifyRecord(rec({ filter_system: "AD480×1" }))).toBe("filter");
    expect(classifyRecord(rec({ filter_system: "外置式排水器CKD*3只" }))).toBe(
      "filter",
    );
  });

  it("「散熱器組清洗 / 清潔」是空壓機本體 → compressor", () => {
    expect(
      classifyRecord(
        rec({
          hours: "42972",
          oil: "4",
          oil_filter: "1",
          inverter: "散熱器組清洗",
        }),
      ),
    ).toBe("compressor");
    expect(
      classifyRecord(
        rec({
          hours: "45013",
          oil: "1",
          oil_filter: "1",
          filter_system: "散熱器組清潔",
        }),
      ),
    ).toBe("compressor");
  });

  it("有時數 / 專用油等空壓機欄位 → compressor", () => {
    expect(classifyRecord(rec({ hours: "41302", oil: "例" }))).toBe(
      "compressor",
    );
    expect(classifyRecord(rec({ note: "馬達修理×1式" }))).toBe("compressor");
  });

  it("值只出現在「過濾系統」欄（空壓機欄全空）→ filter", () => {
    expect(classifyRecord(rec({ filter_system: "更換" }))).toBe("filter");
  });
});

describe("splitRecordsByCard", () => {
  it("尊重 AI 標好的 belongs_to", () => {
    const out = splitRecordsByCard([
      { ...rec({ hours: "100" }), belongs_to: "filter" },
      { ...rec({ filter_system: "乾燥機×1" }), belongs_to: "compressor" },
    ]);
    expect(out.filter).toHaveLength(1);
    expect(out.compressor).toHaveLength(1);
    expect(out.filter[0].hours).toBe("100");
  });

  it("AI 沒標時用關鍵字後備推導，all 保留原始順序", () => {
    const out = splitRecordsByCard(CARD_B.records);
    expect(out.all).toHaveLength(CARD_B.records.length);
    expect(out.all.map((r) => r.belongs_to)).toEqual([
      "compressor",
      "compressor",
      "compressor",
      "filter",
      "compressor",
      "compressor",
      "compressor",
      "compressor",
      "filter",
      "filter",
      "compressor",
    ]);
  });
});

describe("parseCardKind / parseBelongsTo", () => {
  it("收斂非法值為 null", () => {
    expect(parseCardKind("mixed")).toBe("mixed");
    expect(parseCardKind("dryer")).toBeNull();
    expect(parseBelongsTo("filter")).toBe("filter");
    expect(parseBelongsTo(undefined)).toBeNull();
  });
});

describe("filterCellText / suggestFilterColumns", () => {
  it("合併過濾系統欄與溢寫到變頻器欄的文字", () => {
    expect(
      filterCellText(rec({ filter_system: "乾燥機", inverter: '12"散熱馬達' })),
    ).toBe('乾燥機 12"散熱馬達');
    expect(filterCellText(rec({}))).toBe("");
  });

  it("由乾燥機的維護列推導預設耗材欄名", () => {
    const filterRows = splitRecordsByCard(CARD_B.records).filter;
    expect(suggestFilterColumns(filterRows)).toEqual(["散熱馬達", "葉片"]);
  });

  it("含排水器 / 濾蕊時一併建議", () => {
    expect(
      suggestFilterColumns([
        rec({ filter_system: "EA350-Q濾蕊*1只" }),
        rec({ filter_system: "外置式排水器CKD*3只+桶下AD480" }),
      ]),
    ).toEqual(["濾蕊", "排水器"]);
  });
});

// ── 兩張草稿卡 ────────────────────────────────────────────────────

describe("buildCardDrafts — 樣態 A（整張是過濾系統卡）", () => {
  const out = buildCardDrafts(CARD_A);

  it("判定為過濾卡，不產生空壓機卡", () => {
    expect(out.kind).toBe("filter");
    expect(out.compressor).toBeNull();
    expect(out.filter).not.toBeNull();
  });

  it("機號留空、filter_spec 為原文，過濾卡機號建議為去前綴型號", () => {
    expect(normalizeCardHeader(CARD_A.basic).serial_no).toBe("");
    expect(out.filter?.basic.filter_spec).toBe("過濾 AL 010N + LM-P-010");
    expect(out.filter?.basic.serial_no).toBe("AL 010N + LM-P-010");
  });

  it("所有維護列都進過濾卡（含專用油 / 時數那幾列）", () => {
    expect(out.filter?.records).toHaveLength(CARD_A.records.length);
    expect(out.rows.every((r) => r.belongs_to === "filter")).toBe(true);
  });

  it("預設勾選匯入", () => {
    expect(shouldImportFilterCard(out.filter)).toBe(true);
  });

  it("整張是過濾卡時，代號照樣沿用表頭", () => {
    const tagged = buildCardDrafts({
      basic: { ...CARD_A.basic, machine_no: "A機" },
      records: CARD_A.records,
    });
    expect(tagged.filter?.basic.machine_no).toBe("A機");
  });
});

describe("buildCardDrafts — 樣態 B（一張卡兩台機器）", () => {
  const out = buildCardDrafts(CARD_B);

  it("產生兩張草稿卡：空壓機 J751307001 與過濾系統 100HA", () => {
    expect(out.kind).toBe("mixed");
    expect(out.compressor?.basic.serial_no).toBe("J751307001");
    expect(out.filter?.basic.serial_no).toBe("100HA");
    expect(out.filter?.basic.filter_spec).toBe("過濾100HA");
  });

  it("紅框內的「乾燥機用散熱馬達 / 葉片」列落在過濾卡", () => {
    const texts = (out.filter?.records ?? []).map((r) => filterCellText(r));
    expect(texts).toEqual([
      '乾燥機12"散熱馬達+葉片 16V×1',
      '乾燥機用散熱馬達12"×2只 〃葉片12"×2只',
      "乾燥機 同上 ×1組",
    ]);
  });

  it("空壓機列留在空壓機卡，含「散熱器組清洗」那兩列", () => {
    expect(out.compressor?.records).toHaveLength(8);
    const inverters = (out.compressor?.records ?? []).map((r) => r.inverter);
    expect(inverters).toContain("散熱器組清洗");
  });

  it("空壓機卡不帶過濾器規格；過濾卡不帶馬力 / 電壓", () => {
    expect(out.compressor?.basic.filter_spec).toBe("");
    expect(out.filter?.basic.horsepower).toBe("");
    expect(out.filter?.basic.voltage).toBe("");
  });

  it("過濾卡的預設耗材欄由辨識內容推導", () => {
    expect(out.filter?.columns).toEqual(["散熱馬達", "葉片"]);
  });

  it("兩張卡沿用同一個客戶", () => {
    expect(out.filter?.basic.customer_code).toBe(
      out.compressor?.basic.customer_code,
    );
    expect(out.filter?.basic.customer_name).toBe(
      out.compressor?.basic.customer_name,
    );
  });

  // 0019：機台代號的唯一範圍是 (客戶, 卡別)，兩張草稿卡別不同，帶同一個代號
  // 不會互撞。0018 時代為了閃開衝突而把過濾卡的代號清空，那是繞路不是需求 ——
  // 現場的乾燥機就擺在 A機 旁邊，紙卡上往往也標成「A機」，沿用才省得員工重打。
  it("混合卡：兩張草稿都沿用表頭的機台代號", () => {
    const tagged = buildCardDrafts({
      basic: { ...CARD_B.basic, machine_no: "A機" },
      records: CARD_B.records,
    });
    expect(tagged.compressor?.basic.machine_no).toBe("A機");
    expect(tagged.filter?.basic.machine_no).toBe("A機");
  });
});

describe("buildCardDrafts — 樣態 C（＋100HA 也是過濾標記）", () => {
  const out = buildCardDrafts(CARD_C);

  it("產生兩張草稿卡：空壓機 J751307001 與過濾系統 100HA", () => {
    expect(out.kind).toBe("mixed");
    expect(out.compressor?.basic.serial_no).toBe("J751307001");
    expect(out.filter?.basic.filter_spec).toBe("＋100HA");
    expect(out.filter?.basic.serial_no).toBe("100HA");
  });

  it("空壓機卡的電壓不含加號註記", () => {
    expect(out.compressor?.basic.voltage).toBe("380V");
    expect(out.compressor?.basic.filter_spec).toBe("");
  });

  it("AD480 / 乾燥機 / 乾修 三列落在過濾卡，其餘留在空壓機卡", () => {
    expect(out.rows.map((r) => r.belongs_to)).toEqual([
      "compressor",
      "filter",
      "filter",
      "compressor",
      "compressor",
      "filter",
    ]);
    expect((out.filter?.records ?? []).map((r) => filterCellText(r))).toEqual([
      "AD480×1",
      '乾燥機12"散熱馬達+葉片',
      '乾修:12"馬達+葉片 空修:變頻器內風扇',
    ]);
  });

  it("「散熱溶劑清洗」是空壓機本體，不會被搬到過濾卡", () => {
    const inverters = (out.compressor?.records ?? []).map((r) => r.inverter);
    expect(inverters).toContain("散熱溶劑清洗");
  });

  it("與 B 是同一台機器：兩張照片的空壓機機號一致", () => {
    expect(out.compressor?.basic.serial_no).toBe(
      buildCardDrafts(CARD_B).compressor?.basic.serial_no,
    );
  });

  it("有過濾列 → 預設勾選匯入", () => {
    expect(shouldImportFilterCard(out.filter)).toBe(true);
  });
});

describe("buildCardDrafts — 樣態 D（純空壓機卡，不變量）", () => {
  const out = buildCardDrafts(CARD_D);

  it("只產生一張卡，不誤生空的過濾卡", () => {
    expect(out.kind).toBe("compressor");
    expect(out.filter).toBeNull();
    expect(out.compressor).not.toBeNull();
    expect(out.compressor?.records).toHaveLength(CARD_D.records.length);
  });

  it("列裡的「散熱器組清洗 / 清潔」不會觸發分流", () => {
    expect(out.rows.every((r) => r.belongs_to === "compressor")).toBe(true);
  });

  it("沒有過濾卡時 shouldImportFilterCard 為 false", () => {
    expect(shouldImportFilterCard(out.filter)).toBe(false);
  });

  it("即使某列真的寫了乾燥機，表頭沒標記就仍只出一張卡（避免無中生有）", () => {
    const withDryerRow = buildCardDrafts({
      basic: CARD_D.basic,
      records: [...CARD_D.records, rec({ filter_system: "AD480×1" })],
    });
    expect(withDryerRow.kind).toBe("compressor");
    expect(withDryerRow.filter).toBeNull();
  });
});

describe("buildCardDrafts — 防呆", () => {
  it("表頭宣告了過濾系統但一列都沒有 → 仍產卡，但預設不勾選匯入", () => {
    const out = buildCardDrafts({
      basic: basic({ serial_no: "J751307001", filter_spec: "過濾100HA" }),
      records: [rec({ hours: "100", oil: "例" })],
    });
    expect(out.filter).not.toBeNull();
    expect(out.filter?.records).toHaveLength(0);
    expect(shouldImportFilterCard(out.filter)).toBe(false);
  });

  it("完全空白的表頭不會生出過濾卡", () => {
    const out = buildCardDrafts({ basic: basic({}), records: [] });
    expect(out.kind).toBe("compressor");
    expect(out.filter).toBeNull();
  });
});

// ── 與 parseExtraction 串起來 ─────────────────────────────────────

describe("parseExtraction → buildCardDrafts", () => {
  it("A：AI 只在 serial_no 給「過濾 …」也能分流成過濾卡", () => {
    const draft = parseExtraction({
      basic: {
        customer_name: "本源興(股)公司(三廠)25",
        serial_no: "過濾 AL 010N + LM-P-010",
      },
      records: [{ service_date: "2023-03-13", hours: "3474", oil: "例" }],
    });
    expect(draft.card_kind).toBe("filter");
    expect(draft.basic.serial_no).toBe("");
    expect(draft.basic.filter_spec).toBe("過濾 AL 010N + LM-P-010");
    const cards = buildCardDrafts(draft);
    expect(cards.compressor).toBeNull();
    expect(cards.filter?.records).toHaveLength(1);
  });

  it("B：AI 已標 card_kind / belongs_to 時照用", () => {
    const draft = parseExtraction({
      card_kind: "mixed",
      basic: { serial_no: "J751307001", filter_spec: "過濾100HA" },
      records: [
        {
          service_date: "2024-10-09",
          hours: "41302",
          oil: "例",
          belongs_to: "compressor",
        },
        {
          service_date: "2026-01-23",
          filter_system: '乾燥機用散熱馬達12"×2只',
          belongs_to: "filter",
        },
      ],
    });
    expect(draft.card_kind).toBe("mixed");
    expect(draft.records[1].belongs_to).toBe("filter");
    const cards = buildCardDrafts(draft);
    expect(cards.compressor?.records).toHaveLength(1);
    expect(cards.filter?.records).toHaveLength(1);
  });

  it("C：AI 把「＋100HA」留在電壓欄 → 本地撈出來，分流成兩張卡", () => {
    const draft = parseExtraction({
      card_kind: "compressor",
      basic: {
        serial_no: "J751307001",
        model: "JNV75/8",
        horsepower: "100HP",
        voltage: "380V ＋100HA",
      },
      records: [
        {
          service_date: "2023-05-15",
          hours: "35018",
          filter_system: "AD480×1",
        },
        { service_date: "2023-07-12", hours: "35818", oil: "例" },
      ],
    });
    expect(draft.card_kind).toBe("mixed");
    expect(draft.basic.filter_spec).toBe("＋100HA");
    expect(draft.basic.voltage).toBe("380V");
    const cards = buildCardDrafts(draft);
    expect(cards.compressor?.records).toHaveLength(1);
    expect(cards.filter?.records).toHaveLength(1);
    expect(cards.filter?.basic.serial_no).toBe("100HA");
  });

  it("D：AI 亂標 card_kind='mixed' 但表頭沒有過濾型號 → 仍只出空壓機卡", () => {
    const draft = parseExtraction({
      card_kind: "mixed",
      basic: { serial_no: "J751307001" },
      records: [{ service_date: "2023-05-15", filter_system: "AD480×1" }],
    });
    expect(draft.card_kind).toBe("compressor");
    expect(buildCardDrafts(draft).filter).toBeNull();
  });

  it("belongs_to 不影響「該列是否全空」的丟棄判斷", () => {
    const draft = parseExtraction({
      basic: { serial_no: "B1" },
      records: [{ belongs_to: "filter" }, { service_date: "2024-01-01" }],
    });
    expect(draft.records).toHaveLength(1);
  });
});
