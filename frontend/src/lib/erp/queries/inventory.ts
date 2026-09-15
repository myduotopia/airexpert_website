// 庫存區（#176）查詢 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp')）；錯誤 throw（同 queries/pickers.ts 讀取慣例）。
// 存量 / 庫存帳 / 機號為帳務表，用戶端唯讀；異動一律經過帳 RPC。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import type {
  StockLevelRow,
  StockMatrixItem,
} from "@/app/admin/(protected)/erp/inventory/_lib/inventory-logic";
import type {
  DocStatus,
  DocType,
  SerialStatus,
  WarehouseOption,
} from "../types";

export const INVENTORY_PAGE_SIZE = 50;

/** PostgREST 單次回傳上限為 1000 列；帳務表需分頁讀完。 */
const FETCH_CHUNK = 1000;

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

async function fetchAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += FETCH_CHUNK) {
    const { data, error } = await build(from, from + FETCH_CHUNK - 1);
    if (error) throw new Error(`讀取${label}失敗：${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < FETCH_CHUNK) return out;
  }
}

/** PostgREST or / ilike 值不可含結構字元。 */
export function sanitizeSearch(q: string | null | undefined): string {
  return (q ?? "").replace(/[,()"\\%*]/g, " ").trim();
}

// ── 存量表 ───────────────────────────────────────────────────

export interface StockMatrixData {
  items: StockMatrixItem[];
  /** 全部倉庫（含停用；頁面決定是否顯示）。 */
  warehouses: (WarehouseOption & { active: boolean })[];
  levels: StockLevelRow[];
}

export async function getStockMatrixData(): Promise<StockMatrixData> {
  const supabase = await getServerSupabase();
  const [items, warehouses, levels] = await Promise.all([
    fetchAll<StockMatrixItem>("品項", (from, to) =>
      supabase
        .from("erp_items")
        .select("id, code, name, kind, unit, avg_cost, safety_stock, active")
        .eq("track_stock", true)
        .order("code")
        .order("id")
        .range(from, to),
    ),
    fetchAll<WarehouseOption & { active: boolean }>("倉庫", (from, to) =>
      supabase
        .from("erp_warehouses")
        .select("id, code, name, is_default, active")
        .order("is_default", { ascending: false })
        .order("code")
        .range(from, to),
    ),
    fetchAll<StockLevelRow>("存量", (from, to) =>
      supabase
        .from("erp_stock_levels")
        .select("item_id, warehouse_id, qty")
        .order("item_id")
        .order("warehouse_id")
        .range(from, to),
    ),
  ]);
  return {
    items: items.map((i) => ({
      ...i,
      avg_cost: Number(i.avg_cost),
      safety_stock: Number(i.safety_stock),
    })),
    warehouses,
    levels: levels.map((l) => ({ ...l, qty: Number(l.qty) })),
  };
}

// ── 機號清單 ─────────────────────────────────────────────────

export interface SerialDocRef {
  id: string;
  doc_type: DocType;
  doc_no: string | null;
  status: DocStatus;
}

export interface SerialListRow {
  id: string;
  serial_no: string;
  status: SerialStatus;
  unit_cost: number | null;
  mx_machine_id: string | null;
  updated_at: string | null;
  item: { id: string; code: string; name: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  customer: { id: string; name: string } | null;
  in_doc: SerialDocRef | null;
  out_doc: SerialDocRef | null;
}

export interface ListSerialsParams {
  status?: SerialStatus | null;
  warehouseId?: string | null;
  itemId?: string | null;
  /** 搜尋機號或品項代碼 / 名稱。 */
  q?: string | null;
  page?: number;
}

export async function listSerials(params: ListSerialsParams): Promise<{
  rows: SerialListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const supabase = await getServerSupabase();
  const q = sanitizeSearch(params.q);

  let itemIds: string[] = [];
  if (q) {
    const { data, error } = await supabase
      .from("erp_items")
      .select("id")
      .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(200);
    if (error) throw new Error(`讀取品項失敗：${error.message}`);
    itemIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  let query = supabase
    .from("erp_serials")
    .select(
      "id, serial_no, status, unit_cost, mx_machine_id, updated_at, item:item_id(id, code, name), warehouse:warehouse_id(id, code, name), customer:customer_id(id, name), in_doc:in_doc_id(id, doc_type, doc_no, status), out_doc:out_doc_id(id, doc_type, doc_no, status)",
      { count: "exact" },
    );
  if (params.status) query = query.eq("status", params.status);
  if (params.warehouseId) query = query.eq("warehouse_id", params.warehouseId);
  if (params.itemId) query = query.eq("item_id", params.itemId);
  if (q) {
    query = itemIds.length
      ? query.or(`serial_no.ilike.%${q}%,item_id.in.(${itemIds.join(",")})`)
      : query.ilike("serial_no", `%${q}%`);
  }
  const start = (page - 1) * INVENTORY_PAGE_SIZE;
  const { data, error, count } = await query
    .order("serial_no")
    .order("id")
    .range(start, start + INVENTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`讀取機號失敗：${error.message}`);
  return {
    rows: (data ?? []) as unknown as SerialListRow[],
    total: count ?? 0,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
  };
}

// ── 庫存異動明細 ─────────────────────────────────────────────

export interface StockMoveRow {
  id: string;
  move_date: string;
  moved_at: string;
  qty: number;
  unit_cost: number;
  is_reversal: boolean;
  item: { id: string; code: string; name: string; unit: string } | null;
  warehouse: { id: string; code: string; name: string } | null;
  document: SerialDocRef | null;
  line: { description: string | null } | null;
}

const MOVE_SELECT =
  "id, move_date, moved_at, qty, unit_cost, is_reversal, item:item_id(id, code, name, unit), warehouse:warehouse_id(id, code, name), document:document_id(id, doc_type, doc_no, status), line:line_id(description)";

export interface StockMoveFilters {
  itemId?: string | null;
  warehouseId?: string | null;
  /** 西元 YYYY-MM-DD，含端點。 */
  from?: string | null;
  to?: string | null;
}

/**
 * 指定品項（可再限倉庫）時：回傳區間內全部異動（舊→新）與區間起日前的期初量，
 * 由呼叫端以 computeRunningBalance 算逐列結存。
 */
export async function getItemStockMoves(
  filters: StockMoveFilters & { itemId: string },
): Promise<{ opening: number; moves: StockMoveRow[] }> {
  const supabase = await getServerSupabase();

  const openingRows = filters.from
    ? await fetchAll<{ qty: number }>("期初異動", (from, to) => {
        let q = supabase
          .from("erp_stock_moves")
          .select("qty")
          .eq("item_id", filters.itemId)
          .lt("move_date", filters.from!);
        if (filters.warehouseId) q = q.eq("warehouse_id", filters.warehouseId);
        return q.order("id").range(from, to);
      })
    : [];

  const moves = await fetchAll<StockMoveRow>("異動明細", (from, to) => {
    let q = supabase
      .from("erp_stock_moves")
      .select(MOVE_SELECT)
      .eq("item_id", filters.itemId);
    if (filters.warehouseId) q = q.eq("warehouse_id", filters.warehouseId);
    if (filters.from) q = q.gte("move_date", filters.from);
    if (filters.to) q = q.lte("move_date", filters.to);
    return q.order("move_date").order("moved_at").order("id").range(from, to);
  });

  return {
    opening: openingRows.reduce((s, r) => s + Number(r.qty), 0),
    moves: moves.map((m) => ({
      ...m,
      qty: Number(m.qty),
      unit_cost: Number(m.unit_cost),
    })),
  };
}

/** 未指定品項：分頁列出異動（新→舊），不算結存。 */
export async function listStockMoves(
  filters: StockMoveFilters & { page?: number },
): Promise<{
  rows: StockMoveRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_stock_moves")
    .select(MOVE_SELECT, { count: "exact" });
  if (filters.warehouseId)
    query = query.eq("warehouse_id", filters.warehouseId);
  if (filters.from) query = query.gte("move_date", filters.from);
  if (filters.to) query = query.lte("move_date", filters.to);
  const start = (page - 1) * INVENTORY_PAGE_SIZE;
  const { data, error, count } = await query
    .order("move_date", { ascending: false })
    .order("moved_at", { ascending: false })
    .order("id")
    .range(start, start + INVENTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`讀取異動明細失敗：${error.message}`);
  return {
    rows: ((data ?? []) as unknown as StockMoveRow[]).map((m) => ({
      ...m,
      qty: Number(m.qty),
      unit_cost: Number(m.unit_cost),
    })),
    total: count ?? 0,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
  };
}

/** 異動明細篩選用：追蹤庫存的品項（含停用）。 */
export async function listStockItemOptions(): Promise<
  { id: string; code: string; name: string; active: boolean }[]
> {
  const supabase = await getServerSupabase();
  return fetchAll("品項", (from, to) =>
    supabase
      .from("erp_items")
      .select("id, code, name, active")
      .eq("track_stock", true)
      .order("code")
      .order("id")
      .range(from, to),
  );
}

// ── 調撥單 T / 盤點調整單 A 列表 ─────────────────────────────

export interface StockDocListRow {
  id: string;
  doc_no: string | null;
  doc_date: string;
  status: DocStatus;
  warehouse_id: string | null;
  to_warehouse_id: string | null;
  note: string | null;
  created_at: string;
}

export interface ListStockDocsParams {
  docType: "T" | "A";
  status?: DocStatus | null;
  /** 搜尋單號 / 備註。 */
  q?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
}

export async function listStockDocuments(params: ListStockDocsParams): Promise<{
  rows: StockDocListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_documents")
    .select(
      "id, doc_no, doc_date, status, warehouse_id, to_warehouse_id, note, created_at",
      { count: "exact" },
    )
    .eq("doc_type", params.docType);
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("doc_date", params.from);
  if (params.to) query = query.lte("doc_date", params.to);
  const q = sanitizeSearch(params.q);
  if (q) query = query.or(`doc_no.ilike.%${q}%,note.ilike.%${q}%`);
  const start = (page - 1) * INVENTORY_PAGE_SIZE;
  const { data, error, count } = await query
    .order("doc_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, start + INVENTORY_PAGE_SIZE - 1);
  if (error) throw new Error(`讀取單據失敗：${error.message}`);
  return {
    rows: (data ?? []) as StockDocListRow[],
    total: count ?? 0,
    page,
    pageSize: INVENTORY_PAGE_SIZE,
  };
}

/** 過帳前驗證用：品項的機號 / 庫存追蹤設定。 */
export async function getStockDocItemInfo(
  itemIds: string[],
): Promise<
  { id: string; code: string; track_serial: boolean; track_stock: boolean }[]
> {
  if (itemIds.length === 0) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("erp_items")
    .select("id, code, track_serial, track_stock")
    .in("id", itemIds);
  if (error) throw new Error(`讀取品項失敗：${error.message}`);
  return (data ?? []) as {
    id: string;
    code: string;
    track_serial: boolean;
    track_stock: boolean;
  }[];
}
