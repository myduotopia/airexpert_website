// ERP 週報 › 維護完成紀錄（#271）— 純函式（client / server 皆可用、可單元測試）。
// 資料來源：DB RPC erp_meeting_maintenance（0037，只回已結案、未作廢的報告單與報表需要的欄位）。
//   · 處理進度摘要：由服務項目、回填檢查結果、運轉時數／溫度、更換料件、過濾耗材、建議事項、型號組成，
//     例：「例檢OK 時2209 溫84 AM3-37A-E30」「查修 異常：變頻器風扇 時5120 換機油濾清器 SP50」。
//   · 技師欄位：依區間內（篩選後）實際出現的技師動態產生，顯示工時比例，表尾為各技師合計。
//     沒有技師列、只有「維護人員」文字的舊報告單，以該姓名為一欄、比例 1（標示為未建檔）。
import { cleanEmployeeName, employeeNameKey } from "@/lib/employees/normalize";
import type {
  CheckStatus,
  ServiceReportPart,
  ServiceReportResults,
} from "@/lib/service-report/types";
import type { CsvCell } from "./csv";

export const MAINTENANCE_REPORT_NAME = "維護完成紀錄";

/** RPC 回傳的技師（jsonb）。 */
export interface MaintenanceTechnician {
  employee_id: string;
  name: string;
  code: string | null;
  share: number;
  is_primary: boolean;
}

/** RPC 回傳的一列（erp_meeting_maintenance）。 */
export interface MaintenanceSourceRow {
  id: string;
  report_no: string;
  report_date: string;
  customer_name: string | null;
  summary: string | null;
  equipment: string | null;
  model: string | null;
  service_items: string[] | null;
  results: ServiceReportResults | null;
  parts: ServiceReportPart[] | null;
  suggestions: string[] | null;
  /** 主技師姓名快照（舊資料可能只有這個）。 */
  technician: string | null;
  technicians: MaintenanceTechnician[] | null;
}

/** 報表中的一位技師（欄）。key：員工 id；舊資料純文字為「name:<姓名 key>」。 */
export interface MaintenanceTechColumn {
  key: string;
  name: string;
  code: string | null;
  /** 只有文字、未關聯員工主檔的舊資料。 */
  legacy: boolean;
}

export interface MaintenanceTableRow {
  id: string;
  report_no: string;
  report_date: string;
  customer_name: string;
  summary: string;
  progress: string;
  /** 技師 key → 比例。 */
  shares: Record<string, number>;
}

export interface MaintenanceTable {
  columns: MaintenanceTechColumn[];
  rows: MaintenanceTableRow[];
  /** 技師 key → 合計比例。 */
  totals: Record<string, number>;
}

// ── 處理進度摘要 ────────────────────────────────────────────

/** 服務項目的簡稱（報表空間有限）。 */
const SERVICE_SHORT: Record<string, string> = {
  new_trial: "新機試車",
  routine: "例檢",
  periodic: "定保",
  repair: "查修",
  other: "其他",
};

const COMPRESSOR_CHECKS: { key: string; label: string }[] = [
  { key: "fan", label: "空壓機風扇" },
  { key: "inverter_fan", label: "變頻器風扇" },
  { key: "inverter_params", label: "變頻器參數" },
];
const DRYER_CHECKS: { key: string; label: string }[] = [
  { key: "refrigerant_high", label: "冷媒高壓" },
  { key: "refrigerant_low", label: "冷媒低壓" },
  { key: "cooling_fan", label: "散熱風扇" },
  { key: "auto_drain", label: "自動排水器" },
  { key: "tank_drain", label: "貯氣桶排水" },
];

const SUGGESTION_SHORT: Record<string, string> = {
  transmission: "傳動系統年度維護",
  motor: "馬達電機年度維護",
  rotor: "壓縮轉子年度歲修",
};

/** 工資列不是料件，不列入「換」。 */
const LABOR_PART = "維護及保養工資";

function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function abnormalChecks(results: ServiceReportResults | null): string[] {
  const out: string[] = [];
  const groups: [Record<string, unknown> | undefined, typeof DRYER_CHECKS][] = [
    [
      results?.compressor as Record<string, unknown> | undefined,
      COMPRESSOR_CHECKS,
    ],
    [results?.dryer as Record<string, unknown> | undefined, DRYER_CHECKS],
  ];
  for (const [group, checks] of groups) {
    for (const c of checks) {
      if ((group?.[c.key] as CheckStatus | undefined) === "abnormal") {
        out.push(c.label);
      }
    }
  }
  return out;
}

/**
 * 處理進度摘要（空白分隔，依序）：
 *   1. 服務項目簡稱（多項以「/」連接）＋「OK」；任一檢查為異常 → 「異常：項目、項目」取代 OK
 *   2. 時<運轉時數>、溫<運轉溫度>（有填才列）
 *   3. 換<有填數量的料件品名>（不含工資列）
 *   4. 過濾耗材：建議更換／建議加裝（其餘不列）
 *   5. 建議<建議事項>
 *   6. 型號（沒有型號時用設備）
 */
export function maintenanceProgress(
  row: Pick<
    MaintenanceSourceRow,
    | "service_items"
    | "results"
    | "parts"
    | "suggestions"
    | "model"
    | "equipment"
  >,
): string {
  const parts: string[] = [];
  const items = (row.service_items ?? [])
    .map((k) => SERVICE_SHORT[k])
    .filter((v): v is string => Boolean(v));
  const head = items.join("/");
  const abnormal = abnormalChecks(row.results);
  parts.push(
    abnormal.length
      ? `${head ? `${head} ` : ""}異常：${abnormal.join("、")}`
      : `${head}OK`,
  );

  const hours = text(row.results?.compressor?.run_hours);
  if (hours) parts.push(`時${hours}`);
  const temp = text(row.results?.compressor?.temperature);
  if (temp) parts.push(`溫${temp}`);

  const replaced = (row.parts ?? [])
    .filter((p) => text(p?.qty) !== "" && text(p?.name) !== "")
    .map((p) => text(p.name))
    .filter((name) => name !== LABOR_PART);
  if (replaced.length) parts.push(`換${replaced.join("、")}`);

  const filter = row.results?.filter_consumable;
  if (filter === "replace") parts.push("過濾耗材建議更換");
  if (filter === "suggest_install") parts.push("建議加裝過濾設備");

  const suggestions = (row.suggestions ?? [])
    .map((k) => SUGGESTION_SHORT[k])
    .filter((v): v is string => Boolean(v));
  if (suggestions.length) parts.push(`建議${suggestions.join("、")}`);

  const model = text(row.model) || text(row.equipment);
  if (model) parts.push(model);
  return parts.join(" ");
}

// ── 技師與比例 ─────────────────────────────────────────────

/** 比例（數字）→ 百分之一整數，避免浮點累加誤差。 */
function hundredths(n: number): number {
  return Math.round(n * 100);
}

/** 比例顯示：去掉多餘的 0（1、0.5、0.33）；0 或非數字回空字串。 */
export function formatShare(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "";
  return String(hundredths(n) / 100);
}

/** 一列的技師（含舊資料純文字）。 */
export function rowTechnicians(
  row: Pick<MaintenanceSourceRow, "technician" | "technicians">,
): (MaintenanceTechColumn & { share: number })[] {
  const list = row.technicians ?? [];
  if (list.length) {
    return list.map((t) => ({
      key: t.employee_id,
      name: t.name,
      code: t.code ?? null,
      legacy: false,
      share: Number(t.share),
    }));
  }
  const name = cleanEmployeeName(row.technician ?? "");
  if (!name) return [];
  return [
    {
      key: `name:${employeeNameKey(name)}`,
      name,
      code: null,
      legacy: true,
      share: 1,
    },
  ];
}

/** 技師欄位排序：主檔員工在前（代號 → 姓名），舊資料文字在後。 */
export function compareTechColumns(
  a: MaintenanceTechColumn,
  b: MaintenanceTechColumn,
): number {
  if (a.legacy !== b.legacy) return a.legacy ? 1 : -1;
  const ac = a.code ?? "";
  const bc = b.code ?? "";
  if (ac !== bc) {
    if (!ac) return 1;
    if (!bc) return -1;
    return ac.localeCompare(bc, "zh-Hant", { numeric: true });
  }
  return a.name.localeCompare(b.name, "zh-Hant");
}

/** 區間內出現過的技師（技師篩選的選項）。 */
export function maintenanceTechnicianOptions(
  rows: readonly MaintenanceSourceRow[],
): MaintenanceTechColumn[] {
  const map = new Map<string, MaintenanceTechColumn>();
  for (const row of rows) {
    for (const t of rowTechnicians(row)) {
      if (!map.has(t.key)) {
        map.set(t.key, {
          key: t.key,
          name: t.name,
          code: t.code,
          legacy: t.legacy,
        });
      }
    }
  }
  return [...map.values()].sort(compareTechColumns);
}

// ── 篩選與表格 ─────────────────────────────────────────────

export interface MaintenanceFilter {
  /** 關鍵字：客戶、損壞狀況、處理進度、派工單號（不分大小寫）。 */
  q?: string;
  /** 技師 key（員工 id 或 name:<姓名 key>）；空＝全部。 */
  tech?: string;
}

export function filterMaintenanceRows(
  rows: readonly MaintenanceSourceRow[],
  filter: MaintenanceFilter,
): MaintenanceSourceRow[] {
  const q = (filter.q ?? "").trim().toLowerCase();
  const tech = (filter.tech ?? "").trim();
  return rows.filter((row) => {
    if (tech && !rowTechnicians(row).some((t) => t.key === tech)) return false;
    if (!q) return true;
    const hay = [
      row.customer_name,
      row.summary,
      row.report_no,
      maintenanceProgress(row),
    ]
      .map((v) => (v ?? "").toLowerCase())
      .join("\n");
    return hay.includes(q);
  });
}

/** 表格：欄位依（已篩選的）列中出現的技師動態產生，表尾各技師合計。 */
export function buildMaintenanceTable(
  rows: readonly MaintenanceSourceRow[],
): MaintenanceTable {
  const columns = maintenanceTechnicianOptions(rows);
  const totalsH: Record<string, number> = {};
  for (const c of columns) totalsH[c.key] = 0;

  const out: MaintenanceTableRow[] = rows.map((row) => {
    const shares: Record<string, number> = {};
    for (const t of rowTechnicians(row)) {
      const h = hundredths(t.share);
      shares[t.key] = (hundredths(shares[t.key] ?? 0) + h) / 100;
      totalsH[t.key] += h;
    }
    return {
      id: row.id,
      report_no: row.report_no,
      report_date: row.report_date,
      customer_name: text(row.customer_name),
      summary: (row.summary ?? "").trim(),
      progress: maintenanceProgress(row),
      shares,
    };
  });

  const totals: Record<string, number> = {};
  for (const [k, v] of Object.entries(totalsH)) totals[k] = v / 100;
  return { columns, rows: out, totals };
}

/** 民國短日期「115/10/27」。 */
export function rocShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1]) - 1911}/${m[2]}/${m[3]}`;
}

/** 技師欄標題（舊資料加註）。 */
export function techColumnLabel(c: MaintenanceTechColumn): string {
  return c.legacy ? `${c.name}（未建檔）` : c.name;
}

/** CSV：日期、派工單號、客戶簡稱、損壞狀況、各技師、處理進度；最後一列為合計。 */
export function maintenanceCsvRows(table: MaintenanceTable): {
  headers: string[];
  rows: CsvCell[][];
} {
  const headers = [
    "日期",
    "派工單號",
    "客戶簡稱",
    "損壞狀況",
    ...table.columns.map(techColumnLabel),
    "處理進度",
  ];
  const rows: CsvCell[][] = table.rows.map((r) => [
    rocShortDate(r.report_date),
    r.report_no,
    r.customer_name,
    r.summary,
    ...table.columns.map((c) => formatShare(r.shares[c.key])),
    r.progress,
  ]);
  rows.push([
    "合計",
    `${table.rows.length} 筆`,
    "",
    "",
    ...table.columns.map((c) => formatShare(table.totals[c.key])),
    "",
  ]);
  return { headers, rows };
}
