import { describe, it, expect, beforeEach, vi } from "vitest";

// 讓資料層快取包裝在測試中透傳，直接執行查詢邏輯。
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => {},
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

describe("getHomeContent（首頁 7 區段 fallback）", () => {
  const FRONT_KEYS = [
    "carousel",
    "stats",
    "tech",
    "news",
    "products",
    "features",
    "social",
  ] as const;

  it("DB 全空（每個 key value=null）→ 前台 7 區段皆退回 HOME_DEFAULTS", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(clientByKey({}));
    const home = await getHomeContent();
    // getHomeContent 只回傳前台實際 render 的 7 區段。
    expect(Object.keys(home).sort()).toEqual([...FRONT_KEYS].sort());
    for (const key of FRONT_KEYS) {
      expect(home[key]).toEqual(HOME_DEFAULTS[key]);
    }
  });

  it("HOME_KEYS 涵蓋前台 7 區段", () => {
    for (const key of FRONT_KEYS) {
      expect(HOME_KEYS[key]).toBe(`home_${key}`);
    }
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
