import { describe, it, expect } from "vitest";
import {
  classifyServiceType,
  isQuantityMark,
  parseServiceType,
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type ServiceTypeInput,
} from "@/lib/admin/maintenance-service-type";

/** fixture 幫手：只填有寫字的欄，其餘視為空白格。 */
function row(partial: ServiceTypeInput): ServiceTypeInput {
  return {
    oil: null,
    oil_filter: null,
    air_filter: null,
    oil_separator: null,
    inverter: null,
    filter_system: null,
    note: null,
    ...partial,
  };
}

describe("isQuantityMark", () => {
  it("認得純數量與勾記", () => {
    expect(isQuantityMark("1")).toBe(true);
    expect(isQuantityMark("3")).toBe(true);
    expect(isQuantityMark(" 4 ")).toBe(true);
    expect(isQuantityMark("1.")).toBe(true);
    expect(isQuantityMark("×1")).toBe(true);
    expect(isQuantityMark("x1")).toBe(true);
    expect(isQuantityMark("/")).toBe(true);
    expect(isQuantityMark("✓")).toBe(true);
    expect(isQuantityMark("○")).toBe(true);
    expect(isQuantityMark("│")).toBe(true);
  });

  it("空白與描述性文字都不算數量記號", () => {
    expect(isQuantityMark(null)).toBe(false);
    expect(isQuantityMark("   ")).toBe(false);
    expect(isQuantityMark("0")).toBe(false);
    expect(isQuantityMark("例")).toBe(false);
    expect(isQuantityMark("AD480×1")).toBe(false);
    expect(isQuantityMark("內×1 外×1")).toBe(false);
    expect(isQuantityMark("散熱器清潔")).toBe(false);
    expect(isQuantityMark("NA")).toBe(false);
    expect(isQuantityMark("N/A")).toBe(false);
    // 勾記集合含 V（手寫打勾常寫成 V），但夾在文字中的 V 不可誤判。
    expect(isQuantityMark("16V×1")).toBe(false);
    expect(isQuantityMark("V190")).toBe(false);
  });
});

// 以參考卡片 old_website_data/658362223ccdd26a7c521d0f380e79ce18842e7_0.jpg
// （和成欣業二廠 KK123-1，機號 J751307001）的實際列做 fixture。
describe("classifyServiceType — 參考卡片實際列", () => {
  it("112.3.29 專用油=3／機油濾=1／油氣分離=1／變頻器=散熱溶劑清洗 → 保養優先於維修", () => {
    expect(
      classifyServiceType(
        row({
          oil: "3",
          oil_filter: "1",
          oil_separator: "1",
          inverter: "散熱溶劑清洗",
        }),
      ),
    ).toBe("maintenance");
  });

  it("112.5.15 只有變頻器=AD480×1 → 維修", () => {
    expect(classifyServiceType(row({ inverter: "AD480×1" }))).toBe("repair");
  });

  it('112.6.20 過濾系統=乾燥機12"散熱馬達+葉片 → 維修', () => {
    expect(
      classifyServiceType(row({ filter_system: '乾燥機12"散熱馬達+葉片' })),
    ).toBe("repair");
  });

  it("112.7.12 專用油=例 → 例檢", () => {
    expect(classifyServiceType(row({ oil: "例" }))).toBe("inspection");
  });

  it("112.7.19 專用油=例、備註有文字 → 仍為例檢", () => {
    expect(
      classifyServiceType(
        row({ oil: "例", note: "彈性件、回油視窗更換（1.5-19川內）" }),
      ),
    ).toBe("inspection");
  });

  it("112.8.8 專用油=「例.」（帶句點）→ 例檢", () => {
    expect(classifyServiceType(row({ oil: "例." }))).toBe("inspection");
  });

  it("112.8.1 只有備註=彈性元件×1／回油視窗×1 → 維修", () => {
    expect(
      classifyServiceType(
        row({ note: "彈性元件×1／回油視窗（1B 1.5 雙外）×1" }),
      ),
    ).toBe("repair");
  });

  it("112.8.22 專用油=4／機油濾=1 → 保養", () => {
    expect(classifyServiceType(row({ oil: "4", oil_filter: "1" }))).toBe(
      "maintenance",
    );
  });

  it('113.3.4 變頻器=乾修:12"馬達+葉片、過濾系統=空修:變頻器內風扇 → 維修', () => {
    expect(
      classifyServiceType(
        row({
          inverter: '乾修：12"馬達+葉片',
          filter_system: "空修：變頻器內風扇",
        }),
      ),
    ).toBe("repair");
  });

  it("113.8.9 四個耗材欄都有量、過濾系統另有「散熱器清潔」→ 保養優先於維修", () => {
    expect(
      classifyServiceType(
        row({
          oil: "4",
          oil_filter: "1",
          air_filter: "內×1 外×1",
          oil_separator: "1",
          filter_system: "散熱器清潔",
        }),
      ),
    ).toBe("maintenance");
  });

  it("整列只有日期（九個判定欄全空）→ null", () => {
    expect(classifyServiceType(row({}))).toBeNull();
  });

  it("耗材欄寫 0 或四位數（時數誤落欄）不算耗材數量 → null", () => {
    expect(classifyServiceType(row({ oil_filter: "0" }))).toBeNull();
    expect(classifyServiceType(row({ oil: "37446" }))).toBeNull();
  });
});

// 第二張卡 old_website_data/1787033191871.jpg（同一台 J751307001 的續卡）。
describe("classifyServiceType — 參考卡片二實際列", () => {
  it("114.2.11 專用油=4／機油濾=1、過濾系統=散熱器組清潔 → 保養優先於維修", () => {
    expect(
      classifyServiceType(
        row({ oil: "4", oil_filter: "1", filter_system: "散熱器組清潔" }),
      ),
    ).toBe("maintenance");
  });

  it("114.7.9 只有過濾系統=16V×1 → 維修（V 不可被當成勾記）", () => {
    expect(classifyServiceType(row({ filter_system: "16V×1" }))).toBe("repair");
  });

  it("114.11.27 專用油=1／機油濾=1、油氣分離器格寫「油鏡×1只」→ 保養", () => {
    expect(
      classifyServiceType(
        row({
          oil: "1",
          oil_filter: "1",
          oil_separator: "油鏡×1只",
          filter_system: "散熱器組清潔",
        }),
      ),
    ).toBe("maintenance");
  });

  it("114.11.11 整列只有跨欄的「馬達修理×1式」→ 維修", () => {
    expect(classifyServiceType(row({ note: "馬達修理×1式" }))).toBe("repair");
  });
});

describe("classifyServiceType — NA（不適用）不算維修", () => {
  it("變頻器／過濾系統／備註寫 NA、N/A → 未判定而非維修", () => {
    expect(classifyServiceType(row({ inverter: "NA" }))).toBeNull();
    expect(classifyServiceType(row({ filter_system: "N/A" }))).toBeNull();
    expect(classifyServiceType(row({ note: "n/a" }))).toBeNull();
    expect(
      classifyServiceType(row({ inverter: "NA", filter_system: "NA." })),
    ).toBeNull();
  });

  it("NA 不影響前兩條規則", () => {
    expect(classifyServiceType(row({ oil: "例", note: "NA" }))).toBe(
      "inspection",
    );
    expect(classifyServiceType(row({ oil_filter: "1", inverter: "NA" }))).toBe(
      "maintenance",
    );
  });

  it("含 NA 的完整敘述仍是維修", () => {
    expect(classifyServiceType(row({ note: "NA 段已更換" }))).toBe("repair");
  });
});

describe("classifyServiceType — 規則邊界", () => {
  it("「例行」等變形也算例檢", () => {
    expect(classifyServiceType(row({ oil: "例行" }))).toBe("inspection");
    expect(classifyServiceType(row({ oil: " 例 " }))).toBe("inspection");
  });

  it("耗材欄只寫勾記也算保養", () => {
    expect(classifyServiceType(row({ oil_filter: "/" }))).toBe("maintenance");
    expect(classifyServiceType(row({ air_filter: "✓" }))).toBe("maintenance");
    expect(classifyServiceType(row({ oil_separator: "1" }))).toBe(
      "maintenance",
    );
  });

  it("變頻器只寫數量記號（無文字）→ 不算維修，維持未判定", () => {
    expect(classifyServiceType(row({ inverter: "1" }))).toBeNull();
  });

  it("空白字元不算內容", () => {
    expect(classifyServiceType(row({ note: "   " }))).toBeNull();
  });

  it("只有標點的格子不算內容（OCR 雜訊）", () => {
    expect(classifyServiceType(row({ note: "。" }))).toBeNull();
    expect(classifyServiceType(row({ inverter: "、" }))).toBeNull();
  });
});

describe("parseServiceType", () => {
  it("只接受三個合法值", () => {
    expect(parseServiceType("inspection")).toBe("inspection");
    expect(parseServiceType(" repair ")).toBe("repair");
    expect(parseServiceType("")).toBeNull();
    expect(parseServiceType("例檢")).toBeNull();
    expect(parseServiceType(undefined)).toBeNull();
    expect(parseServiceType(3)).toBeNull();
    // 卡詳情頁以此收斂 ?type=；同名參數重複帶時 Next 會給陣列，需視為未篩選。
    expect(parseServiceType(["repair"])).toBeNull();
  });
});

describe("SERVICE_TYPE_LABELS", () => {
  it("三類都有繁體中文標籤", () => {
    expect(SERVICE_TYPES).toEqual(["inspection", "maintenance", "repair"]);
    expect(SERVICE_TYPE_LABELS.inspection).toBe("例檢");
    expect(SERVICE_TYPE_LABELS.maintenance).toBe("保養");
    expect(SERVICE_TYPE_LABELS.repair).toBe("維修");
  });
});
