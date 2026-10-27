// 舊系統客戶資料匯入（#266）的純邏輯：依標題名稱找欄、欄位對應、(FA) → 來源 FB、
// 送貨郵遞＋送貨地址合併、備註類欄位合併為 note（可重跑）、比對既有客戶（只補空白、列出衝突欄位）、統計。
// 一次性匯入腳本（frontend/scripts/import-customers.ts）、日後可能的後台匯入頁與測試共用；
// 不可 import server-only 模組。檔案解析（xlsx → 二維字串陣列）在呼叫端用 SheetJS 完成（lib/employees/sheet）。
//
// 個資：本檔產生的錯誤原因、衝突只含列號與欄位名稱，不含任何儲存格內容（腳本輸出可安全貼到 issue）。
import { normalizeEmailList } from "./email";
import { FB_SOURCE, normalizeCustomerSource } from "./customer-source";

/** 舊系統匯出檔預設工作表（「工作表2」欄位較少，以工作表4 為準）。 */
export const DEFAULT_CUSTOMER_IMPORT_SHEET = "工作表4";

/** 匯入時「只補空白」的欄位（code 為比對鍵不更新；note、source 另有規則）。順序即衝突列出順序。 */
export const CUSTOMER_FILL_FIELDS = [
  "name",
  "tax_id",
  "payment_terms",
  "contact_person",
  "mail_recipient",
  "phone",
  "fax",
  "address",
  "delivery_address",
  "email",
] as const;
export type CustomerFillField = (typeof CUSTOMER_FILL_FIELDS)[number];

/** 會寫入 mx_customers 的欄位。 */
export type CustomerImportField =
  | "code"
  | CustomerFillField
  | "note"
  | "source";

export const CUSTOMER_IMPORT_FIELD_LABELS: Record<CustomerImportField, string> =
  {
    code: "客戶編號",
    name: "客戶名稱",
    tax_id: "統一編號",
    payment_terms: "付款條件",
    contact_person: "聯絡人",
    mail_recipient: "收信人",
    phone: "電話",
    fax: "傳真",
    address: "聯絡地址",
    delivery_address: "送貨地址",
    email: "Email",
    note: "備註",
    source: "客戶來源",
  };

/** 舊系統標題 → 欄位（一對一）。送貨地址由兩欄合併、Email 另行正規化，故不在此表。 */
export const CUSTOMER_IMPORT_HEADERS = {
  code: "客戶編號",
  name: "客戶簡稱",
  tax_id: "統一編號",
  payment_terms: "付款方式",
  contact_person: "聯絡人",
  mail_recipient: "收信人",
  phone: "電話",
  fax: "傳真機",
  address: "公司地址",
  source: "客戶來源",
} as const;
type DirectField = keyof typeof CUSTOMER_IMPORT_HEADERS;

const DELIVERY_ZIP_HEADER = "送貨郵遞";
const DELIVERY_ADDRESS_HEADER = "送貨地址";
const EMAIL_HEADER = "E-Mail";

/** 合併進 note 的欄位（依序）；每段寫成「【標籤】內容」。 */
export const CUSTOMER_NOTE_HEADERS = [
  "客戶簡稱備註說明",
  "報價聯絡方式(傳真/L/MAIL)",
  "開戶帳號",
  "備註一",
  "備註二",
  "備註三",
  "備註四",
  "備註五",
  "Memo",
] as const;

/**
 * 長度上限（字元）。mx_customers 的欄位都是 text、沒有長度限制；但 code、phone 有 btree 索引
 * （0013／0016／0020），source 有 0035 的 btree 索引：btree 單筆上限約 2,700 bytes，
 * 中文 UTF-8 每字 3 bytes，取 500 字留足餘裕，避免整批寫入因單列失敗。其餘欄位不限。
 */
export const CUSTOMER_IMPORT_MAX_LENGTH: Partial<
  Record<CustomerImportField, number>
> = {
  code: 500,
  phone: 500,
  source: 500,
};

// ── 標題對應 ────────────────────────────────────────────────

/** 標題比對鍵：NFKC（全形括號／英數 → 半形）、去所有空白、不分大小寫。 */
function headerKey(v: unknown): string {
  return String(v ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export interface CustomerColumnMap {
  /** 一對一欄位 → 欄索引（找不到為 null；code、name 必有）。 */
  fields: Record<DirectField, number | null>;
  deliveryZip: number | null;
  deliveryAddress: number | null;
  email: number | null;
  /** 合併進 note 的欄位（依 CUSTOMER_NOTE_HEADERS 順序，只含找到的）。 */
  notes: { label: string; index: number }[];
}

/**
 * 依標題名稱（不依位置）找欄。缺「客戶編號」或「客戶簡稱」→ 錯誤；其他欄缺少只列在 missing（標題名稱）。
 * 同名標題出現多次時取第一欄。
 */
export function mapCustomerHeaders(
  header: readonly unknown[],
):
  | { ok: true; map: CustomerColumnMap; missing: string[] }
  | { ok: false; error: string } {
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const k = headerKey(h);
    if (k && !index.has(k)) index.set(k, i);
  });
  const find = (label: string) => index.get(headerKey(label)) ?? null;

  for (const required of [
    CUSTOMER_IMPORT_HEADERS.code,
    CUSTOMER_IMPORT_HEADERS.name,
  ]) {
    if (find(required) === null) {
      return {
        ok: false,
        error: `找不到標題「${required}」（標題列需在第 1 列）。`,
      };
    }
  }

  const missing: string[] = [];
  const track = (label: string) => {
    const i = find(label);
    if (i === null) missing.push(label);
    return i;
  };
  const fields = Object.fromEntries(
    (Object.keys(CUSTOMER_IMPORT_HEADERS) as DirectField[]).map((f) => [
      f,
      track(CUSTOMER_IMPORT_HEADERS[f]),
    ]),
  ) as Record<DirectField, number | null>;
  const deliveryZip = track(DELIVERY_ZIP_HEADER);
  const deliveryAddress = track(DELIVERY_ADDRESS_HEADER);
  const email = track(EMAIL_HEADER);
  const notes: { label: string; index: number }[] = [];
  for (const label of CUSTOMER_NOTE_HEADERS) {
    const i = track(label);
    if (i !== null) notes.push({ label, index: i });
  }
  return {
    ok: true,
    map: { fields, deliveryZip, deliveryAddress, email, notes },
    missing,
  };
}

// ── 欄位規則 ────────────────────────────────────────────────

/** 去頭尾空白、統一換行為 \n；空字串 → null。 */
function cell(row: readonly unknown[], i: number | null): string | null {
  if (i === null) return null;
  const s = String(row[i] ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return s ? s : null;
}

/** 名稱含 (FA)／（FA）（不分大小寫、括號內可有空白）→ FB（Facebook）來的客戶。 */
export function hasFaMark(name: string | null | undefined): boolean {
  return /\(\s*fa\s*\)/i.test((name ?? "").normalize("NFKC"));
}

/**
 * 送貨郵遞＋送貨地址 → delivery_address：郵遞區號在前、中間一個空白；郵遞區號非數字時照原文。
 * 地址本身已以該郵遞區號開頭時不重複加。兩者皆空 → null。
 */
export function combineDeliveryAddress(
  zip: string | null | undefined,
  address: string | null | undefined,
): string | null {
  const z = (zip ?? "").trim();
  const a = (address ?? "").trim();
  if (!z) return a || null;
  if (!a) return z;
  if (a.startsWith(z)) return a;
  return `${z} ${a}`;
}

const EMAIL_PENDING_MARK = "（Email 格式待確認）";

function segment(label: string, content: string): string {
  return `【${label}】${content}`;
}

// ── 解析 ────────────────────────────────────────────────────

export interface ParsedCustomerRow {
  /** Excel 列號（1 起算，標題列為第 1 列）。 */
  line: number;
  code: string;
  values: Record<CustomerFillField, string | null> & { name: string };
  /** 最終來源：(FA) → FB；否則「客戶來源」欄原文（fb → FB）；都沒有 → null。 */
  source: string | null;
  /** 名稱含 (FA)。 */
  faMark: boolean;
  /** 要合併進 note 的段落（「【標籤】內容」）。 */
  noteSegments: string[];
  /** E-Mail 格式不符（已改寫入 note 並標示待確認）。 */
  emailInvalid: boolean;
  /** 統一編號有值但不是 8 位數字（照原文保存）。 */
  taxIdNonStandard: boolean;
}

export interface CustomerRowError {
  line: number;
  /** 只含欄位名稱與列號，不含儲存格內容。 */
  reason: string;
}

/**
 * 工作表格子 → 客戶列。headerRow 為標題列索引（0 起算，預設第 1 列）。
 * 全空白列略過；缺編號／名稱、編號重複（不分大小寫）、超長 → 列為錯誤並略過該列。
 */
export function parseCustomerSheet(
  grid: readonly (readonly unknown[])[],
  headerRow = 0,
):
  | {
      ok: true;
      rows: ParsedCustomerRow[];
      errors: CustomerRowError[];
      missingHeaders: string[];
    }
  | { ok: false; error: string } {
  const mapped = mapCustomerHeaders(grid[headerRow] ?? []);
  if (!mapped.ok) return mapped;
  const { map } = mapped;
  const rows: ParsedCustomerRow[] = [];
  const errors: CustomerRowError[] = [];
  const seen = new Map<string, number>();

  for (let r = headerRow + 1; r < grid.length; r++) {
    const raw = grid[r] ?? [];
    const line = r + 1;
    if (raw.every((c) => String(c ?? "").trim() === "")) continue;

    const code = cell(raw, map.fields.code);
    const name = cell(raw, map.fields.name);
    if (!code) {
      errors.push({ line, reason: "缺少客戶編號" });
      continue;
    }
    if (!name) {
      errors.push({ line, reason: "缺少客戶簡稱" });
      continue;
    }
    const key = code.toLowerCase();
    const dup = seen.get(key);
    if (dup !== undefined) {
      errors.push({ line, reason: `客戶編號與第 ${dup} 列重複` });
      continue;
    }

    const noteSegments: string[] = [];
    for (const n of map.notes) {
      const v = cell(raw, n.index);
      if (v) noteSegments.push(segment(n.label, v));
    }

    const rawSource = cell(raw, map.fields.source);
    const faMark = hasFaMark(name);
    let source = normalizeCustomerSource(rawSource);
    if (faMark) {
      // 兩者皆有：來源以 FB 為準，「客戶來源」原文保留在 note（本身就是 FB 則不必）。
      if (source && source !== FB_SOURCE) {
        noteSegments.push(segment(CUSTOMER_IMPORT_HEADERS.source, source));
      }
      source = FB_SOURCE;
    }

    const rawEmail = cell(raw, map.email);
    const email = normalizeEmailList(rawEmail);
    const emailInvalid = !email.ok;
    if (!email.ok && rawEmail) {
      noteSegments.push(
        segment(EMAIL_HEADER, `${rawEmail}${EMAIL_PENDING_MARK}`),
      );
    }

    const values: ParsedCustomerRow["values"] = {
      name,
      tax_id: cell(raw, map.fields.tax_id),
      payment_terms: cell(raw, map.fields.payment_terms),
      contact_person: cell(raw, map.fields.contact_person),
      mail_recipient: cell(raw, map.fields.mail_recipient),
      phone: cell(raw, map.fields.phone),
      fax: cell(raw, map.fields.fax),
      address: cell(raw, map.fields.address),
      delivery_address: combineDeliveryAddress(
        cell(raw, map.deliveryZip),
        cell(raw, map.deliveryAddress),
      ),
      email: email.ok ? email.value : null,
    };

    const tooLong = (
      Object.entries(CUSTOMER_IMPORT_MAX_LENGTH) as [
        CustomerImportField,
        number,
      ][]
    ).find(([f, max]) => {
      const v =
        f === "code"
          ? code
          : f === "source"
            ? source
            : f === "note"
              ? noteSegments.join("\n")
              : values[f];
      return !!v && [...v].length > max;
    });
    if (tooLong) {
      const [f, max] = tooLong;
      errors.push({
        line,
        reason: `「${CUSTOMER_IMPORT_FIELD_LABELS[f]}」超過 ${max} 字`,
      });
      continue;
    }

    seen.set(key, line);
    rows.push({
      line,
      code,
      values,
      source,
      faMark,
      noteSegments,
      emailInvalid,
      taxIdNonStandard: !!values.tax_id && !/^\d{8}$/.test(values.tax_id),
    });
  }
  return { ok: true, rows, errors, missingHeaders: mapped.missing };
}

// ── note 合併 ───────────────────────────────────────────────

/**
 * 把段落附加到既有 note 之後（換行分隔）。已整段存在（以整行為界、CRLF 視同 LF）的段落不重複附加，
 * 故重跑結果不變。沒有要附加的段落時回傳既有值本身（未改動）。既有 note 只有空白視為空。
 */
export function mergeNote(
  existing: string | null | undefined,
  segments: readonly string[],
): string | null {
  const base = existing ?? null;
  const hasBase = !!base && base.trim() !== "";
  const haystack = `\n${hasBase ? base!.replace(/\r\n?/g, "\n") : ""}\n`;
  const toAdd: string[] = [];
  for (const seg of segments) {
    if (haystack.includes(`\n${seg}\n`) || toAdd.includes(seg)) continue;
    toAdd.push(seg);
  }
  if (toAdd.length === 0) return base;
  return hasBase ? `${base}\n${toAdd.join("\n")}` : toAdd.join("\n");
}

// ── 比對既有客戶 ────────────────────────────────────────────

/** DB 既有客戶（腳本以 postgres 身分讀出）。 */
export interface ExistingCustomer {
  id: string;
  code: string | null;
  name: string;
  tax_id: string | null;
  payment_terms: string | null;
  contact_person: string | null;
  mail_recipient: string | null;
  phone: string | null;
  fax: string | null;
  address: string | null;
  delivery_address: string | null;
  email: string | null;
  note: string | null;
  source: string | null;
  erp_active: boolean;
}

export type CustomerPlanAction = "insert" | "fill" | "unchanged";

export type CustomerPatch = Partial<
  Record<CustomerFillField | "note" | "source", string>
>;

export interface CustomerPlanRow {
  line: number;
  action: CustomerPlanAction;
  /** 對到的既有客戶 id；新增為 null。 */
  existingId: string | null;
  /** 對到既有客戶時要補的欄位（只含原本空白者；note 為合併後全文）。 */
  patch: CustomerPatch;
  /** 讀取時的既有 note（寫入時確認未被改動才更新 note）。 */
  noteBase: string | null;
  /** 既有值與檔案值不同、未覆蓋的欄位（只列欄位，不含內容）。 */
  conflicts: (CustomerFillField | "source")[];
  /** 對到的既有客戶 ERP 停用中（匯入不改 erp_active）。 */
  matchedErpInactive: boolean;
  parsed: ParsedCustomerRow;
}

function blank(v: string | null | undefined): boolean {
  return (v ?? "").trim() === "";
}

/** 同值判斷：去頭尾空白；Email、來源不分大小寫。 */
function sameValue(
  field: CustomerFillField | "source",
  a: string,
  b: string,
): boolean {
  const x = a.trim();
  const y = b.trim();
  return field === "email" || field === "source"
    ? x.toLowerCase() === y.toLowerCase()
    : x === y;
}

/** 依客戶編號（去空白、不分大小寫，同 DB 唯一鍵 lower(btrim(code))）比對既有客戶，產生每列動作。 */
export function buildCustomerImportPlan(
  rows: readonly ParsedCustomerRow[],
  existing: readonly ExistingCustomer[],
): CustomerPlanRow[] {
  const byCode = new Map<string, ExistingCustomer>();
  for (const c of existing) {
    const k = (c.code ?? "").trim().toLowerCase();
    if (k) byCode.set(k, c);
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
        matchedErpInactive: false,
        parsed: p,
      };
    }
    const patch: CustomerPatch = {};
    const conflicts: CustomerPlanRow["conflicts"] = [];
    for (const f of CUSTOMER_FILL_FIELDS) {
      const next = p.values[f];
      if (!next) continue;
      const cur = hit[f];
      if (blank(cur)) patch[f] = next;
      else if (!sameValue(f, cur!, next)) conflicts.push(f);
    }
    if (p.source) {
      if (blank(hit.source)) patch.source = p.source;
      else if (!sameValue("source", hit.source!, p.source))
        conflicts.push("source");
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
      matchedErpInactive: !hit.erp_active,
      parsed: p,
    };
  });
}

// ── 寫入動作 ────────────────────────────────────────────────

export type CustomerInsertRow = Record<CustomerFillField, string | null> & {
  code: string;
  name: string;
  note: string | null;
  source: string | null;
  erp_active: true;
};

export interface CustomerUpdateOp {
  id: string;
  patch: CustomerPatch;
  /** 只在 patch 含 note 時給：寫入時 note 仍等於此值才更新（避免蓋掉讀取後的修改）。 */
  note_base?: string | null;
}

export function customerImportOps(plan: readonly CustomerPlanRow[]): {
  inserts: CustomerInsertRow[];
  updates: CustomerUpdateOp[];
} {
  const inserts: CustomerInsertRow[] = [];
  const updates: CustomerUpdateOp[] = [];
  for (const r of plan) {
    if (r.action === "insert") {
      const v = r.parsed.values;
      inserts.push({
        code: r.parsed.code,
        name: v.name,
        tax_id: v.tax_id,
        payment_terms: v.payment_terms,
        contact_person: v.contact_person,
        mail_recipient: v.mail_recipient,
        phone: v.phone,
        fax: v.fax,
        address: v.address,
        delivery_address: v.delivery_address,
        email: v.email,
        note: mergeNote(null, r.parsed.noteSegments),
        source: r.parsed.source,
        erp_active: true,
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

export interface CustomerImportSummary {
  /** 有效列數（不含錯誤列、空白列）。 */
  rows: number;
  insert: number;
  fill: number;
  unchanged: number;
  /** 補欄位：各欄被補的列數。 */
  filledByField: Partial<Record<CustomerFillField | "note" | "source", number>>;
  /** 有衝突的列數。 */
  conflictRows: number;
  /** 衝突：各欄的列數（只列欄位名）。 */
  conflictsByField: Partial<Record<CustomerFillField | "source", number>>;
  /** 匯入後來源為 FB 的列數（名稱含 (FA) 或「客戶來源」為 FB）。 */
  fb: number;
  emailInvalid: number;
  taxIdNonStandard: number;
  /** 對到但 ERP 停用中的既有客戶（匯入不改 erp_active）。 */
  matchedErpInactive: number;
  /** 既有客戶中檔案沒有的（不受影響）。 */
  existingUnmatched: number;
  errors: CustomerRowError[];
}

export function summarizeCustomerImport(
  plan: readonly CustomerPlanRow[],
  errors: readonly CustomerRowError[],
  existingCount: number,
): CustomerImportSummary {
  const filledByField: CustomerImportSummary["filledByField"] = {};
  const conflictsByField: CustomerImportSummary["conflictsByField"] = {};
  for (const r of plan) {
    for (const f of Object.keys(r.patch) as (keyof CustomerPatch)[]) {
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
    fb: plan.filter((r) => r.parsed.source === FB_SOURCE).length,
    emailInvalid: plan.filter((r) => r.parsed.emailInvalid).length,
    taxIdNonStandard: plan.filter((r) => r.parsed.taxIdNonStandard).length,
    matchedErpInactive: plan.filter((r) => r.matchedErpInactive).length,
    existingUnmatched: existingCount - matched,
    errors: [...errors],
  };
}
