import { describe, it, expect, beforeEach, vi } from "vitest";

// 讓資料層快取包裝在測試中透傳，直接執行查詢邏輯。
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => {},
}));
vi.mock("react", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cache: (fn: unknown) => fn,
}));
// 以可控的假 client 取代真 Supabase client，讓 getSiteSetting 取到指定 value。
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { getSupabaseClient } from "@/lib/supabase";
import { getHomeContent, HOME_KEYS, HOME_DEFAULTS } from "@/lib/data/home";

// 回傳一個依「目前查詢的 key」吐出對應 value 的假 client。
// getSiteSetting 走 from().select().eq("key", key).maybeSingle()。
function clientByKey(byKey: Record<string, unknown>) {
  let currentKey = "";
  const builder: Record<string, unknown> = {
    from: () => builder,
    select: () => builder,
    eq: (_col: string, value: string) => {
      currentKey = value;
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve({
        data:
          currentKey in byKey ? { value: byKey[currentKey] } : { value: null },
        error: null,
      }),
  };
  return builder as unknown as ReturnType<typeof getSupabaseClient>;
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReset();
});

describe("getHomeContent（首頁區段 fallback）", () => {
  // key === `home_${name}` 的 7 個區段（caseStudy 例外，其 key 為 home_case）。
  const FRONT_KEYS = [
    "carousel",
    "stats",
    "tech",
    "news",
    "products",
    "features",
    "social",
  ] as const;
  // getHomeContent 實際回傳的所有欄位（含 caseStudy）。
  const ALL_KEYS = [...FRONT_KEYS, "caseStudy"] as const;

  it("DB 全空（每個 key value=null）→ 前台各區段皆退回 HOME_DEFAULTS", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(clientByKey({}));
    const home = await getHomeContent();
    expect(Object.keys(home).sort()).toEqual([...ALL_KEYS].sort());
    for (const key of ALL_KEYS) {
      expect(home[key]).toEqual(HOME_DEFAULTS[key]);
    }
  });

  it("HOME_KEYS 涵蓋前台 7 區段", () => {
    for (const key of FRONT_KEYS) {
      expect(HOME_KEYS[key]).toBe(`home_${key}`);
    }
    // caseStudy 的 key 為 home_case（非 home_caseStudy）。
    expect(HOME_KEYS.caseStudy).toBe("home_case");
  });

  it("客戶實績：DB 存 collection（多個案 + selectedIndex）→ 解析出被選中個案並映射成 render 形狀", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.caseStudy]: {
          selectedIndex: 1,
          cases: [
            {
              client: "甲廠",
              tags: ["A"],
              beforeImage: "/b1.jpg",
              afterImage: "/a1.jpg",
              logo: "",
              energyRate: "10%",
              annualSaving: "約 100 萬",
              roi: "3 年",
              carbon: "年減約 100 噸 CO₂e",
            },
            {
              client: "乙廠",
              tags: ["B", "C"],
              beforeImage: "/b2.jpg",
              afterImage: "/a2.jpg",
              logo: "/logo2.png",
              energyRate: "50%",
              annualSaving: "約 500 萬",
              roi: "1 年",
              carbon: "年減約 500 噸 CO₂e",
            },
          ],
        },
      }),
    );
    const home = await getHomeContent();
    expect(home.caseStudy.client).toBe("乙廠");
    expect(home.caseStudy.tags).toEqual(["B", "C"]);
    expect(home.caseStudy.beforeImage).toBe("/b2.jpg");
    expect(home.caseStudy.logo).toBe("/logo2.png");
    // 指標標籤/圖示為固定值，數字來自被選中個案。
    expect(home.caseStudy.metrics[0]).toEqual({
      icon: "zap",
      label: "節電率高達",
      value: "50%",
    });
    expect(home.caseStudy.spotlight).toEqual({
      icon: "clock",
      label: "投資回收",
      value: "1 年",
    });
  });

  it("客戶實績：selectedIndex 越界 → 退回第 0 筆（不 crash）", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.caseStudy]: {
          selectedIndex: 9,
          cases: [
            {
              client: "只有一筆",
              tags: [],
              beforeImage: "/b.jpg",
              afterImage: "/a.jpg",
              logo: "",
              energyRate: "1%",
              annualSaving: "約 1 萬",
              roi: "9 年",
              carbon: "年減約 1 噸 CO₂e",
            },
          ],
        },
      }),
    );
    const home = await getHomeContent();
    expect(home.caseStudy.client).toBe("只有一筆");
  });

  it("客戶實績：空集合 / 壞形狀 → 退回設計預設 HOME_CASE", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.caseStudy]: { selectedIndex: 0, cases: [] },
      }),
    );
    const home = await getHomeContent();
    expect(home.caseStudy).toEqual(HOME_DEFAULTS.caseStudy);
  });

  it("客戶實績：被選中個案缺圖 → 退回設計預設（避免 next/image 空 src 崩潰）", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.caseStudy]: {
          selectedIndex: 0,
          cases: [
            {
              client: "缺圖廠",
              tags: [],
              beforeImage: "/b.jpg",
              afterImage: "",
              logo: "",
              energyRate: "1%",
              annualSaving: "約 1 萬",
              roi: "1 年",
              carbon: "年減約 1 噸 CO₂e",
            },
          ],
        },
      }),
    );
    const home = await getHomeContent();
    expect(home.caseStudy).toEqual(HOME_DEFAULTS.caseStudy);
  });

  it("僅覆寫部分 key → 該 key 採用 DB 值、其餘退回預設", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.news]: {
          eyebrow: "自訂 EYEBROW",
          title: "自訂標題",
        },
      }),
    );
    const home = await getHomeContent();
    expect(home.news).toEqual({
      eyebrow: "自訂 EYEBROW",
      title: "自訂標題",
    });
    // 未覆寫者仍為預設。
    expect(home.stats).toEqual(HOME_DEFAULTS.stats);
    expect(home.carousel).toEqual(HOME_DEFAULTS.carousel);
  });

  it("mergeShape 容忍壞形狀：缺欄位逐欄退回預設", async () => {
    // news 只存了 title（缺 eyebrow）→ eyebrow 退回預設、title 採用 DB。
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.news]: { title: "只有標題" },
      }),
    );
    const home = await getHomeContent();
    expect(home.news.eyebrow).toBe(HOME_DEFAULTS.news.eyebrow);
    expect(home.news.title).toBe("只有標題");
  });

  it("mergeShape 容忍壞形狀：型別不符（純量 / 物件存成字串）整段退回預設", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        [HOME_KEYS.stats]: "this should be an object",
        [HOME_KEYS.tech]: 12345,
      }),
    );
    const home = await getHomeContent();
    expect(home.stats).toEqual(HOME_DEFAULTS.stats);
    expect(home.tech).toEqual(HOME_DEFAULTS.tech);
  });

  it("mergeShape 容忍壞形狀：欄位型別不符（陣列存成物件）退回預設陣列", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientByKey({
        // items 應為陣列，這裡存成物件 → 退回預設 items。
        [HOME_KEYS.stats]: { items: { not: "an array" } },
      }),
    );
    const home = await getHomeContent();
    expect(home.stats.items).toEqual(HOME_DEFAULTS.stats.items);
  });
});
