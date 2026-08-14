import { describe, it, expect, beforeEach, vi } from "vitest";

// 以假資料層取代真 DB 讀取（sitemap 從 @/lib/data 取 getPublished*）。
vi.mock("@/lib/data", () => ({
  getPublishedProducts: vi.fn(async () => [
    { slug: "ax-s9", updated_at: "2026-01-02T00:00:00.000Z" },
  ]),
  getPublishedServices: vi.fn(async () => [
    { slug: "maintenance", updated_at: "2026-01-03T00:00:00.000Z" },
  ]),
  getPublishedArticles: vi.fn(async () => [
    { slug: "news-1", updated_at: "2026-01-04T00:00:00.000Z" },
    { slug: "news-2", updated_at: null },
  ]),
  getPublishedCases: vi.fn(async () => [
    { slug: "case-a", updated_at: "2026-01-05T00:00:00.000Z" },
  ]),
  getPublishedPhotoAlbums: vi.fn(async () => [
    { slug: "album-x", updated_at: "2026-01-06T00:00:00.000Z" },
  ]),
}));

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.airexpert.com.tw";

describe("sitemap — 動態 + 靜態項組裝", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("包含五區動態 detail 頁的 URL", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toContain(`${SITE}/products/ax-s9`);
    expect(urls).toContain(`${SITE}/services/maintenance`);
    expect(urls).toContain(`${SITE}/news/news-1`);
    expect(urls).toContain(`${SITE}/news/news-2`);
    expect(urls).toContain(`${SITE}/cases/case-a`);
    expect(urls).toContain(`${SITE}/events/albums/album-x`);
  });

  it("包含核心靜態路由（首頁 priority 1）", async () => {
    const entries = await sitemap();
    const home = entries.find((e) => e.url === `${SITE}/`);
    expect(home?.priority).toBe(1);

    const urls = entries.map((e) => e.url);
    for (const p of [
      "/products",
      "/news",
      "/cases",
      "/services",
      "/events",
      "/contact",
    ]) {
      expect(urls).toContain(`${SITE}${p}`);
    }
  });

  it("有 updated_at 用其為 lastModified；缺漏退回 now", async () => {
    const entries = await sitemap();
    const news1 = entries.find((e) => e.url === `${SITE}/news/news-1`);
    expect(news1?.lastModified).toEqual(new Date("2026-01-04T00:00:00.000Z"));

    const news2 = entries.find((e) => e.url === `${SITE}/news/news-2`);
    expect(news2?.lastModified).toBeInstanceOf(Date);
  });

  it("文章 changeFrequency 為 weekly", async () => {
    const entries = await sitemap();
    const news1 = entries.find((e) => e.url === `${SITE}/news/news-1`);
    expect(news1?.changeFrequency).toBe("weekly");
  });
});

describe("robots — disallow 規則", () => {
  it("允許根路徑、禁止後台與非公開路徑、含 sitemap", () => {
    const r = robots();
    const rules = r.rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;

    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toContain("/admin");
    expect(rule?.disallow).toContain("/api/");
    expect(rule?.disallow).toContain("/maintenance");
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
  });
});
