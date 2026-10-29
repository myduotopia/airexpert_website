// 週報追蹤清單（#272）週報頁與列印頁共用的資料載入 — SERVER ONLY。
// 網址參數見 filters.ts（期間沿用 #271 的 range／from／to，本清單預設 range=all）。
// 一次讀出全部符合篩選的列：清單（頁面再分頁）、CSV、列印共用同一份，筆數一致。
import "server-only";

import { listEmployeeOptions } from "@/lib/employees/queries";
import type { EmployeeOption } from "@/lib/employees/types";
import type { MeetingSearchParams } from "@/lib/erp/meeting/params";
import { taipeiToday } from "@/lib/erp/statement";
import { taipeiYear } from "./display";
import {
  parseTrackingFilters,
  trackingQuery,
  type TrackingFilters,
} from "./filters";
import { listAllTracking, type TrackingRowMap } from "./queries";
import type { TrackingKind } from "./types";

export interface TrackingView<K extends TrackingKind> {
  filters: TrackingFilters;
  /** 目前條件的查詢字串（工具列 query、列印／返回連結、分頁）。 */
  query: string;
  rows: TrackingRowMap[K][];
  /** 員工（含停用；篩選選項與表單選取器用）。 */
  employees: EmployeeOption[];
  today: string;
  refYear: number;
}

export async function loadTrackingView<K extends TrackingKind>(
  kind: K,
  sp: MeetingSearchParams,
): Promise<TrackingView<K>> {
  const today = taipeiToday();
  const filters = parseTrackingFilters(kind, sp, today);
  const [rows, employees] = await Promise.all([
    listAllTracking(kind, filters),
    listEmployeeOptions({ includeInactive: true }),
  ]);
  return {
    filters,
    query: trackingQuery(filters),
    rows,
    employees,
    today,
    refYear: taipeiYear(),
  };
}
