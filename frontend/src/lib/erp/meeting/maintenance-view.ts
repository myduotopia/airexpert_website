// 維護完成紀錄（#271）週報頁與列印頁共用的資料載入 — SERVER ONLY。
// 網址參數：range／from／to（見 date-range.ts）、q（關鍵字）、tech（技師 key）。
import "server-only";

import { taipeiToday } from "@/lib/erp/statement";
import { parseMeetingRange, type MeetingRange } from "./date-range";
import {
  MAINTENANCE_REPORT_NAME,
  buildMaintenanceTable,
  filterMaintenanceRows,
  maintenanceTechnicianOptions,
  type MaintenanceTable,
  type MaintenanceTechColumn,
} from "./maintenance";
import {
  firstParam,
  keywordParam,
  meetingQuery,
  type MeetingSearchParams,
} from "./params";
import { listMaintenanceRecords } from "./queries";

export interface MaintenanceView {
  range: MeetingRange;
  q: string;
  tech: string;
  /** 目前條件的查詢字串（列印連結、返回連結用）。 */
  query: string;
  /** 技師篩選選項（區間內全部技師，篩選前）。 */
  techOptions: MaintenanceTechColumn[];
  /** 讀取失敗訊息（此時 table 為空表）。 */
  error: string | null;
  table: MaintenanceTable;
  today: string;
}

export const MAINTENANCE_TITLE = MAINTENANCE_REPORT_NAME;

export async function loadMaintenanceView(
  sp: MeetingSearchParams,
): Promise<MaintenanceView> {
  const today = taipeiToday();
  const range = parseMeetingRange(
    {
      range: firstParam(sp.range),
      from: firstParam(sp.from),
      to: firstParam(sp.to),
    },
    today,
  );
  const q = keywordParam(sp.q);
  const techParam = firstParam(sp.tech);
  const res = await listMaintenanceRecords(range);
  const rows = res.ok ? res.data : [];
  const techOptions = maintenanceTechnicianOptions(rows);
  // 不在選項內的技師（例：換了區間）視為全部，避免整頁空白卻看不出原因。
  const tech = techOptions.some((t) => t.key === techParam) ? techParam : "";
  const table = buildMaintenanceTable(filterMaintenanceRows(rows, { q, tech }));
  return {
    range,
    q,
    tech,
    query: meetingQuery(range, { q, tech }),
    techOptions,
    error: res.ok ? null : res.error,
    table,
    today,
  };
}
