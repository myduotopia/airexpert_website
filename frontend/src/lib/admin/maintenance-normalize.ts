// 表單字串 → DB payload 的清洗（純函式，無 I/O，好單測）。

export function cleanText(
  v: FormDataEntryValue | string | null,
): string | null {
  const s = (typeof v === "string" ? v : ((v as string | null) ?? "")).trim();
  return s === "" ? null : s;
}

/**
 * 卡別。compressor = 空壓機保養紀錄卡（固定 9 欄）；
 * filter = 過濾系統（乾燥機）保養紀錄卡（每張卡自訂耗材欄）。
 * 放在純函式模組（非 server-only）以便 client 元件也能引用。
 */
export type MxCardType = "compressor" | "filter";

/** 把任意輸入收斂成合法卡別；認不得一律回 compressor（與 DB 預設值一致）。 */
export function parseCardType(v: unknown): MxCardType {
  return v === "filter" ? "filter" : "compressor";
}

export interface MachinePayload {
  card_type: MxCardType;
  serial_no: string;
  machine_no: string | null;
  location: string | null;
  purchased_at: string | null;
  model: string | null;
  horsepower: string | null;
  voltage: string | null;
  filter_spec: string | null;
  drain_spec: string | null;
}

export function machinePayloadFromForm(fd: FormData): MachinePayload {
  const serial = cleanText(fd.get("serial_no"));
  if (!serial) throw new Error("機號為必填。");
  return {
    card_type: parseCardType(fd.get("card_type")),
    serial_no: serial,
    machine_no: cleanText(fd.get("machine_no")),
    location: cleanText(fd.get("location")),
    purchased_at: cleanText(fd.get("purchased_at")),
    model: cleanText(fd.get("model")),
    horsepower: cleanText(fd.get("horsepower")),
    voltage: cleanText(fd.get("voltage")),
    filter_spec: cleanText(fd.get("filter_spec")),
    drain_spec: cleanText(fd.get("drain_spec")),
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

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// ── 過濾系統（乾燥機）卡：動態耗材欄位 ────────────────────────────
// 欄位定義存 mx_machine_columns（一卡多列），紀錄值存 mx_records.values
// 的 jsonb：{ "<column_id>": "1只", ... }。以下皆為純函式，無 I/O。

/**
 * 表單送出的一筆耗材欄定義。
 * id 為既有欄位的 uuid；新增的欄位為 null（由 DB 產生 id）。
 */
export interface ColumnDef {
  id: string | null;
  label: string;
}

/**
 * 一張卡的耗材欄上限。實際的卡最多 6 欄
 * （xlsx 三個分頁分別是 4 / 5 / 6 個耗材欄；日期與維護員為固定欄不計）。
 * 此上限只用來擋畸形 / 惡意的 columns_json（避免同步時打出上千個 DB 請求）。
 */
export const MAX_COLUMN_DEFS = 50;

/**
 * 解析欄位編輯器送出的隱藏欄位 columns_json。
 * 容錯：非陣列 / 非物件 / label 空白一律丟棄，永不 throw（表單不該因髒資料整頁爆掉）。
 * 重複的 id 只取第一筆，超過 MAX_COLUMN_DEFS 的部分截斷。
 * 回傳順序即為欄位由左到右的順序。
 */
export function parseColumnDefs(
  raw: FormDataEntryValue | string | null | undefined,
): ColumnDef[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: ColumnDef[] = [];
  for (const item of parsed) {
    if (out.length >= MAX_COLUMN_DEFS) break;
    const o = (item ?? {}) as Record<string, unknown>;
    const label = cleanText(str(o.label));
    if (!label) continue;
    const id = cleanText(str(o.id));
    // 同一個 id 出現兩次會讓 syncMachineColumns 對同一列送出兩次 update
    // （sort_order 互相覆蓋），結果是靜靜少掉一欄；重複者只留第一筆。
    if (id !== null) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push({ id, label });
  }
  return out;
}

/** 動態耗材欄在表單中的欄位名。與 FilterRecordFields 的 input name 一致。 */
export function columnFieldName(columnId: string): string {
  return `col_${columnId}`;
}

export interface FilterRecordPayload {
  service_date: string | null;
  technician: string | null;
  note: string | null;
  /** { "<column_id>": "值" }；全部留空時為 null，避免存一堆 {}。 */
  values: Record<string, string> | null;
}

/**
 * 過濾卡的維護紀錄表單 → DB payload。
 * 只讀取 columns 內確實存在的欄位 id，避免表單被塞入任意 key 汙染 jsonb；
 * 值為空的欄位不寫入（讀取端一律以「缺 key = 未填」處理）。
 */
export function filterRecordPayloadFromForm(
  fd: FormData,
  columns: { id: string }[],
): FilterRecordPayload {
  const values: Record<string, string> = {};
  for (const col of columns) {
    const v = cleanText(fd.get(columnFieldName(col.id)));
    if (v !== null) values[col.id] = v;
  }
  return {
    service_date: cleanText(fd.get("service_date")),
    technician: cleanText(fd.get("technician")),
    note: cleanText(fd.get("note")),
    values: Object.keys(values).length > 0 ? values : null,
  };
}

/**
 * 讀取端：把 DB 的 values jsonb 收斂成 Record<string, string>。
 * 舊列可能是 null，或（極端情況）被寫入非物件；一律回空物件而非 throw。
 */
export function readRecordValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (typeof v === "number") out[k] = String(v);
  }
  return out;
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
