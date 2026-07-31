// frontend/test/google-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { googleApiPost } from "@/lib/analytics/google-fetch";

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const err = (status: number) =>
  ({ ok: false, status, text: async () => "boom" }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("googleApiPost", () => {
  it("200 → 回傳解析後 JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ rows: [1] })));
    const data = await googleApiPost(
      "https://x",
      "tok",
      { q: 1 },
      { sleep: vi.fn() },
    );
    expect(data).toEqual({ rows: [1] });
  });

  it("503 後 200 → 重試一次成功", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(err(503))
      .mockResolvedValueOnce(ok({ a: 1 }));
    vi.stubGlobal("fetch", f);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const data = await googleApiPost("https://x", "tok", {}, { sleep });
    expect(data).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("連 3 次皆 503 → 用盡重試，sleep 只呼叫 2 次（最後一次失敗不再 sleep）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(err(503)));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep }),
    ).rejects.toThrow(/503/);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep: vi.fn() }),
    ).rejects.toThrow(/^(?!.*SECRET_TOKEN).*$/);
  });

  it("403 → 不重試、立即丟錯（訊息含 403、不含 token）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(err(403)));
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep: vi.fn() }),
    ).rejects.toThrow(/403/);
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep: vi.fn() }),
    ).rejects.toThrow(/^(?!.*SECRET_TOKEN).*$/);
  });
});
