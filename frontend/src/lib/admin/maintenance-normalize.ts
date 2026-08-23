// 表單字串 → DB payload 的清洗（純函式，無 I/O，好單測）。

export function cleanText(
  v: FormDataEntryValue | string | null,
): string | null {
  const s = (typeof v === "string" ? v : ((v as string | null) ?? "")).trim();
  return s === "" ? null : s;
}

export interface MachinePayload {
  serial_no: string;
  machine_no: string | null;
  location: string | null;
  purchased_at: string | null;
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
}

export function machinePayloadFromForm(fd: FormData): MachinePayload {
  const serial = cleanText(fd.get("serial_no"));
  if (!serial) throw new Error("機號為必填。");
  return {
    serial_no: serial,
    machine_no: cleanText(fd.get("machine_no")),
    location: cleanText(fd.get("location")),
    purchased_at: cleanText(fd.get("purchased_at")),
    model: cleanText(fd.get("model")),
    horsepower: cleanText(fd.get("horsepower")),
    voltage: cleanText(fd.get("voltage")),
  };
}

export interface RecordPayload {
  service_date: string | null;
  hours: string | null;
  oil: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  oil_separator: string | null;
  inverter: string | null;
  filter_system: string | null;
  technician: string | null;
  note: string | null;
}

export function recordPayloadFromForm(fd: FormData): RecordPayload {
  return {
    service_date: cleanText(fd.get("service_date")),
    hours: cleanText(fd.get("hours")),
    oil: cleanText(fd.get("oil")),
    oil_filter: cleanText(fd.get("oil_filter")),
    air_filter: cleanText(fd.get("air_filter")),
    oil_separator: cleanText(fd.get("oil_separator")),
    inverter: cleanText(fd.get("inverter")),
    filter_system: cleanText(fd.get("filter_system")),
    technician: cleanText(fd.get("technician")),
    note: cleanText(fd.get("note")),
  };
}

/** 機號比對用正規化：lower + trim。與 migration 的 unique index lower(btrim()) 對齊。 */
export function normalizeSerial(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export interface ExtractedDraft {
  basic: {
    customer_name: string;
    customer_code: string;
    serial_no: string;
    machine_no: string;
    location: string;
    purchased_at: string;
    model: string;
    horsepower: string;
    voltage: string;
  };
  records: RecordPayload[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 把 Gemini 回傳的 JSON 物件安全轉成型別化 draft；全空的維護列丟棄。 */
export function parseExtraction(raw: unknown): ExtractedDraft {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const b = (obj.basic ?? {}) as Record<string, unknown>;
  const rawRecords = Array.isArray(obj.records) ? obj.records : [];

  const records: RecordPayload[] = rawRecords
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        service_date: cleanText(str(o.service_date)),
        hours: cleanText(str(o.hours)),
        oil: cleanText(str(o.oil)),
        oil_filter: cleanText(str(o.oil_filter)),
        air_filter: cleanText(str(o.air_filter)),
        oil_separator: cleanText(str(o.oil_separator)),
        inverter: cleanText(str(o.inverter)),
        filter_system: cleanText(str(o.filter_system)),
        technician: cleanText(str(o.technician)),
        note: cleanText(str(o.note)),
      };
    })
    .filter((r) => Object.values(r).some((v) => v !== null));

  return {
    basic: {
      customer_name: str(b.customer_name),
      customer_code: str(b.customer_code),
      serial_no: str(b.serial_no),
      machine_no: str(b.machine_no),
      location: str(b.location),
      purchased_at: str(b.purchased_at),
      model: str(b.model),
      horsepower: str(b.horsepower),
      voltage: str(b.voltage),
    },
    records,
  };
}

// ── 客戶主檔（0016）─────────────────────────────────────────────

export interface CustomerPayload {
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
}

/** 客戶編輯表單 → DB payload。客戶名稱為必填，其餘空字串一律轉 null。 */
export function customerPayloadFromForm(fd: FormData): CustomerPayload {
  const name = cleanText(fd.get("name"));
  if (!name) throw new Error("客戶名稱為必填。");
  return {
    name,
    code: cleanText(fd.get("code")),
    contact_person: cleanText(fd.get("contact_person")),
    phone: cleanText(fd.get("phone")),
    address: cleanText(fd.get("address")),
    note: cleanText(fd.get("note")),
  };
}

/** 客戶編號比對用正規化：lower + trim。與 0013 的索引 lower(btrim(code)) 對齊。 */
export function normalizeCustomerCode(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * 卡別顯示文字。card_type 由 #155（過濾系統卡）新增，欄位尚未落地時為
 * undefined / null，一律視為空壓機卡，確保本頁在 0014/0015 之前也能正常顯示。
 */
export function cardTypeLabel(cardType?: string | null): string {
  return cardType === "filter" ? "過濾系統" : "空壓機";
}
