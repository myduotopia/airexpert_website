// 舊系統廠商資料匯入（#273）的純邏輯：標題列檢查、依標題名稱找欄、欄位對應、
// 公司地址空白時以送貨郵遞＋送貨地址補上、備註類欄位合併為 note（每段一行、可重跑）、
// 比對既有廠商（只補空白、列出衝突欄位）、統計。
// 一次性匯入腳本（frontend/scripts/import-vendors.ts）與測試共用；不可 import server-only 模組。
// 檔案解析（xlsx → 二維字串陣列）在呼叫端用 SheetJS 完成（lib/employees/sheet）。
//
// 個資：本檔產生的錯誤原因、衝突只含列號與欄位名稱，不含任何儲存格內容（腳本輸出可安全貼到 issue）。
// 尤其標題列檢查失敗時只回固定訊息：絕不可把（可能是資料的）第 1 列內容放進訊息。
//
// note 格式（#274 會逐行解析產生提醒規則，請維持）：每段一行「【欄名】內容」，
// 依序為【備註】【備註一】【備註二】【匯款帳號】，最後視情況加【送貨地址】；
// 儲存格內的多行以 VENDOR_NOTE_LINE_JOINER 合成一行。既有 note（手寫）保留在最前面。
import {
  cell,
  combineDeliveryAddress,
  headerFinder,
  isBlank,
  isBlankRow,
  isStandardTaxId,
  mergeNote,
  segment,
} from "./import-common";

/** 舊系統匯出檔預設工作表（「工作表2」內容相同但沒有標題列，不可使用）。 */
export const DEFAULT_VENDOR_IMPORT_SHEET = "1";

/** 標題列檢查失敗的固定訊息（不含任何儲存格內容）。 */
export const VENDOR_HEADER_ROW_ERROR =
  "工作表第 1 列必須是標題列，且包含「廠商編號」與「廠商簡稱」；此工作表可能沒有標題列，" +
  "請改用有標題列的工作表（例：--sheet 1）。";

/** 匯入時「只補空白」的欄位（code 為比對鍵不更新；note 另有規則）。順序即衝突列出順序。 */
export const VENDOR_FILL_FIELDS = [
  "name",
  "tax_id",
  "contact_person",
  "phone",
  "fax",
  "address",
] as const;
export type VendorFillField = (typeof VENDOR_FILL_FIELDS)[number];

/** 會寫入 erp_vendors 的欄位（currency 用預設 TWD、active 新增時為 true，不在此列）。 */
export type VendorImportField = "code" | VendorFillField | "note";

export const VENDOR_IMPORT_FIELD_LABELS: Record<VendorImportField, string> = {
  code: "廠商編號",
  name: "廠商名稱",
  tax_id: "統一編號",
  contact_person: "聯絡人",
  phone: "電話",
  fax: "傳真",
  address: "地址",
  note: "備註",
};

/** 舊系統標題 → 欄位（一對一）。 */
export const VENDOR_IMPORT_HEADERS = {
  code: "廠商編號",
  name: "廠商簡稱",
  tax_id: "統一編號",
  contact_person: "聯絡人",
  phone: "電話",
  fax: "傳真機",
  address: "公司地址",
} as const;
type DirectField = keyof typeof VENDOR_IMPORT_HEADERS;

const DELIVERY_ZIP_HEADER = "送貨郵遞";
const DELIVERY_ADDRESS_HEADER = "送貨地址";

/** 合併進 note 的欄位（依序）；每段寫成「【欄名】內容」。 */
export const VENDOR_NOTE_HEADERS = [
  "備註",
  "備註一",
  "備註二",
  "匯款帳號",
] as const;

/** 送貨地址寫進 note 時的標籤。 */
export const VENDOR_DELIVERY_NOTE_LABEL = DELIVERY_ADDRESS_HEADER;

/** 儲存格內多行合成一行時的分隔（note 每段必須是一行）。 */
export const VENDOR_NOTE_LINE_JOINER = " / ";

/**
 * 長度上限（字元）。erp_vendors 欄位皆為 text；只有 code 有 btree 唯一索引（lower(btrim(code))），
 * btree 單筆上限約 2,700 bytes，中文 UTF-8 每字 3 bytes，取 500 字留足餘裕。其餘欄位不限。
 */
export const VENDOR_IMPORT_MAX_LENGTH: Partial<
  Record<VendorImportField, number>
> = {
  code: 500,
};

// ── 標題對應 ────────────────────────────────────────────────

export interface VendorColumnMap {
  /** 一對一欄位 → 欄索引（找不到為 null；code、name 必有）。 */
  fields: Record<DirectField, number | null>;
  deliveryZip: number | null;
  deliveryAddress: number | null;
  /** 合併進 note 的欄位（依 VENDOR_NOTE_HEADERS 順序，只含找到的）。 */
  notes: { label: string; index: number }[];
}

/**
 * 依標題名稱（不依位置）找欄。缺「廠商編號」或「廠商簡稱」→ 固定錯誤訊息（不含儲存格內容）；
 * 其他欄缺少只列在 missing（標題名稱常數）。
 */
export function mapVendorHeaders(
  header: readonly unknown[],
):
  | { ok: true; map: VendorColumnMap; missing: string[] }
  | { ok: false; error: string } {
  const find = headerFinder(header);
  if (
    find(VENDOR_IMPORT_HEADERS.code) === null ||
    find(VENDOR_IMPORT_HEADERS.name) === null
  ) {
    return { ok: false, error: VENDOR_HEADER_ROW_ERROR };
  }

  const missing: string[] = [];
  const track = (label: string) => {
    const i = find(label);
    if (i === null) missing.push(label);
    return i;
  };
  const fields = Object.fromEntries(
    (Object.keys(VENDOR_IMPORT_HEADERS) as DirectField[]).map((f) => [
      f,
      track(VENDOR_IMPORT_HEADERS[f]),
    ]),
  ) as Record<DirectField, number | null>;
  const deliveryZip = track(DELIVERY_ZIP_HEADER);
  const deliveryAddress = track(DELIVERY_ADDRESS_HEADER);
  const notes: { label: string; index: number }[] = [];
  for (const label of VENDOR_NOTE_HEADERS) {
    const i = track(label);
    if (i !== null) notes.push({ label, index: i });
  }
  return {
    ok: true,
    map: { fields, deliveryZip, deliveryAddress, notes },
    missing,
  };
}

// ── 解析 ────────────────────────────────────────────────────

/** 儲存格內多行 → 一行（各行去頭尾空白、略過空行）。 */
function oneLine(s: string): string {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(VENDOR_NOTE_LINE_JOINER);
}

function noteSegment(label: string, content: string): string {
  return segment(label, oneLine(content));
}

export interface ParsedVendorRow {
  /** Excel 列號（1 起算，標題列為第 1 列）。 */
  line: number;
  code: string;
  values: Record<VendorFillField, string | null> & { name: string };
  /** 要合併進 note 的段落（「【欄名】內容」，每段一行）。 */
  noteSegments: string[];
  /** 公司地址空白，address 由送貨郵遞＋送貨地址補上（note 另有【送貨地址】）。 */
  addressFromDelivery: boolean;
  /** 統一編號有值但不是 8 位數字（照原文保存）。 */
  taxIdNonStandard: boolean;
}

export interface VendorRowError {
  line: number;
  /** 只含欄位名稱與列號，不含儲存格內容。 */
  reason: string;
}

/**
 * 工作表格子 → 廠商列。標題列固定為第 1 列（沒有標題列的工作表直接報錯，不猜）。
 * 全空白列略過；缺編號／簡稱、編號重複（不分大小寫）、超長 → 列為錯誤並略過該列。
 */
export function parseVendorSheet(grid: readonly (readonly unknown[])[]):
  | {
      ok: true;
      rows: ParsedVendorRow[];
      errors: VendorRowError[];
      missingHeaders: string[];
    }
  | { ok: false; error: string } {
  const mapped = mapVendorHeaders(grid[0] ?? []);
  if (!mapped.ok) return mapped;
  const { map } = mapped;
  const rows: ParsedVendorRow[] = [];
  const errors: VendorRowError[] = [];
  const seen = new Map<string, number>();

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r] ?? [];
    const line = r + 1;
    if (isBlankRow(raw)) continue;

    const code = cell(raw, map.fields.code);
    const name = cell(raw, map.fields.name);
    if (!code) {
      errors.push({ line, reason: `缺少${VENDOR_IMPORT_HEADERS.code}` });
      continue;
    }
    if (!name) {
      errors.push({ line, reason: `缺少${VENDOR_IMPORT_HEADERS.name}` });
      continue;
    }
    const key = code.toLowerCase();
    const dup = seen.get(key);
    if (dup !== undefined) {
      errors.push({
        line,
        reason: `${VENDOR_IMPORT_HEADERS.code}與第 ${dup} 列重複`,
      });
      continue;
    }
    const maxCode = VENDOR_IMPORT_MAX_LENGTH.code;
    if (maxCode !== undefined && [...code].length > maxCode) {
      errors.push({
        line,
        reason: `「${VENDOR_IMPORT_HEADERS.code}」超過 ${maxCode} 字`,
      });
      continue;
    }

    const noteSegments: string[] = [];
    for (const n of map.notes) {
      const v = cell(raw, n.index);
      if (v) noteSegments.push(noteSegment(n.label, v));
    }

    // 送貨地址：公司地址空白 → 補進 address 並在 note 標註；公司地址有值且不同 → 只留在 note（不遺失）。
    let address = cell(raw, map.fields.address);
    let addressFromDelivery = false;
    const deliveryStreet = cell(raw, map.deliveryAddress);
    const delivery = deliveryStreet
      ? combineDeliveryAddress(cell(raw, map.deliveryZip), deliveryStreet)
      : null;
    if (delivery) {
      if (!address) {
        address = delivery;
        addressFromDelivery = true;
        noteSegments.push(noteSegment(VENDOR_DELIVERY_NOTE_LABEL, delivery));
      } else if (address !== delivery) {
        noteSegments.push(noteSegment(VENDOR_DELIVERY_NOTE_LABEL, delivery));
      }
    }

    const values: ParsedVendorRow["values"] = {
      name,
      tax_id: cell(raw, map.fields.tax_id),
      contact_person: cell(raw, map.fields.contact_person),
      phone: cell(raw, map.fields.phone),
      fax: cell(raw, map.fields.fax),
      address,
    };

    seen.set(key, line);
    rows.push({
      line,
      code,
      values,
      noteSegments,
      addressFromDelivery,
      taxIdNonStandard: !!values.tax_id && !isStandardTaxId(values.tax_id),
    });
  }
  return { ok: true, rows, errors, missingHeaders: mapped.missing };
}

// ── 比對既有廠商 ────────────────────────────────────────────

/** DB 既有廠商（腳本以 postgres 身分讀出）。 */
export interface ExistingVendor {
  id: string;
  code: string | null;
  name: string;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  note: string | null;
  active: boolean;
}

export type VendorPlanAction = "insert" | "fill" | "unchanged";

export type VendorPatch = Partial<Record<VendorFillField | "note", string>>;

export interface VendorPlanRow {
  line: number;
  action: VendorPlanAction;
  /** 對到的既有廠商 id；新增為 null。 */
  existingId: string | null;
  /** 對到既有廠商時要補的欄位（只含原本空白者；note 為合併後全文）。 */
  patch: VendorPatch;
  /** 讀取時的既有 note（寫入時確認未被改動才更新 note）。 */
  noteBase: string | null;
  /** 既有值與檔案值不同、未覆蓋的欄位（只列欄位，不含內容）。 */
  conflicts: VendorFillField[];
  /** 對到的既有廠商為停用（匯入不改 active）。 */
  matchedInactive: boolean;
  parsed: ParsedVendorRow;
}

/** 依廠商編號（去空白、不分大小寫，同 DB 唯一鍵 lower(btrim(code))）比對既有廠商，產生每列動作。 */
export function buildVendorImportPlan(
  rows: readonly ParsedVendorRow[],
  existing: readonly ExistingVendor[],
): VendorPlanRow[] {
  const byCode = new Map<string, ExistingVendor>();
  for (const v of existing) {
    const k = (v.code ?? "").trim().toLowerCase();
    if (k) byCode.set(k, v);
  }
  return rows.map((p) => {
    const hit = byCode.get(p.code.trim().toLowerCase()) ?? null;
    if (!hit) {
      return {
        line: p.line,
        action: "insert",
        existingId: null,
        patch: {},
        noteBase: null,
        conflicts: [],
        matchedInactive: false,
        parsed: p,
      };
    }
    const patch: VendorPatch = {};
    const conflicts: VendorFillField[] = [];
    for (const f of VENDOR_FILL_FIELDS) {
      const next = p.values[f];
      if (!next) continue;
      const cur = hit[f];
      if (isBlank(cur)) patch[f] = next;
      else if (cur!.trim() !== next.trim()) conflicts.push(f);
    }
    const note = mergeNote(hit.note, p.noteSegments);
    if (note !== hit.note && note !== null) patch.note = note;
    return {
      line: p.line,
      action: Object.keys(patch).length > 0 ? "fill" : "unchanged",
      existingId: hit.id,
      patch,
      noteBase: hit.note,
      conflicts,
      matchedInactive: !hit.active,
      parsed: p,
    };
  });
}

// ── 寫入動作 ────────────────────────────────────────────────

export type VendorInsertRow = Record<VendorFillField, string | null> & {
  code: string;
  name: string;
  note: string | null;
  active: true;
};

export interface VendorUpdateOp {
  id: string;
  patch: VendorPatch;
  /** 只在 patch 含 note 時給：寫入時 note 仍等於此值才更新（避免蓋掉讀取後的修改）。 */
  note_base?: string | null;
}

export function vendorImportOps(plan: readonly VendorPlanRow[]): {
  inserts: VendorInsertRow[];
  updates: VendorUpdateOp[];
} {
  const inserts: VendorInsertRow[] = [];
  const updates: VendorUpdateOp[] = [];
  for (const r of plan) {
    if (r.action === "insert") {
      const v = r.parsed.values;
      inserts.push({
        code: r.parsed.code,
        name: v.name,
        tax_id: v.tax_id,
        contact_person: v.contact_person,
        phone: v.phone,
        fax: v.fax,
        address: v.address,
        note: mergeNote(null, r.parsed.noteSegments),
        active: true,
      });
    } else if (r.action === "fill" && r.existingId) {
      updates.push(
        "note" in r.patch
          ? { id: r.existingId, patch: r.patch, note_base: r.noteBase }
          : { id: r.existingId, patch: r.patch },
      );
    }
  }
  return { inserts, updates };
}

// ── 統計 ────────────────────────────────────────────────────

export interface VendorImportSummary {
  /** 有效列數（不含錯誤列、空白列）。 */
  rows: number;
  insert: number;
  fill: number;
  unchanged: number;
  /** 補欄位：各欄被補的列數（只計既有廠商）。 */
  filledByField: Partial<Record<VendorFillField | "note", number>>;
  /** 有衝突的列數。 */
  conflictRows: number;
  /** 衝突：各欄的列數（只列欄位名）。 */
  conflictsByField: Partial<Record<VendorFillField, number>>;
  taxIdNonStandard: number;
  /** 公司地址空白、以送貨郵遞＋送貨地址補上的列數。 */
  addressFromDelivery: number;
  /** 對到但停用中的既有廠商（匯入不改 active）。 */
  matchedInactive: number;
  /** 既有廠商中檔案沒有的（不受影響）。 */
  existingUnmatched: number;
  errors: VendorRowError[];
}

export function summarizeVendorImport(
  plan: readonly VendorPlanRow[],
  errors: readonly VendorRowError[],
  existingCount: number,
): VendorImportSummary {
  const filledByField: VendorImportSummary["filledByField"] = {};
  const conflictsByField: VendorImportSummary["conflictsByField"] = {};
  for (const r of plan) {
    for (const f of Object.keys(r.patch) as (keyof VendorPatch)[]) {
      filledByField[f] = (filledByField[f] ?? 0) + 1;
    }
    for (const f of r.conflicts) {
      conflictsByField[f] = (conflictsByField[f] ?? 0) + 1;
    }
  }
  const matched = plan.filter((r) => r.existingId).length;
  return {
    rows: plan.length,
    insert: plan.filter((r) => r.action === "insert").length,
    fill: plan.filter((r) => r.action === "fill").length,
    unchanged: plan.filter((r) => r.action === "unchanged").length,
    filledByField,
    conflictRows: plan.filter((r) => r.conflicts.length > 0).length,
    conflictsByField,
    taxIdNonStandard: plan.filter((r) => r.parsed.taxIdNonStandard).length,
    addressFromDelivery: plan.filter((r) => r.parsed.addressFromDelivery)
      .length,
    matchedInactive: plan.filter((r) => r.matchedInactive).length,
    existingUnmatched: existingCount - matched,
    errors: [...errors],
  };
}
