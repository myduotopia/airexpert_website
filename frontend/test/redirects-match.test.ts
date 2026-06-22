import { describe, it, expect } from "vitest";
import {
  buildRedirectMap,
  matchRedirect,
  normalizePath,
  shouldCheckRedirect,
  type RedirectRule,
} from "@/lib/redirects/match";

const RULES: RedirectRule[] = [
  { from_path: "/index.html", to_path: "/", status: 301 },
  { from_path: "/products.html", to_path: "/products", status: 301 },
  {
    from_path: "/old-promo",
    to_path: "https://example.com/promo",
    status: 302,
  },
];

describe("redirects — normalizePath", () => {
  it("去尾斜線（根路徑除外）", () => {
    expect(normalizePath("/products/")).toBe("/products");
    expect(normalizePath("/")).toBe("/");
  });

  it("去 query / hash", () => {
    expect(normalizePath("/news.html?utm=x")).toBe("/news.html");
    expect(normalizePath("/news.html#top")).toBe("/news.html");
  });

  it("空字串 → 根路徑", () => {
    expect(normalizePath("")).toBe("/");
  });
});

describe("redirects — buildRedirectMap + matchRedirect", () => {
  const map = buildRedirectMap(RULES);

  it("命中 .html 來源 → 目標 + 301", () => {
    expect(matchRedirect("/index.html", map)).toEqual({ to: "/", status: 301 });
    expect(matchRedirect("/products.html", map)).toEqual({
      to: "/products",
      status: 301,
    });
  });

  it("尾斜線 / query 變體仍命中（key 已正規化）", () => {
    expect(matchRedirect("/products.html?from=google", map)).toEqual({
      to: "/products",
      status: 301,
    });
  });

  it("完整 URL 目標 + 302 原樣保留", () => {
    expect(matchRedirect("/old-promo", map)).toEqual({
      to: "https://example.com/promo",
      status: 302,
    });
  });

  it("未命中 → null", () => {
    expect(matchRedirect("/not-mapped", map)).toBeNull();
  });

  it("非 301/302 status 收斂為 301；缺欄位略過", () => {
    const m = buildRedirectMap([
      { from_path: "/a", to_path: "/b", status: 308 },
      { from_path: "", to_path: "/c", status: 301 },
      { from_path: "/d", to_path: "", status: 301 },
    ]);
    expect(matchRedirect("/a", m)).toEqual({ to: "/b", status: 301 });
    expect(m.size).toBe(1);
  });

  it("重複 from_path 以先出現者為準", () => {
    const m = buildRedirectMap([
      { from_path: "/x", to_path: "/first", status: 301 },
      { from_path: "/x", to_path: "/second", status: 302 },
    ]);
    expect(matchRedirect("/x", m)).toEqual({ to: "/first", status: 301 });
  });
});

describe("redirects — shouldCheckRedirect（效能護欄）", () => {
  it("跳過 Next 資產 / api / 已知檔", () => {
    expect(shouldCheckRedirect("/_next/static/chunk.js")).toBe(false);
    expect(shouldCheckRedirect("/api/contact")).toBe(false);
    expect(shouldCheckRedirect("/favicon.ico")).toBe(false);
    expect(shouldCheckRedirect("/robots.txt")).toBe(false);
    expect(shouldCheckRedirect("/sitemap.xml")).toBe(false);
  });

  it("跳過帶副檔名的靜態檔（.html 例外）", () => {
    expect(shouldCheckRedirect("/logo.png")).toBe(false);
    expect(shouldCheckRedirect("/styles.css")).toBe(false);
    expect(shouldCheckRedirect("/index.html")).toBe(true);
  });

  it("一般路由（無副檔名）需檢查", () => {
    expect(shouldCheckRedirect("/")).toBe(true);
    expect(shouldCheckRedirect("/products")).toBe(true);
    expect(shouldCheckRedirect("/news/some-slug")).toBe(true);
  });
});
