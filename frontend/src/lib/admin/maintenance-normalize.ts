// 表單字串 → DB payload 的清洗（純函式，無 I/O，好單測）。
import {
  parseBelongsTo,
  normalizeCardHeader,
  type BelongsTo,
  type CardKind,
} from "./maintenance-card-split";

import {
  classifyServiceType,
  parseServiceType,
  type ServiceType,
} from "./maintenance-service-type";

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

/**
 * 機號 / 機台代號兩者皆空時的錯誤訊息。
 * 對齊 0018 的 mx_machines_identity_check：一張卡至少要有一段識別。
 */
export const MACHINE_IDENTITY_REQUIRED_MESSAGE =
  "機台代號與機號至少要填一個（例：機台代號「A機」，或機號「J751307001」）。";

export interface MachinePayload {
  card_type: MxCardType;
  /** 機號。過濾卡此處放過濾器型號，可留空（改以機台代號識別）。 */
  serial_no: string | null;
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
  const machineNo = cleanText(fd.get("machine_no"));
  // 機號不再是必填：現場很多卡只有「A機」這種客戶內部代號，過濾卡的機號位置
  // 更常常寫的是過濾器型號。但兩段全空的卡沒有任何識別可言，DB 也會擋（0018）。
  if (!serial && !machineNo) throw new Error(MACHINE_IDENTITY_REQUIRED_MESSAGE);
  return {
    card_type: parseCardType(fd.get("card_type")),
    serial_no: serial,
    machine_no: machineNo,
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
  /** 服務類型；null = 未判定（由人工補）。 */
  service_type: ServiceType | null;
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
    service_type: parseServiceType(fd.get("service_type")),
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
 * 一張卡的耗材欄上限。實際的卡最多 7 欄（xlsx 三個分頁），
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
  /**
   * 服務類型；null = 未判定。過濾卡沒有空壓機的四個耗材欄，classifyServiceType
   * 的規則對它不成立，故不自動推導，一律由表單下拉人工指定。
   */
  service_type: ServiceType | null;
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
    service_type: parseServiceType(fd.get("service_type")),
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

/**
 * 機號比對用正規化：lower + trim。
 * 與 0019 的 mx_machines_customer_serial_key
 * （customer_id, card_type, lower(btrim(serial_no))）對齊。
 */
export function normalizeSerial(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * 機台代號比對用正規化：lower + trim。
 * 與 0019 的 mx_machines_customer_tag_key
 * （customer_id, card_type, lower(btrim(machine_no))）對齊。
 * 與 normalizeSerial 規則相同，但兩者對應的是不同的索引，故分開命名以免日後改錯邊。
 */
export function normalizeMachineNo(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export interface ExtractedBasic {
  customer_name: string;
  customer_code: string;
  serial_no: string;
  machine_no: string;
  location: string;
  purchased_at: string;
  model: string;
  horsepower: string;
  voltage: string;
  /** 表頭 / 機號位置出現的「過濾 …」原文（＝過濾系統型號）。無則空字串。 */
  filter_spec: string;
  /** 排水器 / 馬達葉片規格原文（舊的空壓機卡多半沒有，保留給正式乾燥機卡）。 */
  drain_spec: string;
}

/** AI 擷取到的一列維護紀錄；belongs_to 為 AI 標的歸屬，沒標時為 null。 */
export interface ExtractedRecord extends RecordPayload {
  belongs_to: BelongsTo | null;
}

export interface ExtractedDraft {
  /**
   * 卡別。一律以本地表頭判定（normalizeCardHeader）為準：
   * AI 回傳的 card_kind 只當提示（它無法提供本地看不到的資訊，且常把
   * 「＋100HA」這種加號註記整個漏掉），原始值仍完整留在 mx_import_drafts.raw_output。
   */
  card_kind: CardKind;
  basic: ExtractedBasic;
  records: ExtractedRecord[];
}

/** 把 Gemini 回傳的 JSON 物件安全轉成型別化 draft；全空的維護列丟棄。 */
export function parseExtraction(raw: unknown): ExtractedDraft {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const b = (obj.basic ?? {}) as Record<string, unknown>;
  const rawRecords = Array.isArray(obj.records) ? obj.records : [];

  const records: ExtractedRecord[] = rawRecords
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const row = {
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
        belongs_to: parseBelongsTo(o.belongs_to),
      };
      // AI 只是加速：它給的 service_type 需為合法值才採用，否則一律以本地規則推導
      // （規則的真相來源是 classifyServiceType，見 maintenance-service-type.ts）。
      return {
        ...row,
        service_type:
          parseServiceType(o.service_type) ?? classifyServiceType(row),
      };
    })
    // belongs_to 只是歸屬標記、service_type 是本地推導出來的分類，兩者都不算
    // 「這列有內容」，判斷空列時一律排除。
    .filter((r) =>
      Object.entries(r).some(
        ([k, v]) => k !== "belongs_to" && k !== "service_type" && v !== null,
      ),
    );

  // 表頭正規化：把寫在機號位置的「過濾 …」、或併進機型 / 馬力 / 電壓尾端的
  // 「＋100HA」搬到 filter_spec 並定出卡別。
  const header = normalizeCardHeader({
    serial_no: str(b.serial_no),
    filter_spec: str(b.filter_spec),
    model: str(b.model),
    horsepower: str(b.horsepower),
    voltage: str(b.voltage),
  });

  return {
    card_kind: header.kind,
    basic: {
      customer_name: str(b.customer_name),
      customer_code: str(b.customer_code),
      serial_no: header.serial_no,
      machine_no: str(b.machine_no),
      location: str(b.location),
      purchased_at: str(b.purchased_at),
      model: header.model,
      horsepower: header.horsepower,
      voltage: header.voltage,
      filter_spec: header.filter_spec,
      drain_spec: str(b.drain_spec),
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
