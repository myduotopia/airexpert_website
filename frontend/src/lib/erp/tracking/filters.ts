// 週報追蹤清單（#272）的篩選參數與查詢規格。純函式，client / server 共用。
//
// 網址參數：q（關鍵字，空白分隔多字＝皆須符合）、status（open＝未結案〔預設〕／all／各狀態值）、
//          owner（員工 uuid／none＝負責人待確認）、from／to（YYYY-MM-DD）、page。
// 查詢規格（trackingQuerySpec）是與 supabase-js 無關的描述，由 queries.ts 套到 PostgREST 查詢上，
// 方便以單元測試確認篩選與排序。
import { isIsoDate, isUuid } from "./normalize";
import {
  DELIVERY_CLOSED,
  DELIVERY_STATUSES,
  MACHINE_ISSUE_CLOSED,
  MACHINE_ISSUE_STATUSES,
  REPAIR_CLOSED,
  REPAIR_STATUSES,
  type TrackingKind,
} from "./types";

export interface TrackingFilters {
  q: string;
  /** open（未結案）／all／該類別的狀態值。 */
  status: string;
  /** '' = 不限；none = 待確認（未指定）；或員工 uuid。 */
  owner: string;
  from: string;
  to: string;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

const STATUSES: Record<TrackingKind, readonly string[]> = {
  delivery: DELIVERY_STATUSES,
  repairs: REPAIR_STATUSES,
  "machine-issues": MACHINE_ISSUE_STATUSES,
};

const CLOSED: Record<TrackingKind, readonly string[]> = {
  delivery: DELIVERY_CLOSED,
  repairs: REPAIR_CLOSED,
  "machine-issues": MACHINE_ISSUE_CLOSED,
};

export function parseTrackingFilters(
  kind: TrackingKind,
  sp: SearchParams,
): TrackingFilters {
  const statusRaw = first(sp.status);
  const status =
    statusRaw === "all" || STATUSES[kind].includes(statusRaw)
      ? statusRaw
      : "open";
  const ownerRaw = first(sp.owner);
  const owner =
    ownerRaw === "none" || isUuid(ownerRaw) ? ownerRaw.toLowerCase() : "";
  let from = first(sp.from);
  let to = first(sp.to);
  if (!isIsoDate(from)) from = "";
  if (!isIsoDate(to)) to = "";
  if (from && to && from > to) [from, to] = [to, from];
  const pageNum = Number(first(sp.page));
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  return { q: first(sp.q), status, owner, from, to, page };
}

/** 篩選 → 網址參數（省略預設值與頁碼；分頁、列印、匯出連結共用）。 */
export function filtersToParams(f: TrackingFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.status !== "open") out.status = f.status;
  if (f.owner) out.owner = f.owner;
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  return out;
}

// ── 查詢規格 ─────────────────────────────────────────────────

export type QueryFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "not_in"; column: string; values: string[] }
  | { op: "is_null"; column: string }
  | { op: "gte"; column: string; value: string }
  | { op: "lte"; column: string; value: string }
  | { op: "ilike"; column: string; value: string }
  /** PostgREST or=(…) 字串；值只會是 uuid，不需跳脫。 */
  | { op: "or"; value: string };

export interface QueryOrder {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface TrackingQuerySpec {
  view: string;
  filters: QueryFilter[];
  order: QueryOrder[];
}

const VIEWS: Record<TrackingKind, string> = {
  delivery: "delivery_jobs_view",
  repairs: "repair_jobs_view",
  "machine-issues": "machine_issues_view",
};

/** 關鍵字 → ilike 樣式：PostgREST 會把 * 當萬用字元，先換成空白；LIKE 的 \ % _ 跳脫。 */
export function searchPatterns(q: string): string[] {
  return q
    .replace(/[*,()"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

export function trackingQuerySpec(
  kind: TrackingKind,
  f: TrackingFilters,
): TrackingQuerySpec {
  const filters: QueryFilter[] = [];

  if (f.status === "open") {
    filters.push({ op: "not_in", column: "status", values: [...CLOSED[kind]] });
  } else if (f.status !== "all") {
    filters.push({ op: "eq", column: "status", value: f.status });
  }

  if (f.owner === "none") {
    filters.push({
      op: "is_null",
      column: kind === "delivery" ? "delivery_owner_id" : "owner_id",
    });
  } else if (f.owner) {
    filters.push(
      kind === "delivery"
        ? {
            op: "or",
            value: `sales_rep_id.eq.${f.owner},delivery_owner_id.eq.${f.owner}`,
          }
        : { op: "eq", column: "owner_id", value: f.owner },
    );
  }

  // 日期區間：交機進度以「交機時間與區間重疊」判斷（待確認者不列入）；其餘為單一日期欄位。
  if (kind === "delivery") {
    if (f.from)
      filters.push({ op: "gte", column: "delivery_end", value: f.from });
    if (f.to)
      filters.push({ op: "lte", column: "delivery_start", value: f.to });
  } else {
    const col = kind === "repairs" ? "received_on" : "occurred_on";
    if (f.from) filters.push({ op: "gte", column: col, value: f.from });
    if (f.to) filters.push({ op: "lte", column: col, value: f.to });
  }

  for (const value of searchPatterns(f.q)) {
    filters.push({ op: "ilike", column: "search_text", value });
  }

  const tail: QueryOrder[] = [
    { column: "created_at", ascending: true },
    { column: "id", ascending: true },
  ];
  const order: QueryOrder[] =
    kind === "delivery"
      ? [
          { column: "delivery_start", ascending: true, nullsFirst: false },
          ...tail,
        ]
      : kind === "repairs"
        ? [{ column: "received_on", ascending: true }, ...tail]
        : [
            { column: "is_key", ascending: false },
            { column: "occurred_on", ascending: true },
            ...tail,
          ];

  return { view: VIEWS[kind], filters, order };
}
