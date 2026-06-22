import { describe, it, expect } from "vitest";
import {
  SEO_OVERVIEW_TABLES,
  isSeoTable,
  getSeoTableConfig,
  isMissingSeoTitle,
  isMissingSeoDescription,
  isMissingOgImage,
  hasAnyMissing,
  summarizeSeoRows,
  filterSeoRows,
  type SeoRow,
} from "@/lib/admin/seo-overview";

function row(partial: Partial<SeoRow>): SeoRow {
  return {
    table: "products",
    typeLabel: "商品介紹",
    id: "1",
    title: "標題",
    slug: "slug",
    status: "published",
    seo_title: "已填",
    seo_description: "已填",
    canonical_url: null,
    og_title: null,
    og_description: null,
    og_image_url: "https://img",
    schema_jsonld: null,
    noindex: false,
    nofollow: false,
    ...partial,
  };
}

describe("SEO_OVERVIEW_TABLES（內容表 allowlist）", () => {
  it("恰好涵蓋五個內容表", () => {
    expect(SEO_OVERVIEW_TABLES.map((c) => c.table).sort()).toEqual(
      ["articles", "cases", "photo_albums", "products", "services"].sort(),
    );
  });

  it("products 用 name 欄位，其餘用 title", () => {
    const products = getSeoTableConfig("products");
    expect(products?.titleColumn).toBe("name");
    for (const t of ["articles", "services", "cases", "photo_albums"]) {
      expect(getSeoTableConfig(t)?.titleColumn).toBe("title");
    }
  });
});

describe("isSeoTable（拒絕任意表名）", () => {
  it("五表回 true", () => {
    for (const t of [
      "products",
      "articles",
      "services",
      "cases",
      "photo_albums",
    ]) {
      expect(isSeoTable(t)).toBe(true);
    }
  });

  it("非 allowlist（含注入式表名）回 false", () => {
    for (const t of [
      "admin_profiles",
      "site_settings",
      "users",
      "products; drop table products",
      "",
      "PRODUCTS",
    ]) {
      expect(isSeoTable(t)).toBe(false);
      expect(getSeoTableConfig(t)).toBeNull();
    }
  });
});

describe("缺漏判斷", () => {
  it("空 / 空白 seo_title 視為缺漏", () => {
    expect(isMissingSeoTitle(row({ seo_title: null }))).toBe(true);
    expect(isMissingSeoTitle(row({ seo_title: "" }))).toBe(true);
    expect(isMissingSeoTitle(row({ seo_title: "   " }))).toBe(true);
    expect(isMissingSeoTitle(row({ seo_title: "有值" }))).toBe(false);
  });

  it("seo_description / og_image 同規則", () => {
    expect(isMissingSeoDescription(row({ seo_description: null }))).toBe(true);
    expect(isMissingOgImage(row({ og_image_url: null }))).toBe(true);
    expect(isMissingOgImage(row({ og_image_url: "https://x" }))).toBe(false);
  });

  it("hasAnyMissing 任一缺漏即為 true", () => {
    expect(hasAnyMissing(row({}))).toBe(false);
    expect(hasAnyMissing(row({ og_image_url: null }))).toBe(true);
    expect(
      hasAnyMissing(
        row({ seo_title: null, seo_description: null, og_image_url: null }),
      ),
    ).toBe(true);
  });
});

describe("summarizeSeoRows（彙整統計）", () => {
  it("正確計各類缺漏與完整數", () => {
    const rows = [
      row({}), // 完整
      row({ seo_title: null }), // 缺標題
      row({ seo_description: null, og_image_url: null }), // 缺描述 + OG
      row({ seo_title: "", seo_description: "", og_image_url: "" }), // 全缺
    ];
    const s = summarizeSeoRows(rows);
    expect(s.total).toBe(4);
    expect(s.missingSeoTitle).toBe(2);
    expect(s.missingSeoDescription).toBe(2);
    expect(s.missingOgImage).toBe(2);
    expect(s.withAnyMissing).toBe(3);
    expect(s.complete).toBe(1);
  });

  it("空陣列 → 全 0", () => {
    expect(summarizeSeoRows([])).toEqual({
      total: 0,
      missingSeoTitle: 0,
      missingSeoDescription: 0,
      missingOgImage: 0,
      withAnyMissing: 0,
      complete: 0,
    });
  });
});

describe("filterSeoRows（類型 + 文字 + 缺漏篩選）", () => {
  const rows = [
    row({ table: "products", title: "空壓機 A", slug: "air-a" }),
    row({ table: "articles", title: "最新消息 B", slug: "news-b" }),
    row({
      table: "cases",
      title: "節能實績 C",
      slug: "case-c",
      seo_title: null,
    }),
  ];

  it("依類型篩選", () => {
    const out = filterSeoRows(rows, { table: "articles" });
    expect(out.map((r) => r.title)).toEqual(["最新消息 B"]);
  });

  it("table=all 不限類型", () => {
    expect(filterSeoRows(rows, { table: "all" })).toHaveLength(3);
    expect(filterSeoRows(rows, {})).toHaveLength(3);
  });

  it("文字搜尋比對標題與 slug（不分大小寫）", () => {
    expect(filterSeoRows(rows, { query: "air-a" })).toHaveLength(1);
    expect(filterSeoRows(rows, { query: "空壓" })).toHaveLength(1);
    expect(filterSeoRows(rows, { query: "NEWS" })).toHaveLength(1);
    expect(filterSeoRows(rows, { query: "找不到" })).toHaveLength(0);
  });

  it("onlyMissing 只留有缺漏者", () => {
    const out = filterSeoRows(rows, { onlyMissing: true });
    expect(out.map((r) => r.title)).toEqual(["節能實績 C"]);
  });

  it("不變動原輸入陣列", () => {
    const copy = [...rows];
    filterSeoRows(rows, { table: "products" });
    expect(rows).toEqual(copy);
  });
});
