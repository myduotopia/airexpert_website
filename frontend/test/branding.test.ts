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
import { getBranding, BRANDING_DEFAULTS } from "@/lib/data/site";
import { parseBrandingFields } from "@/lib/admin/branding";

// 回傳 branding value 為 `value` 的假 client（getSiteSetting 走 .maybeSingle()）。
function clientReturning(value: unknown) {
  const builder: Record<string, unknown> = {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: { value }, error: null }),
  };
  return builder as unknown as ReturnType<typeof getSupabaseClient>;
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReset();
});

describe("getBranding（品牌資產 fallback）", () => {
  it("DB 無 branding（value=null）→ 全部退回內建預設", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(clientReturning(null));
    const b = await getBranding();
    expect(b).toEqual(BRANDING_DEFAULTS);
  });

  it("只設定 logo_url → favicon_url 退回預設", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientReturning({ logo_url: "https://cdn/logo.png" }),
    );
    const b = await getBranding();
    expect(b.logo_url).toBe("https://cdn/logo.png");
    expect(b.favicon_url).toBe(BRANDING_DEFAULTS.favicon_url);
  });

  it("兩者皆設定 → 採用 DB 值", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientReturning({
        logo_url: "https://cdn/logo.png",
        favicon_url: "https://cdn/fav.ico",
      }),
    );
    const b = await getBranding();
    expect(b).toEqual({
      logo_url: "https://cdn/logo.png",
      favicon_url: "https://cdn/fav.ico",
    });
  });

  it("空字串 / 非字串 → 該欄位退回預設（避免空 src）", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue(
      clientReturning({ logo_url: "   ", favicon_url: 123 }),
    );
    const b = await getBranding();
    expect(b).toEqual(BRANDING_DEFAULTS);
  });
});

describe("parseBrandingFields（後台表單 → 寫入 value 形狀）", () => {
  function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  }

  it("兩欄皆填 → 兩個 key 都寫入（前後空白被去除）", () => {
    const v = parseBrandingFields(
      fd({ logo_url: "  https://x/l.png ", favicon_url: "https://x/f.ico" }),
    );
    expect(v).toEqual({
      logo_url: "https://x/l.png",
      favicon_url: "https://x/f.ico",
    });
  });

  it("空欄位被省略（不寫空字串），讓前台退回預設", () => {
    const v = parseBrandingFields(
      fd({ logo_url: "https://x/l.png", favicon_url: "" }),
    );
    expect(v).toEqual({ logo_url: "https://x/l.png" });
    expect("favicon_url" in v).toBe(false);
  });

  it("兩欄皆空 → 回傳空物件", () => {
    expect(parseBrandingFields(fd({}))).toEqual({});
  });
});
