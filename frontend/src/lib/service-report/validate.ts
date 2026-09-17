// 報告單表單驗證與正規化 — 純函式（client / server 皆可用）。
// validateReportInput：回第一個錯誤（中文）或 null。
// normalizeReportInput：通過驗證後，挑出已知欄位、去空白（空字串 → null）、去重，供寫入 DB。
import { isValidReportNo, normalizeReportNo } from "./report-no";
import {
  CHECK_STATUS_LABELS,
  FILTER_CONSUMABLE_LABELS,
  MACHINE_STATE_LABELS,
  SERVICE_ITEM_LABELS,
  SUGGESTION_LABELS,
  TIME_SLOT_LABELS,
  type ServiceItem,
  type ServiceReportInput,
  type ServiceReportPart,
  type ServiceReportResults,
  type Suggestion,
} from "./types";

export const PART_ROW_COUNT = 10;

/** 文字欄位長度上限（字元）。 */
export const TEXT_LIMITS = {
  report_no: 20,
  header_code: 50,
  customer_name: 100,
  phone: 50,
  tax_id: 20,
  contact: 100,
  address: 200,
  equipment: 100,
  model: 100,
  voltage: 50,
  serial_no: 100,
  summary: 2000,
  technician: 50,
  customer_signer: 50,
  note: 2000,
} as const;

export const TEXT_LABELS: Record<keyof typeof TEXT_LIMITS, string> = {
  report_no: "派工單號",
  header_code: "代號",
  customer_name: "客戶名稱",
  phone: "電話",
  tax_id: "統一編號",
  contact: "聯絡人",
  address: "地址",
  equipment: "設備",
  model: "型號",
  voltage: "電壓",
  serial_no: "編號",
  summary: "修護記要及建議",
  technician: "維護人員",
  customer_signer: "客戶簽名",
  note: "備註",
};

export const PART_NAME_MAX = 50;
export const PART_QTY_MAX = 20;
export const RESULT_TEXT_MAX = 50;
export const VOID_REASON_MAX = 500;

type TextField = keyof typeof TEXT_LIMITS;
const NULLABLE_TEXT_FIELDS = (Object.keys(TEXT_LIMITS) as TextField[]).filter(
  (k) => k !== "report_no",
) as Exclude<TextField, "report_no">[];

const COMPRESSOR_TEXT = [
  "run_hours",
  "consumable_hours",
  "frequency",
  "set_pressure",
  "temperature",
  "current",
] as const;
const COMPRESSOR_CHECK = ["fan", "inverter_fan", "inverter_params"] as const;
const DRYER_TEXT = ["total_hours", "saving_rate"] as const;
const DRYER_CHECK = [
  "refrigerant_high",
  "refrigerant_low",
  "cooling_fan",
  "auto_drain",
  "tank_drain",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 是否為 UUID 字串。 */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 是否為實際存在的西元日期 "YYYY-MM-DD"（民國元年以後）。 */
export function isValidIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1912) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasKey<T extends string>(
  labels: Record<T, string>,
  v: unknown,
): v is T {
  return typeof v === "string" && Object.hasOwn(labels, v);
}

/** null / undefined / 字串皆可；其他型別或超長回錯誤。 */
function checkText(v: unknown, max: number, label: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return `${label}格式不正確`;
  if (v.trim().length > max) return `${label}不可超過 ${max} 字`;
  return null;
}

function checkEnumOrNull<T extends string>(
  v: unknown,
  labels: Record<T, string>,
  label: string,
): string | null {
  if (v === null || v === undefined || v === "") return null;
  return hasKey(labels, v) ? null : `${label}選項不正確`;
}

function checkSubset<T extends string>(
  v: unknown,
  labels: Record<T, string>,
  label: string,
): string | null {
  if (!Array.isArray(v)) return `${label}格式不正確`;
  return v.every((x) => hasKey(labels, x)) ? null : `${label}選項不正確`;
}

function checkResults(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (!isRecord(v)) return "檢查結果格式不正確";
  const groups: [string, string, readonly string[], readonly string[]][] = [
    ["compressor", "空壓機檢查", COMPRESSOR_TEXT, COMPRESSOR_CHECK],
    ["dryer", "乾燥機檢查", DRYER_TEXT, DRYER_CHECK],
  ];
  for (const [key, label, textKeys, checkKeys] of groups) {
    const g = v[key];
    if (g === null || g === undefined) continue;
    if (!isRecord(g)) return `${label}格式不正確`;
    for (const k of textKeys) {
      const err = checkText(g[k], RESULT_TEXT_MAX, label);
      if (err) return err;
    }
    for (const k of checkKeys) {
      const err = checkEnumOrNull(g[k], CHECK_STATUS_LABELS, label);
      if (err) return err;
    }
  }
  return checkEnumOrNull(
    v.filter_consumable,
    FILTER_CONSUMABLE_LABELS,
    "過濾耗材",
  );
}

function checkParts(v: unknown): string | null {
  if (!Array.isArray(v) || v.length !== PART_ROW_COUNT) {
    return `更換料件必須為 ${PART_ROW_COUNT} 列`;
  }
  for (let i = 0; i < v.length; i++) {
    const row = v[i];
    if (!isRecord(row) || row.no !== i + 1) {
      return "更換料件編號不正確";
    }
    if (typeof row.name !== "string" || typeof row.qty !== "string") {
      return `更換料件第 ${i + 1} 列格式不正確`;
    }
    if (row.name.trim().length > PART_NAME_MAX) {
      return `更換料件第 ${i + 1} 列品名不可超過 ${PART_NAME_MAX} 字`;
    }
    if (row.qty.trim().length > PART_QTY_MAX) {
      return `更換料件第 ${i + 1} 列數量不可超過 ${PART_QTY_MAX} 字`;
    }
  }
  return null;
}

/**
 * 表單驗證。回第一個錯誤訊息，通過回 null。
 * - 維護日期必填且為有效日期；
 * - 派工單號：新增時可留空（存檔時自動取號）；已存在的單（有 id）必填；有填時須為 X+5 位年月+≥3 位流水號；
 * - 列舉欄位、服務項目 / 建議事項子集合、更換料件固定 10 列（編號 1–10）、文字長度上限。
 */
export function validateReportInput(input: unknown): string | null {
  if (!isRecord(input)) return "資料格式不正確";
  const r = input;

  if (r.id !== undefined && r.id !== null && !isUuid(r.id)) {
    return "找不到報告單";
  }
  if (!r.report_date) return "請輸入維護日期";
  if (!isValidIsoDate(r.report_date)) return "維護日期不正確";

  if (r.report_no !== null && r.report_no !== undefined) {
    if (typeof r.report_no !== "string") return "派工單號格式不正確";
  }
  const no = normalizeReportNo(r.report_no as string | null | undefined);
  if (no === "") {
    if (r.id) return "請輸入派工單號";
  } else {
    if (no.length > TEXT_LIMITS.report_no) {
      return `派工單號不可超過 ${TEXT_LIMITS.report_no} 字`;
    }
    if (!isValidReportNo(no)) {
      return "派工單號格式不正確（例：X11509009）";
    }
  }

  for (const key of ["customer_id", "machine_id"] as const) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== "" && !isUuid(v)) {
      return key === "customer_id" ? "客戶選擇不正確" : "機台選擇不正確";
    }
  }

  let err =
    checkEnumOrNull(r.time_slot, TIME_SLOT_LABELS, "時段") ??
    checkEnumOrNull(r.machine_state, MACHINE_STATE_LABELS, "機台狀態") ??
    checkSubset(r.service_items, SERVICE_ITEM_LABELS, "服務項目") ??
    checkSubset(r.suggestions, SUGGESTION_LABELS, "建議事項");
  if (err) return err;

  for (const key of NULLABLE_TEXT_FIELDS) {
    err = checkText(r[key], TEXT_LIMITS[key], TEXT_LABELS[key]);
    if (err) return err;
  }

  return checkParts(r.parts) ?? checkResults(r.results);
}

/* ------------------------------------------------------------ 正規化 */

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function dedupeInOrder<T extends string>(
  values: unknown[],
  labels: Record<T, string>,
): T[] {
  const set = new Set(values.filter((x): x is T => hasKey(labels, x)));
  // 依標籤定義順序（＝紙本排列）輸出，避免同內容不同順序造成無謂差異。
  return (Object.keys(labels) as T[]).filter((k) => set.has(k));
}

function normalizeResults(v: unknown): ServiceReportResults {
  if (!isRecord(v)) return {};
  const out: ServiceReportResults = {};
  const pick = (
    g: unknown,
    textKeys: readonly string[],
    checkKeys: readonly string[],
  ): Record<string, string> | undefined => {
    if (!isRecord(g)) return undefined;
    const o: Record<string, string> = {};
    for (const k of textKeys) {
      const t = cleanText(g[k]);
      if (t !== null) o[k] = t;
    }
    for (const k of checkKeys) {
      if (hasKey(CHECK_STATUS_LABELS, g[k])) o[k] = g[k];
    }
    return Object.keys(o).length ? o : undefined;
  };
  const compressor = pick(v.compressor, COMPRESSOR_TEXT, COMPRESSOR_CHECK);
  if (compressor) out.compressor = compressor;
  const dryer = pick(v.dryer, DRYER_TEXT, DRYER_CHECK);
  if (dryer) out.dryer = dryer;
  if (hasKey(FILTER_CONSUMABLE_LABELS, v.filter_consumable)) {
    out.filter_consumable = v.filter_consumable;
  }
  return out;
}

/** 寫入 DB 的報告單欄位（不含 id、狀態、列印紀錄）。 */
export type ServiceReportWrite = Omit<ServiceReportInput, "id">;

/**
 * 通過 validateReportInput 後呼叫：只留已知欄位、文字 trim（空 → null）、
 * 單號正規化（空字串代表待取號）、服務項目 / 建議事項去重並依紙本順序排列。
 */
export function normalizeReportInput(
  input: ServiceReportInput,
): ServiceReportWrite {
  const out = {
    report_no: normalizeReportNo(input.report_no),
    report_date: input.report_date,
    time_slot: hasKey(TIME_SLOT_LABELS, input.time_slot)
      ? input.time_slot
      : null,
    customer_id: isUuid(input.customer_id) ? input.customer_id : null,
    machine_id: isUuid(input.machine_id) ? input.machine_id : null,
    machine_state: hasKey(MACHINE_STATE_LABELS, input.machine_state)
      ? input.machine_state
      : null,
    service_items: dedupeInOrder<ServiceItem>(
      input.service_items ?? [],
      SERVICE_ITEM_LABELS,
    ),
    suggestions: dedupeInOrder<Suggestion>(
      input.suggestions ?? [],
      SUGGESTION_LABELS,
    ),
    results: normalizeResults(input.results),
    parts: (input.parts ?? []).map(
      (p): ServiceReportPart => ({
        no: p.no,
        name: (p.name ?? "").trim(),
        qty: (p.qty ?? "").trim(),
      }),
    ),
  } as ServiceReportWrite;
  for (const key of NULLABLE_TEXT_FIELDS) {
    out[key] = cleanText(input[key]);
  }
  return out;
}

/** 作廢原因驗證：必填、長度上限。 */
export function validateVoidReason(reason: unknown): string | null {
  if (typeof reason !== "string" || reason.trim() === "") {
    return "請輸入作廢原因";
  }
  if (reason.trim().length > VOID_REASON_MAX) {
    return `作廢原因不可超過 ${VOID_REASON_MAX} 字`;
  }
  return null;
}
