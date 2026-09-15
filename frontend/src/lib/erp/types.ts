// ERP 型別（對應 spec §4 資料表欄位；migration 0020）。純型別，client / server 皆可 import。
// numeric 欄位經 PostgREST 以 JSON number 回傳，這裡一律以 number 表示；
// date 為 "YYYY-MM-DD"（西元，無時區）、timestamptz 為 ISO 字串。

/** 單別：報價 Q、採購 P、進貨 I、進退 PR、銷貨 S、銷退 SR、調撥 T、盤點調整 A。 */
export type DocType = "Q" | "P" | "I" | "PR" | "S" | "SR" | "T" | "A";
export const DOC_TYPES: readonly DocType[] = [
  "Q",
  "P",
  "I",
  "PR",
  "S",
  "SR",
  "T",
  "A",
];

export type DocStatus = "draft" | "posted" | "voided";
export const DOC_STATUSES: readonly DocStatus[] = ["draft", "posted", "voided"];

/** 稅別：外加 / 內含 / 免稅。 */
export type TaxType = "excluded" | "included" | "exempt";
export const TAX_TYPES: readonly TaxType[] = ["excluded", "included", "exempt"];

/** 明細行類型：品項 / 折扣（負數金額）/ 純文字備註。 */
export type LineType = "item" | "discount" | "note";

/** 品項類別：整機 / 零件耗材 / 服務 / 費用。 */
export type ItemKind = "machine" | "part" | "service" | "expense";

export type MxCardType = "compressor" | "filter";

export type SerialStatus =
  | "in_stock"
  | "sold"
  | "returned_to_vendor"
  | "written_off";

export type PaymentDirection = "in" | "out";
export type PaymentMethod = "cash" | "transfer" | "check" | "other";
export type CheckStatus = "pending" | "cleared" | "bounced";
export type PaymentStatus = "posted" | "voided";

/** 客戶（ERP 需先分辨客戶或廠商時用）。 */
export type PartyType = "customer" | "vendor";

// ── 4.1 基本資料 ─────────────────────────────────────────────

export interface ErpWarehouse {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ErpVendor {
  id: string;
  code: string;
  name: string;
  tax_id: string | null;
  contact_person: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  payment_terms: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ErpItem {
  id: string;
  code: string;
  name: string;
  kind: ItemKind;
  unit: string;
  track_serial: boolean;
  track_stock: boolean;
  mx_card_type: MxCardType | null;
  brand: string | null;
  model: string | null;
  sale_price: number | null;
  purchase_price: number | null;
  avg_cost: number;
  safety_stock: number;
  default_vendor_id: string | null;
  product_id: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

/** mx_customers 含 0020 擴充的 ERP 欄位（保養卡欄位見 lib/admin/maintenance.ts）。 */
export interface ErpCustomer {
  id: string;
  code: string | null;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  tax_id: string | null;
  invoice_title: string | null;
  delivery_address: string | null;
  payment_terms: string | null;
  sales_rep: string | null;
  erp_active: boolean;
}

// ── 4.2 單據 ─────────────────────────────────────────────────

export interface ErpDocument {
  id: string;
  doc_type: DocType;
  doc_no: string | null;
  doc_date: string;
  status: DocStatus;
  customer_id: string | null;
  vendor_id: string | null;
  warehouse_id: string | null;
  to_warehouse_id: string | null;
  source_doc_id: string | null;
  party_name: string | null;
  party_tax_id: string | null;
  party_contact: string | null;
  party_phone: string | null;
  party_address: string | null;
  sales_rep: string | null;
  tax_type: TaxType;
  tax_rate: number;
  currency: string;
  exchange_rate: number;
  amount_untaxed: number;
  tax_amount: number;
  total_amount: number;
  total_twd: number;
  invoice_no: string | null;
  expected_date: string | null;
  note: string | null;
  posted_at: string | null;
  posted_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
}

export interface ErpDocumentLine {
  id: string;
  document_id: string;
  line_no: number;
  line_type: LineType;
  item_id: string | null;
  description: string | null;
  qty: number;
  unit_price: number;
  amount: number;
  unit_cost: number | null;
  source_line_id: string | null;
  serial_nos: string[] | null;
}

export interface ErpDocumentLineSerial {
  line_id: string;
  serial_id: string;
}

export interface ErpDocSequence {
  prefix: string;
  period: string;
  last_no: number;
}

// ── 4.3 庫存 ─────────────────────────────────────────────────

export interface ErpSerial {
  id: string;
  item_id: string;
  serial_no: string;
  status: SerialStatus;
  warehouse_id: string | null;
  customer_id: string | null;
  unit_cost: number | null;
  in_doc_id: string | null;
  out_doc_id: string | null;
  mx_machine_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ErpStockLevel {
  item_id: string;
  warehouse_id: string;
  qty: number;
}

export interface ErpStockMove {
  id: string;
  moved_at: string;
  move_date: string;
  item_id: string;
  warehouse_id: string;
  qty: number;
  unit_cost: number;
  document_id: string;
  line_id: string | null;
  is_reversal: boolean;
}

// ── 4.4 應收應付 ─────────────────────────────────────────────

export interface ErpPayment {
  id: string;
  direction: PaymentDirection;
  doc_no: string | null;
  pay_date: string;
  customer_id: string | null;
  vendor_id: string | null;
  method: PaymentMethod;
  amount: number;
  check_no: string | null;
  check_due_date: string | null;
  bank: string | null;
  check_status: CheckStatus | null;
  status: PaymentStatus;
  voided_at: string | null;
  void_reason: string | null;
  note: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface ErpPaymentAllocation {
  id: string;
  payment_id: string;
  document_id: string;
  amount: number;
}

// ── Views（§2.0） ────────────────────────────────────────────

export interface ErpDocumentBalance {
  document_id: string;
  doc_type: DocType;
  doc_no: string;
  doc_date: string;
  customer_id: string | null;
  vendor_id: string | null;
  total_twd: number;
  allocated: number;
  outstanding: number;
}

export interface ErpPartyBalance {
  party_type: PartyType;
  party_id: string;
  balance: number;
  unallocated: number;
}

export interface ErpPurchaseLineProgress {
  line_id: string;
  document_id: string;
  item_id: string;
  qty: number;
  received_qty: number;
  remaining_qty: number;
}

export interface ErpPurchaseProgress {
  document_id: string;
  status: "open" | "partial" | "closed";
}

// ── RPC 介面（§2.0） ─────────────────────────────────────────

export interface PostDocumentResult {
  doc_no: string;
  warnings: string[];
  mx_machine_ids: string[];
}

export interface VoidDocumentResult {
  warnings: string[];
}

export interface PaymentAllocationInput {
  document_id: string;
  amount: number;
}

/** erp_post_payment 的 payload（jsonb）。 */
export interface PaymentPayload {
  direction: PaymentDirection;
  pay_date: string;
  customer_id?: string | null;
  vendor_id?: string | null;
  method: PaymentMethod;
  amount: number;
  check_no?: string | null;
  check_due_date?: string | null;
  bank?: string | null;
  check_status?: CheckStatus | null;
  note?: string | null;
  allocations: PaymentAllocationInput[];
}

export interface PostPaymentResult {
  id: string;
  doc_no: string;
}

// ── 前端編輯用（草稿）輸入型別 ───────────────────────────────

/**
 * 表單上編輯中的一行明細（受控，DocumentLinesEditor 的 value）。
 * - item：amount 由 qty × unit_price 算出（calcLineAmount），不需自行維護。
 * - discount：amount 為使用者輸入的折扣金額（一律視為負數）。
 * - note：只用 description，其餘忽略。
 */
export interface DraftLine {
  /** client 端穩定 key（React list key / 排序用）；存檔時不寫入 DB。 */
  key: string;
  /** 既有行的 DB id（僅供參考；存草稿時整批重建明細）。 */
  id?: string | null;
  line_type: LineType;
  item_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  source_line_id?: string | null;
  /** 既有機號（S、SR、PR、T、A 盤虧）：erp_serials.id，存於 erp_document_line_serials。 */
  serial_ids: string[];
  /** 新機號（I、A 盤盈）：過帳時才建立 erp_serials，草稿存於 lines.serial_nos。 */
  serial_nos: string[];
}

/** 存草稿的輸入（saveDraftDocument）。party_* 快照由 server 依客戶 / 廠商帶入。 */
export interface DraftDocument {
  /** 有 id = 更新既有草稿；無 = 新增。 */
  id?: string | null;
  doc_type: DocType;
  doc_date: string;
  customer_id?: string | null;
  vendor_id?: string | null;
  warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  source_doc_id?: string | null;
  sales_rep?: string | null;
  tax_type: TaxType;
  tax_rate: number;
  currency: string;
  exchange_rate: number;
  invoice_no?: string | null;
  expected_date?: string | null;
  note?: string | null;
  lines: DraftLine[];
}

/** DraftDocument 的表頭部分（DocumentHeaderFields 的 value）。 */
export type DraftDocumentHeader = Omit<DraftDocument, "lines">;

/** 單據 + 明細（含已選機號），getDocumentWithLines 的回傳。 */
export interface ErpDocumentWithLines extends ErpDocument {
  lines: (ErpDocumentLine & {
    serials: Pick<ErpSerial, "id" | "serial_no" | "status">[];
  })[];
}

/** 列表列（listDocuments）。 */
export type ErpDocumentListRow = Pick<
  ErpDocument,
  | "id"
  | "doc_type"
  | "doc_no"
  | "doc_date"
  | "status"
  | "customer_id"
  | "vendor_id"
  | "party_name"
  | "currency"
  | "total_amount"
  | "total_twd"
  | "created_at"
>;

/** lib/erp server helper 的統一回傳（沿用保養卡的 { ok } 模式，不 throw）。 */
export type ErpResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ── Picker 選項 ───────────────────────────────────────────────

export type ItemOption = Pick<
  ErpItem,
  | "id"
  | "code"
  | "name"
  | "kind"
  | "unit"
  | "track_serial"
  | "track_stock"
  | "sale_price"
  | "purchase_price"
  | "avg_cost"
  | "model"
>;

export type CustomerOption = Pick<
  ErpCustomer,
  | "id"
  | "code"
  | "name"
  | "tax_id"
  | "contact_person"
  | "phone"
  | "address"
  | "delivery_address"
  | "payment_terms"
  | "sales_rep"
>;

export type VendorOption = Pick<
  ErpVendor,
  | "id"
  | "code"
  | "name"
  | "tax_id"
  | "contact_person"
  | "phone"
  | "address"
  | "currency"
  | "payment_terms"
>;

export type WarehouseOption = Pick<
  ErpWarehouse,
  "id" | "code" | "name" | "is_default"
>;

export type SerialOption = Pick<
  ErpSerial,
  "id" | "item_id" | "serial_no" | "status" | "warehouse_id" | "customer_id"
>;
