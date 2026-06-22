// 轉址表載入（供 proxy 使用）— 以 Supabase REST（anon）讀「enabled」列並建 RedirectMap，
// 搭配模組層記憶體快取 + TTL，避免每個 request 都打 DB。
//
// 為何用 fetch 而非 supabase-js：proxy 在每次 matching request 都可能呼叫，
// 走輕量 REST + 內建快取較省；且不需 server-only 的重型 client。
// 轉址對照非機密（RLS 已限 enabled），以 anon key 讀取即可。
import { buildRedirectMap, type RedirectMap, type RedirectRule } from "./match";

// 已發佈轉址不常變動；60 秒 TTL 兼顧即時性與效能。
const TTL_MS = 60_000;

let cached: { map: RedirectMap; expires: number } | null = null;
let inflight: Promise<RedirectMap> | null = null;

/** 測試用：清除模組層快取。 */
export function __resetRedirectCache(): void {
  cached = null;
  inflight = null;
}

async function fetchRules(): Promise<RedirectRule[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  // 只取 enabled 列（RLS 亦會強制），僅拉比對所需欄位。
  const endpoint =
    `${url}/rest/v1/redirects` +
    `?select=from_path,to_path,status&enabled=eq.true`;

  const res = await fetch(endpoint, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    // proxy 自帶 TTL 快取；交給平台 fetch 預設即可，不額外快取避免雙層失效不一致。
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json()) as RedirectRule[];
}

/**
 * 取得（可能快取的）轉址 Map。失敗時回傳空 Map（fail-open：不轉址，不阻擋請求）。
 * 並行請求共用同一 inflight，避免快取失效瞬間的雷擊（thundering herd）。
 */
export async function getRedirectMap(): Promise<RedirectMap> {
  const now = Date.now();
  if (cached && cached.expires > now) return cached.map;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const rules = await fetchRules();
      const map = buildRedirectMap(rules);
      cached = { map, expires: Date.now() + TTL_MS };
      return map;
    } catch {
      // 讀取失敗 → 回空 Map 並短暫快取，避免每個請求重打失敗端點。
      const map = buildRedirectMap([]);
      cached = { map, expires: Date.now() + 5_000 };
      return map;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
