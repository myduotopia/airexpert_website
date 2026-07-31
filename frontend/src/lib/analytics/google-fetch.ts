// frontend/src/lib/analytics/google-fetch.ts
// 帶重試的 Google REST POST。SERVER ONLY。錯誤訊息不洩漏 url / token。
import "server-only";

const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([429, 500, 503]);

export function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

interface Options {
  sleep?: (ms: number) => Promise<void>;
}

/** POST JSON body，帶 Bearer token，回傳解析後 JSON。可重試狀態碼指數退避。 */
export async function googleApiPost<T = unknown>(
  url: string,
  accessToken: string,
  body: unknown,
  opts: Options = {},
): Promise<T> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Google API 失敗（${res.status}）`);
    }
    await sleep(backoffMs(attempt));
  }
  throw new Error(`Google API 失敗（${lastStatus}）`);
}
