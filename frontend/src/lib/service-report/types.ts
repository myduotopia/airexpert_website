// 機台維護報告單（Service Report）型別與列舉 — client / server 共用（純型別與常數）。
// 欄位對應 supabase/migrations/0021_service_report.sql 的 sr_reports；
// 語意見 docs/superpowers/specs/2026-09-17-service-report-design.md §4。

export type ServiceReportStatus = "draft" | "printed" | "completed" | "voided";
export type TimeSlot = "morning" | "noon" | "afternoon";
export type MachineState = "running" | "standby";
export type ServiceItem =
  | "new_trial"
  | "routine"
  | "periodic"
  | "repair"
  | "other";
export type Suggestion = "transmission" | "motor" | "rotor";
export type CheckStatus = "normal" | "abnormal";
export type FilterConsumable =
  | "usable"
  | "replace"
  | "none"
  | "suggest_install";

/** 回填結果（全部選填；數值保留手寫原樣字串）。 */
export interface ServiceReportResults {
  compressor?: {
    run_hours?: string; // 運轉時數
    consumable_hours?: string; // 耗材時數
    frequency?: string; // 運轉頻率
    set_pressure?: string; // 設定壓力
    temperature?: string; // 運轉溫度
    current?: string; // 運轉電流
    fan?: CheckStatus; // 空壓機風扇
    inverter_fan?: CheckStatus; // 變頻器風扇
    inverter_params?: CheckStatus; // 變頻器參數
  };
  dryer?: {
    total_hours?: string; // 總時數（節能型）
    saving_rate?: string; // 節能率（節能型）
    refrigerant_high?: CheckStatus; // 冷媒高壓
    refrigerant_low?: CheckStatus; // 冷媒低壓
    cooling_fan?: CheckStatus; // 散熱風扇運轉狀況
    auto_drain?: CheckStatus; // 自動排水器功能
    tank_drain?: CheckStatus; // 貯氣桶排水功能
  };
  filter_consumable?: FilterConsumable; // 過濾耗材
}

/** 更換料件一列（固定 10 列，no 1–10）。 */
export interface ServiceReportPart {
  no: number;
  name: string;
  qty: string;
}

/** sr_reports 資料列。 */
export interface ServiceReport {
  id: string;
  report_no: string;
  report_date: string; // ISO date
  time_slot: TimeSlot | null;
  status: ServiceReportStatus;
  customer_id: string | null;
  machine_id: string | null;
  header_code: string | null;
  customer_name: string | null;
  phone: string | null;
  tax_id: string | null;
  contact: string | null;
  address: string | null;
  equipment: string | null;
  model: string | null;
  voltage: string | null;
  serial_no: string | null;
  machine_state: MachineState | null;
  service_items: ServiceItem[];
  summary: string | null;
  results: ServiceReportResults;
  parts: ServiceReportPart[];
  suggestions: Suggestion[];
  technician: string | null;
  customer_signer: string | null;
  note: string | null;
  print_count: number;
  first_printed_at: string | null;
  last_printed_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 表單送出的內容（新增時 id 省略）。狀態、列印紀錄等由 action 控制，不在此。 */
export type ServiceReportInput = Pick<
  ServiceReport,
  | "report_no"
  | "report_date"
  | "time_slot"
  | "customer_id"
  | "machine_id"
  | "header_code"
  | "customer_name"
  | "phone"
  | "tax_id"
  | "contact"
  | "address"
  | "equipment"
  | "model"
  | "voltage"
  | "serial_no"
  | "machine_state"
  | "service_items"
  | "summary"
  | "results"
  | "parts"
  | "suggestions"
  | "technician"
  | "customer_signer"
  | "note"
> & { id?: string };

/** ReportSheet 需要的欄位（草稿預覽、已存單、空白表單皆可）。 */
export type ServiceReportSheetData = Omit<
  ServiceReportInput,
  "id" | "customer_id" | "machine_id" | "note"
>;

export type SrResult<T> = { ok: true; data: T } | { ok: false; error: string };

export const DEFAULT_PART_NAMES: readonly string[] = [
  "螺旋專用油",
  "機油濾清器",
  "空氣濾清器(外)",
  "空氣濾清器(內)",
  "油氣分離器",
  "自動排水器",
  "過濾器濾蕊",
  "",
  "",
  "維護及保養工資",
];

/** 預設 10 列更換料件（數量皆空）。 */
export function defaultParts(): ServiceReportPart[] {
  return DEFAULT_PART_NAMES.map((name, i) => ({ no: i + 1, name, qty: "" }));
}

export const STATUS_LABELS: Record<ServiceReportStatus, string> = {
  draft: "草稿",
  printed: "已列印",
  completed: "已結案",
  voided: "作廢",
};

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
};

export const MACHINE_STATE_LABELS: Record<MachineState, string> = {
  running: "運轉",
  standby: "待機",
};

/** 服務項目（順序＝紙本排列順序）。 */
export const SERVICE_ITEM_LABELS: Record<ServiceItem, string> = {
  new_trial: "新機試車",
  routine: "例檢",
  periodic: "定期大/小保養",
  repair: "查修",
  other: "其他",
};

export const SUGGESTION_LABELS: Record<Suggestion, string> = {
  transmission: "傳動系統年度維護",
  motor: "馬達電機年度維護",
  rotor: "壓縮轉子年度歲修",
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  normal: "正常",
  abnormal: "異常",
};

export const FILTER_CONSUMABLE_LABELS: Record<FilterConsumable, string> = {
  usable: "可續用",
  replace: "建議更換",
  none: "無裝置",
  suggest_install: "建議加裝",
};

/** 空白報告單資料（空白表單列印、新增表單初始值的基礎）。 */
export function emptySheetData(): ServiceReportSheetData {
  return {
    report_no: "",
    report_date: "",
    time_slot: null,
    header_code: null,
    customer_name: null,
    phone: null,
    tax_id: null,
    contact: null,
    address: null,
    equipment: null,
    model: null,
    voltage: null,
    serial_no: null,
    machine_state: null,
    service_items: [],
    summary: null,
    results: {},
    parts: defaultParts(),
    suggestions: [],
    technician: null,
    customer_signer: null,
  };
}
