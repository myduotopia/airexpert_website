// 報告單表單狀態與轉換 — 純函式（client / server 皆可用、可單元測試）。
// ReportForm 只負責 React 綁定，所有「怎麼變」的決策都放這裡：
//   · 表單狀態 ↔ DB 資料列 / server action 輸入 / ReportSheet 預覽資料
//   · 客戶／機台帶入的覆蓋判斷（spec §6：變更客戶會詢問是否覆蓋已填欄位）
//   · 更換料件 10 列編輯、勾選項目切換
// 文字欄位在狀態內一律為 string（受控輸入不可為 null），送出時空字串 → null。
import {
  prefillFromCustomer,
  prefillFromMachine,
  type SrCustomerOption,
  type SrMachineOption,
} from "@/lib/service-report/prefill";
import {
  defaultParts,
  type MachineState,
  type ServiceItem,
  type ServiceReport,
  type ServiceReportInput,
  type ServiceReportPart,
  type ServiceReportResults,
  type ServiceReportSheetData,
  type Suggestion,
  type TimeSlot,
} from "@/lib/service-report/types";
import { PART_ROW_COUNT } from "@/lib/service-report/validate";

/** 表單狀態（文字欄位皆為 string；列舉欄位可為 null＝未選）。 */
export interface ReportFormState {
  report_no: string;
  report_date: string; // 西元 ISO YYYY-MM-DD
  time_slot: TimeSlot | null;
  customer_id: string | null;
  machine_id: string | null;
  header_code: string;
  customer_name: string;
  phone: string;
  tax_id: string;
  contact: string;
  address: string;
  equipment: string;
  model: string;
  voltage: string;
  serial_no: string;
  machine_state: MachineState | null;
  service_items: ServiceItem[];
  summary: string;
  results: ServiceReportResults;
  parts: ServiceReportPart[];
  suggestions: Suggestion[];
  technician: string;
  customer_signer: string;
  note: string;
}

/** 表單中的純文字欄位（狀態為 string、DB 為 text null）。 */
export type ReportTextField =
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
  | "summary"
  | "technician"
  | "customer_signer"
  | "note";

const TEXT_FIELDS: readonly ReportTextField[] = [
  "header_code",
  "customer_name",
  "phone",
  "tax_id",
  "contact",
  "address",
  "equipment",
  "model",
  "voltage",
  "serial_no",
  "summary",
  "technician",
  "customer_signer",
  "note",
];

/** 選客戶會帶入的欄位（＝變更客戶時可能被覆蓋的欄位）。 */
export const CUSTOMER_PREFILL_FIELDS: readonly ReportTextField[] = [
  "customer_name",
  "phone",
  "tax_id",
  "contact",
  "address",
  "header_code",
];

/** 選機台會帶入的欄位。 */
export const MACHINE_PREFILL_FIELDS: readonly ReportTextField[] = [
  "equipment",
  "model",
  "voltage",
  "serial_no",
  "header_code",
];

export const FIELD_LABELS: Record<ReportTextField, string> = {
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

function str(v: string | null | undefined): string {
  return v ?? "";
}

/** 空字串（或只有空白）→ null，供寫入 DB。 */
function orNull(v: string): string | null {
  return v.trim() === "" ? null : v;
}

/** 固定 10 列、編號 1–10；缺列補預設品名，多餘列捨去。 */
export function normalizeParts(
  parts: readonly ServiceReportPart[] | null | undefined,
): ServiceReportPart[] {
  const base = defaultParts();
  const byNo = new Map<number, ServiceReportPart>();
  for (const p of parts ?? []) {
    if (p && Number.isInteger(p.no)) byNo.set(p.no, p);
  }
  return base.map((d) => {
    const found = byNo.get(d.no);
    return found
      ? { no: d.no, name: str(found.name), qty: str(found.qty) }
      : { ...d };
  });
}

/** 新報告單的初始狀態（派工單號留空＝儲存時自動編號）。 */
export function emptyFormState(todayIso: string): ReportFormState {
  return {
    report_no: "",
    report_date: todayIso,
    time_slot: null,
    customer_id: null,
    machine_id: null,
    header_code: "",
    customer_name: "",
    phone: "",
    tax_id: "",
    contact: "",
    address: "",
    equipment: "",
    model: "",
    voltage: "",
    serial_no: "",
    machine_state: null,
    service_items: [],
    summary: "",
    results: {},
    parts: defaultParts(),
    suggestions: [],
    technician: "",
    customer_signer: "",
    note: "",
  };
}

/** DB 資料列 → 表單狀態（編輯頁）。 */
export function formStateFromReport(report: ServiceReport): ReportFormState {
  const state = emptyFormState(report.report_date);
  for (const key of TEXT_FIELDS) state[key] = str(report[key]);
  return {
    ...state,
    report_no: str(report.report_no),
    report_date: report.report_date,
    time_slot: report.time_slot ?? null,
    customer_id: report.customer_id ?? null,
    machine_id: report.machine_id ?? null,
    machine_state: report.machine_state ?? null,
    service_items: [...(report.service_items ?? [])],
    suggestions: [...(report.suggestions ?? [])],
    results: report.results ?? {},
    parts: normalizeParts(report.parts),
  };
}

/** 表單狀態 → ReportSheet 預覽資料（空字串以 null 呈現＝紙上留白）。 */
export function formStateToSheetData(
  state: ReportFormState,
): ServiceReportSheetData {
  return {
    report_no: state.report_no,
    report_date: state.report_date,
    time_slot: state.time_slot,
    header_code: orNull(state.header_code),
    customer_name: orNull(state.customer_name),
    phone: orNull(state.phone),
    tax_id: orNull(state.tax_id),
    contact: orNull(state.contact),
    address: orNull(state.address),
    equipment: orNull(state.equipment),
    model: orNull(state.model),
    voltage: orNull(state.voltage),
    serial_no: orNull(state.serial_no),
    machine_state: state.machine_state,
    service_items: state.service_items,
    summary: orNull(state.summary),
    results: state.results,
    parts: state.parts,
    suggestions: state.suggestions,
    technician: orNull(state.technician),
    customer_signer: orNull(state.customer_signer),
  };
}

/** DB 資料列 → ReportSheet 資料（列印頁、唯讀預覽）。 */
export function sheetDataFromReport(
  report: ServiceReport,
): ServiceReportSheetData {
  return formStateToSheetData(formStateFromReport(report));
}

/** 表單狀態 → saveReportAction 輸入（id 省略＝新增）。 */
export function formStateToInput(
  state: ReportFormState,
  id?: string | null,
): ServiceReportInput {
  const input: ServiceReportInput = {
    ...formStateToSheetData(state),
    customer_id: state.customer_id,
    machine_id: state.machine_id,
    note: orNull(state.note),
  };
  if (id) input.id = id;
  return input;
}

/* ------------------------------------------------------- 帶入（prefill） */

/** 帶入時會被蓋掉的欄位：目前有值且與帶入值不同。 */
function conflictFields(
  state: ReportFormState,
  next: Partial<Record<ReportTextField, string | null>>,
  fields: readonly ReportTextField[],
): ReportTextField[] {
  return fields.filter((f) => {
    const current = state[f].trim();
    if (current === "") return false;
    return current !== str(next[f]).trim();
  });
}

function applyFields(
  state: ReportFormState,
  next: Partial<Record<ReportTextField, string | null>>,
  fields: readonly ReportTextField[],
  overwrite: boolean,
): ReportFormState {
  const out = { ...state };
  for (const f of fields) {
    const value = str(next[f]);
    // 不覆蓋時只補空欄位；帶入值為空也不清掉使用者已填的內容。
    if (overwrite) out[f] = value;
    else if (out[f].trim() === "" && value !== "") out[f] = value;
  }
  return out;
}

/** 選客戶會帶入的欄位值（含代號＝客戶編號）。 */
function customerValues(
  customer: SrCustomerOption,
): Partial<Record<ReportTextField, string | null>> {
  const p = prefillFromCustomer(customer);
  return {
    customer_name: p.customer_name,
    phone: p.phone,
    tax_id: p.tax_id,
    contact: p.contact,
    address: p.address,
    // 機台尚未選，代號先只有客戶編號；選機台後補上「-機台代號」。
    header_code: customer.code,
  };
}

/**
 * 帶入這個客戶時，哪些已填欄位會被覆蓋（空陣列＝可直接帶入，不必詢問）。
 * 呼叫端只在「客戶真的換了」時詢問（同一客戶不重複帶入，以免蓋掉手動修改）。
 */
export function customerPrefillConflicts(
  state: ReportFormState,
  customer: SrCustomerOption,
): ReportTextField[] {
  return conflictFields(
    state,
    customerValues(customer),
    CUSTOMER_PREFILL_FIELDS,
  );
}

/**
 * 選客戶：一律換 customer_id 並清掉機台選擇（機台清單以客戶為範圍）。
 * overwrite = true → 覆蓋客戶欄位；false → 只補空欄位（使用者選擇保留已填內容）。
 */
export function applyCustomerPrefill(
  state: ReportFormState,
  customer: SrCustomerOption,
  overwrite: boolean,
): ReportFormState {
  const changed = state.customer_id !== customer.id;
  const next = applyFields(
    state,
    customerValues(customer),
    CUSTOMER_PREFILL_FIELDS,
    overwrite,
  );
  return {
    ...next,
    customer_id: customer.id,
    machine_id: changed ? null : state.machine_id,
  };
}

/** 清除客戶：只清選取（已帶入的快照文字保留，避免誤刪手key內容）。 */
export function clearCustomer(state: ReportFormState): ReportFormState {
  return { ...state, customer_id: null, machine_id: null };
}

/**
 * 選機台：使用者明確指定，一律覆蓋設備／型號／電壓／編號／代號。
 * 代號＝客戶編號-機台代號（缺者省略）。
 */
export function applyMachinePrefill(
  state: ReportFormState,
  machine: SrMachineOption,
  customer: SrCustomerOption | null,
): ReportFormState {
  const p = prefillFromMachine(machine, customer);
  const next = applyFields(
    state,
    {
      equipment: p.equipment,
      model: p.model,
      voltage: p.voltage,
      serial_no: p.serial_no,
      header_code: p.header_code,
    },
    MACHINE_PREFILL_FIELDS,
    true,
  );
  return { ...next, machine_id: machine.id };
}

/** 清除機台：只清選取，快照文字保留。 */
export function clearMachine(state: ReportFormState): ReportFormState {
  return { ...state, machine_id: null };
}

/* ------------------------------------------------------------ 欄位編輯 */

/** 更換料件某一列的品名／數量（回新陣列；編號不存在時原樣回傳）。 */
export function updatePart(
  parts: readonly ServiceReportPart[],
  no: number,
  patch: Partial<Pick<ServiceReportPart, "name" | "qty">>,
): ServiceReportPart[] {
  if (no < 1 || no > PART_ROW_COUNT) return [...parts];
  return parts.map((p) => (p.no === no ? { ...p, ...patch } : p));
}

/** 勾選框切換（已選 → 取消）；維持原順序，新項目加在最後。 */
export function toggleValue<T extends string>(
  list: readonly T[],
  value: T,
): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/** 單選（radio）切換：再點一次選中的選項＝取消選取。 */
export function toggleSingle<T extends string>(
  current: T | null,
  value: T,
): T | null {
  return current === value ? null : value;
}

type CompressorKey = keyof NonNullable<ServiceReportResults["compressor"]>;
type DryerKey = keyof NonNullable<ServiceReportResults["dryer"]>;

/** 設定空壓機／乾燥機檢查的某個欄位；空值移除該 key（維持 results 精簡）。 */
export function setResultField(
  results: ServiceReportResults,
  group: "compressor",
  key: CompressorKey,
  value: string | null,
): ServiceReportResults;
export function setResultField(
  results: ServiceReportResults,
  group: "dryer",
  key: DryerKey,
  value: string | null,
): ServiceReportResults;
export function setResultField(
  results: ServiceReportResults,
  group: "compressor" | "dryer",
  key: string,
  value: string | null,
): ServiceReportResults {
  const current: Record<string, string> = {
    ...(results[group] as Record<string, string> | undefined),
  };
  if (value === null || value === "") delete current[key];
  else current[key] = value;
  const out: ServiceReportResults = { ...results };
  const empty = Object.keys(current).length === 0;
  if (group === "compressor") {
    if (empty) delete out.compressor;
    else out.compressor = current as ServiceReportResults["compressor"];
  } else {
    if (empty) delete out.dryer;
    else out.dryer = current as ServiceReportResults["dryer"];
  }
  return out;
}

/** 設定過濾耗材（null＝取消選取）。 */
export function setFilterConsumable(
  results: ServiceReportResults,
  value: ServiceReportResults["filter_consumable"] | null,
): ServiceReportResults {
  const out: ServiceReportResults = { ...results };
  if (value === null) delete out.filter_consumable;
  else out.filter_consumable = value;
  return out;
}
