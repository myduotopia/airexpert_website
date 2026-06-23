import { describe, it, expect } from "vitest";
import {
  mediaPathFromUrl,
  removedMediaPaths,
  sectionImageUrls,
} from "@/lib/admin/media-cleanup";

const MEDIA = "https://ref.supabase.co/storage/v1/object/public/media";

describe("mediaPathFromUrl — 只認 media bucket 公開 URL", () => {
  it("media 公開 URL → 取出 bucket 內路徑", () => {
    expect(mediaPathFromUrl(`${MEDIA}/branding/123-456.png`)).toBe(
      "branding/123-456.png",
    );
  });
  it("百分比編碼路徑會解碼", () => {
    expect(mediaPathFromUrl(`${MEDIA}/a%20b/c.png`)).toBe("a b/c.png");
  });
  it("內建預設 / 外部 / 空值 → null（不可刪）", () => {
    expect(mediaPathFromUrl("/brand/logo-mark.png")).toBeNull();
    expect(mediaPathFromUrl("/favicon.ico")).toBeNull();
    expect(mediaPathFromUrl("/hero/pain-01-cost.png")).toBeNull();
    expect(mediaPathFromUrl("https://example.com/x.png")).toBeNull();
    // 外部網址即使含相同路徑片段，host 非 *.supabase.co → 不視為本站 media 檔
    expect(
      mediaPathFromUrl(
        "https://attacker.example/storage/v1/object/public/media/foo.png",
      ),
    ).toBeNull();
    expect(mediaPathFromUrl("")).toBeNull();
    expect(mediaPathFromUrl(null)).toBeNull();
    expect(mediaPathFromUrl(undefined)).toBeNull();
  });
});

describe("removedMediaPaths — 只刪『舊有、新無』的 media 檔", () => {
  it("換掉的舊 media 檔會被列入刪除", () => {
    expect(
      removedMediaPaths(
        [`${MEDIA}/branding/old.png`],
        [`${MEDIA}/branding/new.png`],
      ),
    ).toEqual(["branding/old.png"]);
  });
  it("仍被引用的檔不刪", () => {
    expect(removedMediaPaths([`${MEDIA}/a.png`], [`${MEDIA}/a.png`])).toEqual(
      [],
    );
  });
  it("由 media 改回內建預設 → 刪舊 media 檔", () => {
    expect(
      removedMediaPaths(
        [`${MEDIA}/branding/old.png`],
        ["/brand/logo-mark.png"],
      ),
    ).toEqual(["branding/old.png"]);
  });
  it("舊值是內建預設（非 media）→ 永不刪", () => {
    expect(
      removedMediaPaths(["/favicon.ico"], [`${MEDIA}/branding/n.ico`]),
    ).toEqual([]);
  });
  it("去重：同一舊檔只回一次", () => {
    expect(
      removedMediaPaths(
        [`${MEDIA}/a.png`, `${MEDIA}/a.png`],
        ["/brand/logo-mark.png"],
      ),
    ).toEqual(["a.png"]);
  });
});

describe("sectionImageUrls — 取區段內圖片 URL", () => {
  it("carousel 取 slides[].image_url（略過空值）", () => {
    const v = {
      slides: [
        { image_url: "/a.png", headline: "x" },
        { headline: "no image" },
        { image_url: "" },
        { image_url: `${MEDIA}/c.png` },
      ],
    };
    expect(sectionImageUrls("home_carousel", v)).toEqual([
      "/a.png",
      `${MEDIA}/c.png`,
    ]);
  });
  it("products 取 categories[].image_url", () => {
    const v = { categories: [{ image_url: "/x.jpg", name: "n" }] };
    expect(sectionImageUrls("home_products", v)).toEqual(["/x.jpg"]);
  });
  it("無圖區段 / 壞形狀 → 空陣列", () => {
    expect(sectionImageUrls("home_stats", { items: [] })).toEqual([]);
    expect(sectionImageUrls("home_carousel", null)).toEqual([]);
    expect(sectionImageUrls("home_carousel", { slides: "nope" })).toEqual([]);
  });
});
