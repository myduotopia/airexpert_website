import { describe, it, expect, beforeEach, vi } from "vitest";

// 讓資料層的快取包裝在測試中變成透傳，直接執行查詢邏輯。
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: () => {},
}));
vi.mock("react", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cache: (fn: unknown) => fn,
}));
// 以可記錄呼叫的假 client 取代真 Supabase client。
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));

import { getSupabaseClient } from "@/lib/supabase";
import {
  getPublishedProducts,
  getPublishedArticles,
  getPublishedCases,
  getPublishedEvents,
  getPublishedBrands,
  getPublishedServices,
} from "@/lib/data";
import { submitContactForm } from "@/lib/contact";

type Calls = {
  eq: [string, unknown][];
  selectCalled: boolean;
  insertArg: unknown;
};

function fakeClient() {
  const calls: Calls = { eq: [], selectCalled: false, insertArg: undefined };
  const builder: Record<string, unknown> = {
    from: () => builder,
    select: () => {
      calls.selectCalled = true;
      return builder;
    },
    eq: (k: string, v: unknown) => {
      calls.eq.push([k, v]);
      return builder;
    },
    order: () => builder,
    insert: (v: unknown) => {
      calls.insertArg = v;
      return builder;
    },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    // 讓 await chain 解析成空結果集
    then: (resolve: (r: { data: unknown[]; error: null }) => void) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return { builder, calls };
}

beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReset();
});

describe("資料層只讀 published（每個 read helper 都套 status='published'）", () => {
  const helpers: [string, () => Promise<unknown>][] = [
    ["products", getPublishedProducts],
    ["articles", getPublishedArticles],
    ["cases", getPublishedCases],
    ["events", getPublishedEvents],
    ["brands", getPublishedBrands],
    ["services", getPublishedServices],
  ];

  for (const [name, helper] of helpers) {
    it(`getPublished*(${name}) 套用 status='published'`, async () => {
      const { builder, calls } = fakeClient();
      vi.mocked(getSupabaseClient).mockReturnValue(
        builder as unknown as ReturnType<typeof getSupabaseClient>,
      );
      await helper();
      expect(calls.eq).toContainEqual(["status", "published"]);
    });
  }
});

describe("聯絡表單", () => {
  it("submitContactForm 不串 .select()（避免 anon 401）", async () => {
    const { builder, calls } = fakeClient();
    vi.mocked(getSupabaseClient).mockReturnValue(
      builder as unknown as ReturnType<typeof getSupabaseClient>,
    );
    const payload = {
      name: "王小明",
      company: "ACME",
      phone: "0900000000",
      email: "a@b.com",
      message: "詢價",
      source_page: "/contact",
    };
    await submitContactForm(payload);
    expect(calls.selectCalled).toBe(false);
    expect(calls.insertArg).toEqual(payload);
  });
});
