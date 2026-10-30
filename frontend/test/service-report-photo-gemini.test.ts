// extractServiceReportPhotos 的重試／退路（#280）：responseSchema 被拒（400）→ 不帶 schema 再試；
// 金鑰無效（同樣回 400）→ 不做無意義的 schema-less 重試。全部以假 fetch，不連外。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  }),
}));

import { extractServiceReportPhotos } from "@/lib/ai/gemini";

const IMAGES = [{ base64: "AAAA", mimeType: "image/jpeg" }];

function okResponse(obj: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }],
    }),
    { status: 200 },
  );
}

type Call = { model: string; hasSchema: boolean };

function stubFetch(handler: (call: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? "";
      const body = JSON.parse(init.body) as {
        generationConfig: { responseSchema?: unknown };
      };
      const call = {
        model,
        hasSchema: body.generationConfig.responseSchema !== undefined,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

describe("extractServiceReportPhotos 重試", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("schema 被拒（400）→ 同模型不帶 schema 再試一次", async () => {
    const calls = stubFetch((c) =>
      c.hasSchema
        ? new Response('{"error":{"message":"Invalid JSON payload"}}', {
            status: 400,
          })
        : okResponse({ report_no: "X11510002" }),
    );
    const out = await extractServiceReportPhotos(IMAGES);
    expect(out.raw).toEqual({ report_no: "X11510002" });
    expect(out.model).toBe("gemini-2.5-pro");
    expect(calls).toEqual([
      { model: "gemini-2.5-pro", hasSchema: true },
      { model: "gemini-2.5-pro", hasSchema: false },
    ]);
  });

  it("金鑰無效（400 API_KEY_INVALID）→ 不做 schema-less 重試，錯誤往上拋", async () => {
    const calls = stubFetch(
      () =>
        new Response(
          '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}',
          { status: 400 },
        ),
    );
    await expect(extractServiceReportPhotos(IMAGES)).rejects.toThrow(/400/);
    expect(calls.every((c) => c.hasSchema)).toBe(true);
    expect(calls.map((c) => c.model)).toEqual([
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ]);
  });
});
