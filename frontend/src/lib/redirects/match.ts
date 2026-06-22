// 轉址比對的「純」邏輯 — 無 server-only / 無 DB / 無 Next 依賴，方便單元測試與在 proxy 重用。
// proxy 從 DB 讀取 redirects 後建成 RedirectMap，再以 matchRedirect 比對當前路徑。

/** 單一轉址規則（已過濾為 enabled）。 */
export interface RedirectRule {
  from_path: string;
  to_path: string;
  status: number;
}

/** from_path → 規則 的查表結構（建表時已正規化 key）。 */
export type RedirectMap = Map<string, { to: string; status: 301 | 302 }>;

/** 將 status 收斂為 301/302（其他值一律當 301）。 */
function normalizeStatus(status: number): 301 | 302 {
  return status === 302 ? 302 : 301;
}

/**
 * 正規化路徑作為比對 key：去除尾端 query / hash（呼叫端通常已只給 pathname），
 * 去除尾斜線（根路徑 "/" 除外），統一小寫比對在此「不」做（路徑大小寫敏感）。
 */
export function normalizePath(pathname: string): string {
  let p = pathname;
  const q = p.search(/[?#]/);
  if (q !== -1) p = p.slice(0, q);
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p === "" ? "/" : p;
}

/** 由 DB 規則列建出查表 Map（key 已正規化）。重複 from_path 以先出現者為準。 */
export function buildRedirectMap(rules: RedirectRule[]): RedirectMap {
  const map: RedirectMap = new Map();
  for (const r of rules) {
    if (!r.from_path || !r.to_path) continue;
    const key = normalizePath(r.from_path);
    if (!map.has(key)) {
      map.set(key, { to: r.to_path, status: normalizeStatus(r.status) });
    }
  }
  return map;
}

/**
 * 比對單一路徑 → 命中回傳 { to, status }，未命中回傳 null。
 * 不對 to_path 做正規化（保留 admin 設定的目標原樣，可為站內路徑或完整 URL）。
 */
export function matchRedirect(
  pathname: string,
  map: RedirectMap,
): { to: string; status: 301 | 302 } | null {
  return map.get(normalizePath(pathname)) ?? null;
}

/**
 * proxy 效能護欄：判斷此路徑是否「需要」查轉址表。
 * 跳過 Next 內部資產、API、以及帶副檔名的靜態檔（.html 例外 —— 舊站正是 .html）。
 */
export function shouldCheckRedirect(pathname: string): boolean {
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return false;
  }
  // 帶副檔名者多為靜態資產（.png/.css/.js…）；唯獨 .html 需檢查（舊站路徑）。
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot > 0) {
    const ext = lastSegment.slice(dot + 1).toLowerCase();
    if (ext !== "html") return false;
  }
  return true;
}
