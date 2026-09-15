// ERP 基本資料（品項／倉庫／廠商／客戶）查詢與寫入輔助 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；讀取錯誤 throw（同 pickers.ts 慣例），
// 寫入由各區 actions.ts 呼叫，錯誤一律轉成中文訊息回傳（masterWriteError）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import type { MxMachine } from "@/lib/admin/maintenance";
import type {
  DocStatus,
  DocType,
  ErpCustomer,
  ErpItem,
  ErpPartyBalance,
  ErpVendor,
  ErpWarehouse,
  ItemKind,
  PartyType,
} from "../types";

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

/** 基本資料列表每頁筆數（spec §6）。 */
export const MASTER_PAGE_SIZE = 50;

export const CODE_TAKEN_MESSAGE = "代碼已存在，請改用其他代碼。";

// ── 共用：錯誤對應 / 文字清理 ────────────────────────────────

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * 基本資料寫入錯誤 → 中文訊息：
 * - 23505 unique（代碼 lower(btrim(code)) 唯一索引）→「代碼已存在」；預設倉索引另給訊息
 * - 23503 FK（被單據／品項引用）→ 請改為停用
 * - 23514 check（品項追蹤設定）→ 設定不符規則
 */
export function masterWriteError(err: DbError | null | undefined): string {
  const code = err?.code ?? "";
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;
  if (code === "23505") {
    if (text.includes("default_key"))
      return "已有其他預設倉，請重新整理後再試。";
    return CODE_TAKEN_MESSAGE;
  }
  if (code === "23503") {
    return "此資料已被單據或其他資料引用，無法刪除，請改為停用。";
  }
  if (code === "23514") {
    return "品項設定不符規則（服務／費用不可追蹤庫存或機號；建保養卡需追蹤機號）。";
  }
  const msg = err?.message?.trim();
  return msg ? `儲存失敗：${msg}` : "儲存失敗，請稍後再試。";
}

export function cleanText(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

/** PostgREST or-filter 的值不可含結構字元；移除以避免語法錯誤。 */
export function sanitizeSearch(q: string | null | undefined): string {
  return (q ?? "").replace(/[,()"\\%*]/g, " ").trim();
}

function pageRange(page: number | undefined): [number, number, number] {
  const p = Math.max(1, Math.floor(page ?? 1));
  const start = (p - 1) * MASTER_PAGE_SIZE;
  return [p, start, start + MASTER_PAGE_SIZE - 1];
}

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── 輸入正規化（倉庫／廠商／客戶；品項見 erp/items/_lib/rules.ts） ──

export interface WarehouseInput {
  code: string;
  name: string;
  is_default: boolean;
  active: boolean;
  note: string;
}

export function normalizeWarehouseInput(
  input: WarehouseInput,
):
  | { ok: true; row: Omit<ErpWarehouse, "id" | "created_at" | "updated_at"> }
  | { ok: false; error: string } {
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "請填寫倉庫代碼。" };
  if (!name) return { ok: false, error: "請填寫倉庫名稱。" };
  const is_default = !!input.is_default;
  const active = input.active !== false;
  if (is_default && !active) {
    return { ok: false, error: "預設倉不可停用，請先將其他倉庫設為預設。" };
  }
  return {
    ok: true,
    row: { code, name, is_default, active, note: cleanText(input.note) },
  };
}

export interface VendorInput {
  code: string;
  name: string;
  tax_id: string;
  contact_person: string;
  phone: string;
  fax: string;
  email: string;
  address: string;
  currency: string;
  payment_terms: string;
  active: boolean;
  note: string;
}

export function normalizeVendorInput(
  input: VendorInput,
):
  | { ok: true; row: Omit<ErpVendor, "id" | "created_at" | "updated_at"> }
  | { ok: false; error: string } {
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "請填寫廠商代碼。" };
  if (!name) return { ok: false, error: "請填寫廠商名稱。" };
  const currency = (input.currency ?? "").trim().toUpperCase() || "TWD";
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: "幣別請填 3 碼代號（例：TWD、USD）。" };
  }
  return {
    ok: true,
    row: {
      code,
      name,
      tax_id: cleanText(input.tax_id),
      contact_person: cleanText(input.contact_person),
      phone: cleanText(input.phone),
      fax: cleanText(input.fax),
      email: cleanText(input.email),
      address: cleanText(input.address),
      currency,
      payment_terms: cleanText(input.payment_terms),
      active: input.active !== false,
      note: cleanText(input.note),
    },
  };
}

export interface CustomerInput {
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  address: string;
  note: string;
  tax_id: string;
  invoice_title: string;
  delivery_address: string;
  payment_terms: string;
  sales_rep: string;
  erp_active: boolean;
}

export function normalizeCustomerInput(
  input: CustomerInput,
): { ok: true; row: Omit<ErpCustomer, "id"> } | { ok: false; error: string } {
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "請填寫客戶名稱。" };
  const tax_id = cleanText(input.tax_id);
  if (tax_id && !/^\d{8}$/.test(tax_id)) {
    return { ok: false, error: "統一編號應為 8 位數字。" };
  }
  return {
    ok: true,
    row: {
      code: cleanText(input.code),
      name,
      contact_person: cleanText(input.contact_person),
      phone: cleanText(input.phone),
      address: cleanText(input.address),
      note: cleanText(input.note),
      tax_id,
      invoice_title: cleanText(input.invoice_title),
      delivery_address: cleanText(input.delivery_address),
      payment_terms: cleanText(input.payment_terms),
      sales_rep: cleanText(input.sales_rep),
      erp_active: input.erp_active !== false,
    },
  };
}

// ── 品項 ─────────────────────────────────────────────────────

export interface ListItemsParams {
  q?: string | null;
  kind?: ItemKind | null;
  /** true = 含停用。 */
  includeInactive?: boolean;
  page?: number;
}

export async function listItems(
  params: ListItemsParams = {},
): Promise<Paged<ErpItem>> {
  const [page, start, end] = pageRange(params.page);
  const supabase = await getServerSupabase();
  let query = supabase.from("erp_items").select("*", { count: "exact" });
  if (params.kind) query = query.eq("kind", params.kind);
  if (!params.includeInactive) query = query.eq("active", true);
  const q = sanitizeSearch(params.q);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, error, count } = await query.order("code").range(start, end);
  if (error) throw new Error(`讀取品項失敗：${error.message}`);
  return {
    rows: (data ?? []) as ErpItem[],
    total: count ?? 0,
    page,
    pageSize: MASTER_PAGE_SIZE,
  };
}

export async function getItem(id: string): Promise<ErpItem | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取品項失敗：${error.message}`);
  return (data as ErpItem | null) ?? null;
}

export interface ItemStockRow {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  qty: number;
}

/** 品項各倉存量（erp_stock_levels，依倉庫代碼排序）。 */
export async function getItemStock(itemId: string): Promise<ItemStockRow[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_stock_levels")
    .select("warehouse_id, qty, erp_warehouses(code, name)")
    .eq("item_id", itemId);
  if (error) throw new Error(`讀取庫存失敗：${error.message}`);
  return (
    (data ?? []) as unknown as {
      warehouse_id: string;
      qty: number;
      erp_warehouses: { code: string; name: string } | null;
    }[]
  )
    .map((r) => ({
      warehouse_id: r.warehouse_id,
      warehouse_code: r.erp_warehouses?.code ?? "",
      warehouse_name: r.erp_warehouses?.name ?? "",
      qty: Number(r.qty) || 0,
    }))
    .sort((a, b) => a.warehouse_code.localeCompare(b.warehouse_code));
}

/**
 * 品項是否已有庫存或異動（有則不可關閉庫存／機號追蹤）。
 * 以 erp_stock_moves 是否存在判斷（存量列一定伴隨異動）。
 */
export async function itemHasStockActivity(
  supabase: Supabase,
  itemId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("erp_stock_moves")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);
  if (error) throw new Error(`讀取庫存異動失敗：${error.message}`);
  return (count ?? 0) > 0;
}

// ── 倉庫 ─────────────────────────────────────────────────────

export async function listWarehouses(): Promise<ErpWarehouse[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_warehouses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("code");
  if (error) throw new Error(`讀取倉庫失敗：${error.message}`);
  return (data ?? []) as ErpWarehouse[];
}

export async function getWarehouse(id: string): Promise<ErpWarehouse | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_warehouses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取倉庫失敗：${error.message}`);
  return (data as ErpWarehouse | null) ?? null;
}

/** 倉庫是否有庫存（存量非 0）或任何異動；有則只能停用、不能刪除。 */
export async function warehouseInUse(
  supabase: Supabase,
  warehouseId: string,
): Promise<boolean> {
  const [moves, levels] = await Promise.all([
    supabase
      .from("erp_stock_moves")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId),
    supabase
      .from("erp_stock_levels")
      .select("item_id", { count: "exact", head: true })
      .eq("warehouse_id", warehouseId)
      .neq("qty", 0),
  ]);
  if (moves.error) throw new Error(moves.error.message);
  if (levels.error) throw new Error(levels.error.message);
  return (moves.count ?? 0) > 0 || (levels.count ?? 0) > 0;
}

// ── 廠商 ─────────────────────────────────────────────────────

export interface ListPartyParams {
  q?: string | null;
  includeInactive?: boolean;
  page?: number;
}

export async function listVendors(
  params: ListPartyParams = {},
): Promise<Paged<ErpVendor>> {
  const [page, start, end] = pageRange(params.page);
  const supabase = await getServerSupabase();
  let query = supabase.from("erp_vendors").select("*", { count: "exact" });
  if (!params.includeInactive) query = query.eq("active", true);
  const q = sanitizeSearch(params.q);
  if (q) {
    query = query.or(
      `code.ilike.%${q}%,name.ilike.%${q}%,tax_id.ilike.%${q}%,contact_person.ilike.%${q}%`,
    );
  }
  const { data, error, count } = await query.order("code").range(start, end);
  if (error) throw new Error(`讀取廠商失敗：${error.message}`);
  return {
    rows: (data ?? []) as ErpVendor[],
    total: count ?? 0,
    page,
    pageSize: MASTER_PAGE_SIZE,
  };
}

export async function getVendor(id: string): Promise<ErpVendor | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取廠商失敗：${error.message}`);
  return (data as ErpVendor | null) ?? null;
}

// ── 客戶（mx_customers 共用） ────────────────────────────────

export async function listErpCustomers(
  params: ListPartyParams = {},
): Promise<Paged<ErpCustomer>> {
  const [page, start, end] = pageRange(params.page);
  const supabase = await getServerSupabase();
  let query = supabase
    .from("mx_customers")
    .select(
      "id, code, name, contact_person, phone, address, note, tax_id, invoice_title, delivery_address, payment_terms, sales_rep, erp_active",
      { count: "exact" },
    );
  if (!params.includeInactive) query = query.eq("erp_active", true);
  const q = sanitizeSearch(params.q);
  if (q) {
    query = query.or(
      `code.ilike.%${q}%,name.ilike.%${q}%,tax_id.ilike.%${q}%,contact_person.ilike.%${q}%,phone.ilike.%${q}%`,
    );
  }
  const { data, error, count } = await query
    .order("code", { ascending: true, nullsFirst: false })
    .order("name")
    .range(start, end);
  if (error) throw new Error(`讀取客戶失敗：${error.message}`);
  return {
    rows: (data ?? []) as ErpCustomer[],
    total: count ?? 0,
    page,
    pageSize: MASTER_PAGE_SIZE,
  };
}

export async function getErpCustomer(id: string): Promise<ErpCustomer | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_customers")
    .select(
      "id, code, name, contact_person, phone, address, note, tax_id, invoice_title, delivery_address, payment_terms, sales_rep, erp_active",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取客戶失敗：${error.message}`);
  return (data as ErpCustomer | null) ?? null;
}

/** 客戶名下保養卡機台（使用中在前）。 */
export async function listCustomerMachines(
  customerId: string,
): Promise<MxMachine[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("mx_machines")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取客戶機台失敗：${error.message}`);
  const rows = (data ?? []) as MxMachine[];
  return [
    ...rows.filter((m) => !m.archived_at),
    ...rows.filter((m) => m.archived_at),
  ];
}

// ── 餘額 / 近期單據 ──────────────────────────────────────────

/** 客戶應收（廠商應付）餘額與未沖銷預收（預付）。查無資料回 0。 */
export async function getPartyBalance(
  partyType: PartyType,
  partyId: string,
): Promise<Pick<ErpPartyBalance, "balance" | "unallocated">> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_party_balances")
    .select("balance, unallocated")
    .eq("party_type", partyType)
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw new Error(`讀取餘額失敗：${error.message}`);
  const row = data as { balance: number; unallocated: number } | null;
  return {
    balance: Number(row?.balance ?? 0),
    unallocated: Number(row?.unallocated ?? 0),
  };
}

export interface RecentDocumentRow {
  id: string;
  doc_type: DocType;
  doc_no: string | null;
  doc_date: string;
  status: DocStatus;
  currency: string;
  total_amount: number;
  total_twd: number;
}

/** 客戶或廠商的近期單據（含草稿與作廢，新→舊）。 */
export async function listRecentDocuments(
  party: { customerId: string } | { vendorId: string },
  limit = 10,
): Promise<RecentDocumentRow[]> {
  const supabase = await getServerSupabase();
  const column = "customerId" in party ? "customer_id" : "vendor_id";
  const id = "customerId" in party ? party.customerId : party.vendorId;
  const { data, error } = await supabase
    .from("erp_documents")
    .select(
      "id, doc_type, doc_no, doc_date, status, currency, total_amount, total_twd",
    )
    .eq(column, id)
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`讀取單據失敗：${error.message}`);
  return (data ?? []) as RecentDocumentRow[];
}
