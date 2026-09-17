// 從保養卡客戶 / 機台帶入報告單表頭（spec §6 帶入規則）— 純函式（client / server 皆可用）。
// 帶入的是「快照」：之後改保養卡不影響舊單；帶入後使用者仍可修改。
import type { ServiceReportInput } from "./types";

/** 客戶選項（mx_customers 帶入所需欄位；見 queries.listCustomerOptions）。 */
export interface SrCustomerOption {
  id: string;
  code: string | null;
  name: string;
  invoice_title: string | null;
  phone: string | null;
  tax_id: string | null;
  contact_person: string | null;
  address: string | null;
}

/** 機台選項（mx_machines 未封存；見 queries.listMachineOptions）。 */
export interface SrMachineOption {
  id: string;
  customer_id: string;
  card_type: "compressor" | "filter";
  /** 機台代號（客戶內部稱呼，如 2、A機）。 */
  machine_no: string | null;
  /** 機號（原廠序號）。 */
  serial_no: string | null;
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
}

export type CustomerPrefill = Pick<
  ServiceReportInput,
  "customer_id" | "customer_name" | "phone" | "tax_id" | "contact" | "address"
>;

export type MachinePrefill = Pick<
  ServiceReportInput,
  "machine_id" | "equipment" | "model" | "voltage" | "serial_no" | "header_code"
>;

/** 去空白；空字串回 null。 */
function clean(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/** 非空片段以 sep 連接；全空回 null。 */
function joinParts(
  parts: (string | null | undefined)[],
  sep: string,
): string | null {
  const kept = parts.map(clean).filter((p): p is string => p !== null);
  return kept.length ? kept.join(sep) : null;
}

/** 選客戶 → 客戶名稱（發票抬頭優先）、電話、統編、聯絡人、地址。 */
export function prefillFromCustomer(
  customer: SrCustomerOption,
): CustomerPrefill {
  return {
    customer_id: customer.id,
    customer_name: clean(customer.invoice_title) ?? clean(customer.name),
    phone: clean(customer.phone),
    tax_id: clean(customer.tax_id),
    contact: clean(customer.contact_person),
    address: clean(customer.address),
  };
}

/**
 * 選機台 → 設備（型號 + 馬力）、型號、電壓、編號（機號）、左上代號（客戶編號-機台代號）。
 * 未傳客戶時代號只剩機台代號。
 */
export function prefillFromMachine(
  machine: SrMachineOption,
  customer?: Pick<SrCustomerOption, "code"> | null,
): MachinePrefill {
  return {
    machine_id: machine.id,
    equipment: joinParts([machine.model, machine.horsepower], " "),
    model: clean(machine.model),
    voltage: clean(machine.voltage),
    serial_no: clean(machine.serial_no),
    header_code: joinParts([customer?.code, machine.machine_no], "-"),
  };
}

/** 機台選單顯示文字：「代號 / 機號 / 型號」，缺者省略。 */
export function machineOptionLabel(machine: SrMachineOption): string {
  return (
    joinParts([machine.machine_no, machine.serial_no, machine.model], " / ") ??
    "（未命名機台）"
  );
}

/** 客戶選單顯示文字：「編號 名稱」。 */
export function customerOptionLabel(customer: SrCustomerOption): string {
  return joinParts([customer.code, customer.name], " ") ?? "（未命名客戶）";
}
