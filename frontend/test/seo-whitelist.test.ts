import { describe, it, expect } from "vitest";
import {
  SEO_WRITABLE_COLUMNS,
  isSeoWritableColumn,
  pickSeoWritable,
} from "@/lib/admin/seo-whitelist";

describe("SEO_WRITABLE_COLUMNS（白名單欄位）", () => {
  it("恰好包含 9 個 SEO meta 欄位（不含內文 / slug / status）", () => {
    expect([...SEO_WRITABLE_COLUMNS].sort()).toEqual(
      [
        "canonical_url",
        "nofollow",
        "noindex",
        "og_description",
        "og_image_url",
        "og_title",
        "schema_jsonld",
        "seo_description",
        "seo_title",
      ].sort(),
    );
  });

  it("不含內文 / slug / status / 角色等敏感欄位", () => {
    for (const forbidden of [
      "body_html",
      "slug",
      "status",
      "title",
      "name",
      "role",
      "id",
    ]) {
      expect(isSeoWritableColumn(forbidden)).toBe(false);
    }
  });
});

describe("isSeoWritableColumn", () => {
  it("白名單欄位回 true", () => {
    expect(isSeoWritableColumn("seo_title")).toBe(true);
    expect(isSeoWritableColumn("noindex")).toBe(true);
  });
  it("非白名單欄位回 false", () => {
    expect(isSeoWritableColumn("body_html")).toBe(false);
    expect(isSeoWritableColumn("")).toBe(false);
  });
});

describe("pickSeoWritable（收斂 seo_manager 可寫欄位）", () => {
  it("只保留白名單欄位，丟棄其餘", () => {
    const input = {
      seo_title: "T",
      seo_description: "D",
      noindex: true,
      // 以下皆應被丟棄
      body_html: "<p>內文</p>",
      slug: "hacked",
      status: "published",
      role: "admin",
    };
    const out = pickSeoWritable(input);
    expect(out).toEqual({
      seo_title: "T",
      seo_description: "D",
      noindex: true,
    });
    expect(out).not.toHaveProperty("body_html");
    expect(out).not.toHaveProperty("slug");
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("role");
  });

  it("保留 falsy / null 值（只要鍵在白名單且存在）", () => {
    const out = pickSeoWritable({
      seo_title: "",
      canonical_url: null,
      noindex: false,
      schema_jsonld: null,
    });
    expect(out).toEqual({
      seo_title: "",
      canonical_url: null,
      noindex: false,
      schema_jsonld: null,
    });
  });

  it("缺席的白名單鍵不會被補成 undefined（不覆蓋 DB 既有值）", () => {
    const out = pickSeoWritable({ seo_title: "只改標題" });
    expect(Object.keys(out)).toEqual(["seo_title"]);
    expect(out).not.toHaveProperty("seo_description");
    expect(out).not.toHaveProperty("noindex");
  });

  it("不變動原輸入物件", () => {
    const input = { seo_title: "T", body_html: "x" };
    const copy = { ...input };
    pickSeoWritable(input);
    expect(input).toEqual(copy);
  });

  it("空物件 → 空結果", () => {
    expect(pickSeoWritable({})).toEqual({});
  });
});
