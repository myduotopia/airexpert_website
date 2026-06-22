import { describe, it, expect, vi, afterEach } from "vitest";
import {
  extractGeminiText,
  stripCodeFence,
  postProcessRefinedHtml,
  normaliseSlug,
  shapeSeoResult,
  isRetryableStatus,
  backoffMs,
  fetchGeminiWithRetry,
} from "@/lib/ai/gemini";

describe("extractGeminiText（合併回應文字）", () => {
  it("合併 candidates[0].content.parts 的 text", () => {
    const data = {
      candidates: [{ content: { parts: [{ text: "abc" }, { text: "def" }] } }],
    };
    expect(extractGeminiText(data)).toBe("abcdef");
  });

  it("缺結構 → 空字串（不丟錯）", () => {
    expect(extractGeminiText({})).toBe("");
    expect(extractGeminiText(null)).toBe("");
    expect(extractGeminiText({ candidates: [] })).toBe("");
  });
});

describe("stripCodeFence（去除 Markdown code fence）", () => {
  it("去除 ```html … ``` 圍欄", () => {
    expect(stripCodeFence("```html\n<p>x</p>\n```")).toBe("<p>x</p>");
  });

  it("去除無語言標記的 ``` … ```", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("無圍欄 → 原樣（去前後空白）", () => {
    expect(stripCodeFence("  <p>x</p>  ")).toBe("<p>x</p>");
  });
});

describe("postProcessRefinedHtml（修文後處理：去圍欄 + 必過 sanitize）", () => {
  it("移除 <script> 等非白名單內容（AI 產出強制消毒）", () => {
    const out = postProcessRefinedHtml(
      "```html\n<p>安全</p><script>alert(1)</script>\n```",
    );
    expect(out).toContain("<p>安全</p>");
    expect(out).not.toContain("script");
  });

  it("移除事件處理屬性與 javascript: 連結", () => {
    const out = postProcessRefinedHtml(
      '<p onclick="x()">hi</p><a href="javascript:alert(1)">y</a>',
    );
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("hi");
  });

  it("保留允許標籤", () => {
    const out = postProcessRefinedHtml(
      "<h2>標題</h2><p><strong>粗</strong></p>",
    );
    expect(out).toContain("<h2>標題</h2>");
    expect(out).toContain("<strong>");
  });
});

describe("isRetryableStatus（暫時性錯誤判斷）", () => {
  it("429 / 500 / 503 → 可重試", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("400 / 401 / 403 / 200 → 不重試（立即失敗或成功）", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("backoffMs（指數退避）", () => {
  it("attempt 1→500、2→1000、3→2000（base 500 * 2^(n-1)）", () => {
    expect(backoffMs(1)).toBe(500);
    expect(backoffMs(2)).toBe(1000);
    expect(backoffMs(3)).toBe(2000);
  });

  it("單調遞增", () => {
    expect(backoffMs(2)).toBeGreaterThan(backoffMs(1));
    expect(backoffMs(3)).toBeGreaterThan(backoffMs(2));
  });
});

describe("fetchGeminiWithRetry（重試迴圈，注入 sleep 不真的等待）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const okResponse = () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    }) as unknown as Response;

  const errResponse = (status: number) =>
    ({
      ok: false,
      status,
      text: async () => "boom",
    }) as unknown as Response;

  it("503 後 200 → 重試一次成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const data = await fetchGeminiWithRetry("https://x", { a: 1 }, { sleep });

    expect(extractGeminiText(data)).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1); // 退避一次（attempt 1 後）
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("連續三次 503 → 用盡重試後丟錯（含狀態，不含 url/key）", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(503));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchGeminiWithRetry("https://x?key=secret", { a: 1 }, { sleep }),
    ).rejects.toThrow(/Gemini API 失敗（503）/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(sleep).toHaveBeenCalledTimes(2); // 前兩次失敗後退避，最後一次不退避
  });

  it("400 → 不重試、立即丟錯", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(400));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchGeminiWithRetry("https://x", { a: 1 }, { sleep }),
    ).rejects.toThrow(/Gemini API 失敗（400）/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("錯誤訊息不洩漏 key / url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errResponse(403));
    vi.stubGlobal("fetch", fetchMock);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchGeminiWithRetry("https://x?key=SECRET_KEY", { a: 1 }, { sleep }),
    ).rejects.toThrow(/^(?!.*SECRET_KEY).*$/);
  });
});

describe("normaliseSlug", () => {
  it("小寫化、僅留 a-z0-9 與連字號、收斂多餘連字號", () => {
    expect(normaliseSlug("Inverter Air Compressor!! 節能")).toBe(
      "inverter-air-compressor",
    );
    expect(normaliseSlug("--A__B--")).toBe("a-b");
  });

  it("空 / 非字串 → 空字串", () => {
    expect(normaliseSlug("")).toBe("");
    expect(normaliseSlug(null)).toBe("");
    expect(normaliseSlug(undefined)).toBe("");
  });
});

describe("shapeSeoResult（SEO 回應解析與整形）", () => {
  it("解析完整 JSON 並回傳各欄位", () => {
    const r = shapeSeoResult(
      JSON.stringify({
        seo_title: "標題",
        seo_description: "描述",
        og_title: "OG 標題",
        og_description: "OG 描述",
        slug: "My Slug",
        jsonld: { "@type": "Article" },
      }),
    );
    expect(r.seo_title).toBe("標題");
    expect(r.seo_description).toBe("描述");
    expect(r.og_title).toBe("OG 標題");
    expect(r.og_description).toBe("OG 描述");
    expect(r.slug).toBe("my-slug");
    expect(r.jsonld).toEqual({ "@type": "Article" });
  });

  it("og_* 缺時沿用 seo_*（與前台 fallback 一致）", () => {
    const r = shapeSeoResult(
      JSON.stringify({ seo_title: "T", seo_description: "D" }),
    );
    expect(r.og_title).toBe("T");
    expect(r.og_description).toBe("D");
  });

  it("可吃 ```json 圍欄包裹的輸出", () => {
    const r = shapeSeoResult('```json\n{"seo_title":"X"}\n```');
    expect(r.seo_title).toBe("X");
  });

  it("jsonld 非物件（陣列 / 字串 / 缺）→ null", () => {
    expect(shapeSeoResult('{"jsonld":[1,2]}').jsonld).toBeNull();
    expect(shapeSeoResult('{"jsonld":"x"}').jsonld).toBeNull();
    expect(shapeSeoResult("{}").jsonld).toBeNull();
  });

  it("非 JSON → 丟錯；陣列 / 純值 → 丟錯", () => {
    expect(() => shapeSeoResult("not json")).toThrow();
    expect(() => shapeSeoResult("[1,2,3]")).toThrow();
  });

  it("過長欄位被截斷", () => {
    const long = "字".repeat(300);
    const r = shapeSeoResult(
      JSON.stringify({ seo_title: long, seo_description: long }),
    );
    expect(r.seo_title.length).toBeLessThanOrEqual(200);
    expect(r.seo_description.length).toBeLessThanOrEqual(400);
  });
});
