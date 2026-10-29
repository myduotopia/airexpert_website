// 週報追蹤清單（#272）的篩選參數與查詢規格。純函式，client / server 共用。
//
// 網址參數：q（關鍵字，空白分隔多字＝皆須符合；最長 100 字）、status（open＝未結案〔預設〕／all／各狀態值）、
//          owner（員工 uuid／none＝負責人待確認）、page，
//          以及 #271 週報共用的期間 range／from／to（lib/erp/meeting/date-range.ts；本清單預設 range=all＝不限日期）。
// 查詢規格（trackingQuerySpec）是與 supabase-js 無關的描述，由 queries.ts 套到 PostgREST 查詢上，
// 方便以單元測試確認篩選與排序。
import {
  parseMeetingRange,
  type MeetingRange,
} from "@/lib/erp/meeting/date-range";
import {
  firstParam,
  keywordParam,
  meetingQuery,
  type MeetingSearchParams,
} from "@/lib/erp/meeting/params";
import { taipeiToday } from "@/lib/erp/statement";
import { isUuid } from "./normalize";
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
  /** 期間（preset = all 時不限日期，from／to 為空字串）。 */
  range: MeetingRange;
  page: number;
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
  sp: MeetingSearchParams,
  today: string = taipeiToday(),
): TrackingFilters {
  const statusRaw = firstParam(sp.status);
  const status =
    statusRaw === "all" || STATUSES[kind].includes(statusRaw)
      ? statusRaw
      : "open";
  const ownerRaw = firstParam(sp.owner);
  const owner =
    ownerRaw === "none" || isUuid(ownerRaw) ? ownerRaw.toLowerCase() : "";
  const range = parseMeetingRange(
    {
      range: firstParam(sp.range),
      from: firstParam(sp.from),
      to: firstParam(sp.to),
    },
    today,
    { allowAll: true },
  );
  const pageNum = Number(firstParam(sp.page));
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  return { q: keywordParam(sp.q), status, owner, range, page };
}

/**
 * 目前條件的查詢字串（不含頁碼；省略預設的狀態 open）：
 * 工具列 query（換頁重新掛載表單）、列印連結、分頁連結共用。
 */
export function trackingQuery(f: TrackingFilters): string {
  return meetingQuery(f.range, {
    q: f.q,
    status: f.status === "open" ? null : f.status,
    owner: f.owner,
  });
}

/** 分頁元件用的參數物件（同 trackingQuery）。 */
export function trackingParams(f: TrackingFilters): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(trackingQuery(f)));
}

// ── 查詢規格 ─────────────────────────────────────────────────

export type QueryFilter =
  | { op: "eq"; column: string; value: string }
  | { op: "not_in"; column: string; values: string[] }
  | { op: "is_null"; column: string }
  | { op: "gte"; column: string; value: string }
  | { op: "lte"; column: string; value: string }
  | { op: "ilike"; column: string; value: string }
  /**
   * PostgREST or=(…) 內容；值只會是 uuid 或已驗證的 YYYY-MM-DD，不需跳脫。
   * 一份規格最多一個（多組條件以 and(or(…),or(…)) 合併成一個參數）。
   */
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
  /** 各組 or 條件（最後合併成一個 or 參數）。 */
  const orGroups: string[] = [];

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
    if (kind === "delivery") {
      orGroups.push(
        `sales_rep_id.eq.${f.owner},delivery_owner_id.eq.${f.owner}`,
      );
    } else {
      filters.push({ op: "eq", column: "owner_id", value: f.owner });
    }
  }

  // 日期區間（range = all 不限）：交機進度以「交機時間與區間重疊」判斷，
  // 交機時間待確認（起迄皆空）者也列出（週會要看到還沒排定的交機；排序在最後、畫面標紅字「待確認」）；
  // 其餘為單一日期欄位（皆 not null）。
  const { from, to } = f.range;
  if (f.range.preset !== "all" && from && to) {
    if (kind === "delivery") {
      orGroups.push(
        `and(delivery_end.gte.${from},delivery_start.lte.${to}),delivery_start.is.null`,
      );
    } else {
      const col = kind === "repairs" ? "received_on" : "occurred_on";
      filters.push({ op: "gte", column: col, value: from });
      filters.push({ op: "lte", column: col, value: to });
    }
  }

  if (orGroups.length === 1) {
    filters.push({ op: "or", value: orGroups[0] });
  } else if (orGroups.length > 1) {
    filters.push({
      op: "or",
      value: `and(${orGroups.map((g) => `or(${g})`).join(",")})`,
    });
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

// ── 分頁 ─────────────────────────────────────────────────────

/** 清單每頁筆數（同 ERP 基本資料）。 */
export const TRACKING_PAGE_SIZE = 50;

/**
 * 清單分頁（頁面一次讀出全部符合篩選的列，CSV 與列印也用同一份；畫面只顯示一頁）。
 * 頁碼超過最後一頁時改顯示最後一頁。
 */
export function pageSlice<T>(
  rows: T[],
  page: number,
  pageSize: number = TRACKING_PAGE_SIZE,
): { rows: T[]; page: number; total: number; pageSize: number } {
  const total = rows.length;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), last);
  const start = (p - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: p,
    total,
    pageSize,
  };
}
