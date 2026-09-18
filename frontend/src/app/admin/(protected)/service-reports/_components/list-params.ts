// 報告單列表的 URL 查詢參數（純函式，server / client 共用）。
// 列表所有篩選狀態都放在 URL（可分享、可用瀏覽器上一頁）：
// q 關鍵字、status 狀態、from / to 維護日期區間（西元 ISO）、page 頁碼。
// 日期參數同時接受民國（112/4/20、112-04-20）與西元（2023-04-20），一律正規化成 ISO。
import { rocPartsToIso } from "@/lib/admin/minguo";
import {
  STATUS_LABELS,
  type ServiceReportStatus,
} from "@/lib/service-report/types";

export type ListSearchParams = Record<string, string | string[] | undefined>;

export interface ReportListQuery {
  /** 關鍵字：派工單號 / 客戶名稱 / 設備 / 編號。 */
  q: string;
  /** 空字串 = 全部。 */
  status: ServiceReportStatus | "";
  /** 維護日期起訖（西元 ISO，含端點）；空字串 = 不限。 */
  from: string;
  to: string;
  /** 1 起算。 */
  page: number;
}

export const SERVICE_REPORTS_PATH = "/admin/service-reports";

/** 關鍵字長度上限（避免超長 query string）。 */
const MAX_Q = 100;
/** 頁碼上限（避免 ?page=1e9 造成無謂查詢；超出最後一頁由 listReports 處理）。 */
const MAX_PAGE = 100000;

const ISO_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const ROC_DATE = /^(\d{1,3})[-/.](\d{1,2})[-/.](\d{1,2})$/;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 日期參數 → 西元 ISO "YYYY-MM-DD"；空 / 不合法回 ""。
 * 4 位年視為西元（1912 起），1–3 位年視為民國（走 rocPartsToIso）。
 */
export function toIsoDateParam(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const iso = ISO_DATE.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (y < 1912 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const roc = ROC_DATE.exec(s);
  if (roc) return rocPartsToIso(roc[1], roc[2], roc[3]);
  return "";
}

/** searchParams → 正規化後的查詢條件（不合法的值一律退回預設）。 */
export function parseReportListParams(sp: ListSearchParams): ReportListQuery {
  const status = first(sp.status);
  const page = Number.parseInt(first(sp.page), 10);
  return {
    q: first(sp.q).trim().slice(0, MAX_Q),
    status: Object.hasOwn(STATUS_LABELS, status)
      ? (status as ServiceReportStatus)
      : "",
    from: toIsoDateParam(first(sp.from)),
    to: toIsoDateParam(first(sp.to)),
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  };
}

/** 查詢條件 → 列表網址（省略空值與 page=1）。 */
export function reportListHref(
  query: ReportListQuery,
  page: number = query.page,
): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${SERVICE_REPORTS_PATH}?${qs}` : SERVICE_REPORTS_PATH;
}

/** 是否有任何篩選條件（決定空列表的說明文字）。 */
export function hasActiveFilters(query: ReportListQuery): boolean {
  return Boolean(query.q || query.status || query.from || query.to);
}
