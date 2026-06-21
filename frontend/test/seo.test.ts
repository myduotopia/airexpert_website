import { describe, it, expect } from "vitest";
import { buildSeoMetadata, jsonLdScriptHtml } from "@/lib/seo";
import { parseSeoFields } from "@/lib/admin/seo-fields";

describe("buildSeoMetadata（detail 頁 metadata 組裝）", () => {
  it("缺 SEO 欄位時退回 fallback 的 title / description", () => {
    const m = buildSeoMetadata(
      {
        seo_title: null,
        seo_description: null,
        og_title: null,
        og_description: null,
        og_image_url: null,
        canonical_url: null,
        noindex: false,
        nofollow: false,
      },
      { title: "AX-S9 無油螺旋空壓機", description: "核心賣點", image: null },
    );
    expect(m.title).toBe("AX-S9 無油螺旋空壓機");
    expect(m.description).toBe("核心賣點");
    // OG 預設沿用 title / description
    expect(m.openGraph).toMatchObject({
      title: "AX-S9 無油螺旋空壓機",
      description: "核心賣點",
    });
  });

  it("有 seo_title / seo_description 時覆寫 fallback", () => {
    const m = buildSeoMetadata(
      {
        seo_title: "自訂 SEO 標題",
        seo_description: "自訂 SEO 描述",
        og_title: null,
        og_description: null,
        og_image_url: null,
        canonical_url: null,
        noindex: false,
        nofollow: false,
      },
      { title: "原始標題", description: "原始描述" },
    );
    expect(m.title).toBe("自訂 SEO 標題");
    expect(m.description).toBe("自訂 SEO 描述");
  });

  it("canonical_url 有設定才輸出 alternates.canonical", () => {
    const base = {
      seo_title: null,
      seo_description: null,
      og_title: null,
      og_description: null,
      og_image_url: null,
      noindex: false,
      nofollow: false,
    };
    const withCanonical = buildSeoMetadata(
      { ...base, canonical_url: "https://airexpert.com.tw/products/x" },
      { title: "T" },
    );
    expect(withCanonical.alternates?.canonical).toBe(
      "https://airexpert.com.tw/products/x",
    );

    const without = buildSeoMetadata(
      { ...base, canonical_url: null },
      { title: "T" },
    );
    expect(without.alternates).toBeUndefined();
  });

  it("og_image_url 優先於 fallback.image，皆無則 images 為 undefined", () => {
    const base = {
      seo_title: null,
      seo_description: null,
      og_title: null,
      og_description: null,
      canonical_url: null,
      noindex: false,
      nofollow: false,
    };
    const withOg = buildSeoMetadata(
      { ...base, og_image_url: "https://x/og.png" },
      { title: "T", image: "https://x/cover.png" },
    );
    expect(withOg.openGraph?.images).toEqual(["https://x/og.png"]);

    const fallbackImg = buildSeoMetadata(
      { ...base, og_image_url: null },
      { title: "T", image: "https://x/cover.png" },
    );
    expect(fallbackImg.openGraph?.images).toEqual(["https://x/cover.png"]);

    const none = buildSeoMetadata(
      { ...base, og_image_url: null },
      { title: "T" },
    );
    expect(none.openGraph?.images).toBeUndefined();
  });

  it("noindex / nofollow 反轉為 robots.index / robots.follow", () => {
    const m = buildSeoMetadata(
      {
        seo_title: null,
        seo_description: null,
        og_title: null,
        og_description: null,
        og_image_url: null,
        canonical_url: null,
        noindex: true,
        nofollow: true,
      },
      { title: "T" },
    );
    expect(m.robots).toEqual({ index: false, follow: false });
  });
});

describe("jsonLdScriptHtml（安全序列化）", () => {
  it("跳脫 `<` 防止 </script> breakout", () => {
    const out = jsonLdScriptHtml({
      name: "</script><script>alert(1)</script>",
    });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("一般物件正常序列化為 JSON 字串", () => {
    const out = jsonLdScriptHtml({ "@type": "Product", name: "AX-S9" });
    expect(out).toContain('"@type":"Product"');
    expect(out).toContain('"name":"AX-S9"');
  });

  it("null / 空物件 → null（不輸出 <script>）", () => {
    expect(jsonLdScriptHtml(null)).toBeNull();
    expect(jsonLdScriptHtml(undefined)).toBeNull();
    expect(jsonLdScriptHtml({})).toBeNull();
  });
});

describe("parseSeoFields（後台表單 → DB 欄位）", () => {
  function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  }

  it("空值正規化為 null；checkbox 未出現 → false", () => {
    const res = parseSeoFields(fd({ seo_title: "  ", canonical_url: "" }));
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.values).toMatchObject({
      seo_title: null,
      canonical_url: null,
      schema_jsonld: null,
      noindex: false,
      nofollow: false,
    });
  });

  it("勾選的 checkbox（值 on）→ true", () => {
    const res = parseSeoFields(fd({ noindex: "on", nofollow: "on" }));
    if (!res.ok) throw new Error("expected ok");
    expect(res.values.noindex).toBe(true);
    expect(res.values.nofollow).toBe(true);
  });

  it("合法 JSON-LD 物件被解析；非法 JSON 回傳錯誤", () => {
    const ok = parseSeoFields(fd({ schema_jsonld: '{"@type":"Product"}' }));
    if (!ok.ok) throw new Error("expected ok");
    expect(ok.values.schema_jsonld).toEqual({ "@type": "Product" });

    const bad = parseSeoFields(fd({ schema_jsonld: "{not json}" }));
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("expected error");
    expect(bad.error).toBeTruthy();
  });

  it("JSON-LD 為陣列 / 純值 → 拒絕（必須是物件）", () => {
    const arr = parseSeoFields(fd({ schema_jsonld: "[1,2,3]" }));
    expect(arr.ok).toBe(false);
  });
});
