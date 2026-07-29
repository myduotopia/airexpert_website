import { describe, it, expect } from "vitest";
import { HOME_KEYS } from "@/lib/data/home";
import {
  HOME_SECTION_KEYS,
  parseCarousel,
  parseStats,
  parseCaseStudy,
  parseTech,
  parseNews,
  parseProducts,
  parseFeatures,
  parseSocial,
  parseHomeSection,
} from "@/lib/admin/home-sections";

// 以「索引化欄位名 + prefix.count」組出後台可重複列表單的 FormData。
function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("白名單 HOME_SECTION_KEYS", () => {
  it("涵蓋全部首頁 key（含 home_case）、不含已退場的 legacy key", () => {
    expect([...HOME_SECTION_KEYS].sort()).toEqual(
      Object.values(HOME_KEYS).sort(),
    );
    expect(HOME_SECTION_KEYS.has("home_case")).toBe(true);
    expect(HOME_SECTION_KEYS.has("home_hero")).toBe(false);
    expect(HOME_SECTION_KEYS.has("home_cta")).toBe(false);
  });
});

describe("parseCaseStudy（多個案 + selectedIndex）", () => {
  const base = (i: number) => ({
    [`cases[${i}].client`]: `廠 ${i}`,
    [`cases[${i}].tags`]: "製造業、ESG 減碳",
    [`cases[${i}].beforeImage`]: `/b${i}.jpg`,
    [`cases[${i}].afterImage`]: `/a${i}.jpg`,
    [`cases[${i}].logo`]: `/logo${i}.png`,
    [`cases[${i}].energyRate`]: `${i}0%`,
    [`cases[${i}].annualSaving`]: `約 ${i}00 萬`,
    [`cases[${i}].roi`]: `${i} 年`,
    [`cases[${i}].carbon`]: `年減約 ${i}00 噸 CO₂e`,
  });

  it("逐列解析、tags 以逗號/頓號拆分、selectedIndex 帶入", () => {
    const result = parseCaseStudy(
      fd({
        "cases.count": "2",
        selectedIndex: "1",
        ...base(0),
        ...base(1),
      }),
    );
    expect(result.cases).toHaveLength(2);
    expect(result.selectedIndex).toBe(1);
    expect(result.cases[0].client).toBe("廠 0");
    expect(result.cases[0].tags).toEqual(["製造業", "ESG 減碳"]);
    expect(result.cases[1].roi).toBe("1 年");
  });

  it("缺改善前或改善後圖的列會被略過，selectedIndex 對應到保留後的實際位置", () => {
    const result = parseCaseStudy(
      fd({
        "cases.count": "3",
        // 選第 2 列（視覺索引 2）為展示；但第 1 列缺圖會被略過。
        selectedIndex: "2",
        ...base(0),
        // 第 1 列缺 afterImage → 略過
        "cases[1].client": "缺圖廠",
        "cases[1].beforeImage": "/b1.jpg",
        "cases[1].afterImage": "",
        ...base(2),
      }),
    );
    expect(result.cases).toHaveLength(2);
    expect(result.cases.map((c) => c.client)).toEqual(["廠 0", "廠 2"]);
    // 視覺索引 2 的個案在保留後位於位置 1。
    expect(result.selectedIndex).toBe(1);
  });

  it("selectedIndex 指向被略過的列 → 退回 0", () => {
    const result = parseCaseStudy(
      fd({
        "cases.count": "2",
        selectedIndex: "1",
        ...base(0),
        // 第 1 列缺圖被略過，但它被選為展示 → selectedIndex 退回 0
        "cases[1].beforeImage": "",
        "cases[1].afterImage": "",
      }),
    );
    expect(result.cases).toHaveLength(1);
    expect(result.selectedIndex).toBe(0);
  });

  it("無任何有效個案 → 空集合、selectedIndex 0", () => {
    const result = parseCaseStudy(fd({ "cases.count": "0" }));
    expect(result.cases).toEqual([]);
    expect(result.selectedIndex).toBe(0);
  });

  it("經 parseHomeSection 以 home_case 分派", () => {
    const value = parseHomeSection(
      HOME_KEYS.caseStudy,
      fd({ "cases.count": "1", selectedIndex: "0", ...base(0) }),
    );
    expect(value).toEqual({
      selectedIndex: 0,
      cases: [
        {
          client: "廠 0",
          tags: ["製造業", "ESG 減碳"],
          beforeImage: "/b0.jpg",
          afterImage: "/a0.jpg",
          logo: "/logo0.png",
          energyRate: "00%",
          annualSaving: "約 000 萬",
          roi: "0 年",
          carbon: "年減約 000 噸 CO₂e",
        },
      ],
    });
  });
});

describe("parseCarousel（可重複列 → JSON）", () => {
  it("逐列解析、字串去除前後空白", () => {
    const result = parseCarousel(
      fd({
        "slides.count": "2",
        "slides[0].image_url": " /a.png ",
        "slides[0].alt": "alt0",
        "slides[0].category": "電費過高",
        "slides[0].headline": "H0",
        "slides[0].tagline": "T0",
        "slides[1].image_url": "/b.png",
        "slides[1].alt": "alt1",
        "slides[1].category": "壓力不穩",
        "slides[1].headline": "H1",
        "slides[1].tagline": "T1",
      }),
    );
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0]).toEqual({
      image_url: "/a.png",
      alt: "alt0",
      category: "電費過高",
      headline: "H0",
      tagline: "T0",
    });
  });

  it("無圖片的列跳過（中間空列不會留洞）", () => {
    const result = parseCarousel(
      fd({
        "slides.count": "3",
        "slides[0].image_url": "/a.png",
        "slides[0].headline": "H0",
        // 第 1 列只有文案、無圖片 → 跳過（空 src 會讓 next/image 崩潰）
        "slides[1].headline": "H1",
        "slides[2].image_url": "/c.png",
        "slides[2].headline": "H2",
      }),
    );
    expect(result.slides.map((s) => s.headline)).toEqual(["H0", "H2"]);
    expect(result.slides.map((s) => s.image_url)).toEqual(["/a.png", "/c.png"]);
  });

  it("count 為 0 / 缺漏 → 空陣列", () => {
    expect(parseCarousel(fd({})).slides).toEqual([]);
    expect(parseCarousel(fd({ "slides.count": "0" })).slides).toEqual([]);
  });
});

describe("parseStats", () => {
  it("只填數字或說明任一即保留；兩者皆空跳過", () => {
    const result = parseStats(
      fd({
        "items.count": "3",
        "items[0].value": "35%",
        "items[0].label": "節能",
        "items[1].value": "12k",
        // 第 2 列全空 → 跳過
      }),
    );
    expect(result.items).toEqual([
      { value: "35%", label: "節能" },
      { value: "12k", label: "" },
    ]);
  });
});

describe("parseTech（icon 收斂）", () => {
  it("合法 icon 保留、非法 icon 退回清單第一個（ruler）", () => {
    const result = parseTech(
      fd({
        eyebrow: "EB",
        title: "T",
        description: "D",
        "features.count": "2",
        "features[0].icon": "line-chart",
        "features[0].title": "F0",
        "features[1].icon": "not-an-icon",
        "features[1].title": "F1",
      }),
    );
    expect(result.eyebrow).toBe("EB");
    expect(result.features[0].icon).toBe("line-chart");
    expect(result.features[1].icon).toBe("ruler");
  });

  it("空白 / 缺漏 icon 也退回 ruler", () => {
    const result = parseTech(
      fd({
        "features.count": "1",
        "features[0].title": "F0",
      }),
    );
    expect(result.features[0].icon).toBe("ruler");
  });
});

describe("parseNews", () => {
  it("僅 eyebrow / title", () => {
    expect(parseNews(fd({ eyebrow: " EB ", title: "T" }))).toEqual({
      eyebrow: "EB",
      title: "T",
    });
  });
});

describe("parseProducts", () => {
  it("分類列解析、空列跳過", () => {
    const result = parseProducts(
      fd({
        eyebrow: "EB",
        title: "T",
        description: "D",
        "categories.count": "2",
        "categories[0].image_url": "/c.jpg",
        "categories[0].name": "變頻空壓機",
        "categories[0].desc": "說明",
        // 第 1 列全空 → 跳過
      }),
    );
    expect(result.categories).toEqual([
      { image_url: "/c.jpg", name: "變頻空壓機", desc: "說明" },
    ]);
  });
});

describe("parseFeatures（icon 收斂到 features 清單）", () => {
  it("合法 zap 保留、非法退回 zap（清單第一個）", () => {
    const result = parseFeatures(
      fd({
        eyebrow: "EB",
        title: "T",
        "features.count": "2",
        "features[0].icon": "leaf",
        "features[0].title": "F0",
        "features[1].icon": "ruler", // ruler 不在 features 清單 → 退回 zap
        "features[1].title": "F1",
      }),
    );
    expect(result.features[0].icon).toBe("leaf");
    expect(result.features[1].icon).toBe("zap");
  });
});

describe("parseSocial", () => {
  it("服務中心列解析、空列跳過", () => {
    const result = parseSocial(
      fd({
        eyebrow: "EB",
        title: "T",
        description: "D",
        "companies.count": "2",
        "companies[0].region": "北區",
        "companies[0].name": "勁賀",
        "companies[0].line": "https://line/1",
        "companies[0].fb": "https://fb/1",
        // 第 1 列全空 → 跳過
      }),
    );
    expect(result.companies).toEqual([
      {
        region: "北區",
        name: "勁賀",
        line: "https://line/1",
        fb: "https://fb/1",
      },
    ]);
  });
});

describe("parseHomeSection（分派）", () => {
  it("依 key 分派到對應解析器", () => {
    const v = parseHomeSection(
      HOME_KEYS.news,
      fd({ eyebrow: "EB", title: "T" }),
    );
    expect(v).toEqual({ eyebrow: "EB", title: "T" });
  });

  it("未知 key → null", () => {
    expect(parseHomeSection("home_hero", fd({}))).toBeNull();
    expect(parseHomeSection("bogus", fd({}))).toBeNull();
  });
});
