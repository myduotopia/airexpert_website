// searchParams 解析與 URL 組裝（純函式）。
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export function firstParam(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return (s ?? "").trim();
}

export function parsePage(v: string | string[] | undefined): number {
  const n = Number(firstParam(v));
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** 西元 YYYY-MM-DD；其他回 null。 */
export function parseIsoDate(v: string | string[] | undefined): string | null {
  const s = firstParam(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 在允許值內才回傳，否則 null。 */
export function parseEnum<T extends string>(
  v: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  const s = firstParam(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

/** base + 非空參數的 query string。 */
export function withParams(
  base: string,
  params: Record<string, string | number | null | undefined | false>,
): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
