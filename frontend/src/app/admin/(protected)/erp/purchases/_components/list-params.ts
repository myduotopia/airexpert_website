// 單據列表的 searchParams 解析與分頁連結（純函式）。
import type { DocStatus } from "@/lib/erp/types";

export interface DocListParams {
  q: string;
  status: DocStatus | null;
  from: string;
  to: string;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function parseDocListParams(raw: RawParams): DocListParams {
  const status = first(raw.status);
  const from = first(raw.from);
  const to = first(raw.to);
  const page = Number.parseInt(first(raw.page), 10);
  return {
    q: first(raw.q),
    status:
      status === "draft" || status === "posted" || status === "voided"
        ? status
        : null,
    from: ISO.test(from) ? from : "",
    to: ISO.test(to) ? to : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** 保留篩選條件、換頁碼的連結。 */
export function pageHref(
  basePath: string,
  params: DocListParams,
  page: number,
  extra: Record<string, string> = {},
): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `${basePath}?${s}` : basePath;
}
