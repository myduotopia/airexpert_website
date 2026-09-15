// ERP 表單下拉選項查詢 — SERVER ONLY。
// server component 讀出後以 props 傳給 components/erp 的 Picker（client 端搜尋）。
// 讀取走登入者 session（RLS：has_module('erp')）；錯誤 throw（同保養卡 DAL 的讀取慣例）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import type {
  CustomerOption,
  ItemOption,
  SerialOption,
  SerialStatus,
  VendorOption,
  WarehouseOption,
} from "../types";

/** 品項選項（預設只列啟用中）。 */
export async function listItemOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<ItemOption[]> {
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_items")
    .select(
      "id, code, name, kind, unit, track_serial, track_stock, sale_price, purchase_price, avg_cost, model",
    );
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.order("code");
  if (error) throw new Error(`讀取品項失敗：${error.message}`);
  return (data ?? []) as ItemOption[];
}

/** 客戶選項（mx_customers，預設只列 erp_active）。 */
export async function listCustomerOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<CustomerOption[]> {
  const supabase = await getServerSupabase();
  let query = supabase
    .from("mx_customers")
    .select(
      "id, code, name, tax_id, contact_person, phone, address, delivery_address, payment_terms, sales_rep",
    );
  if (!opts.includeInactive) query = query.eq("erp_active", true);
  const { data, error } = await query.order("name");
  if (error) throw new Error(`讀取客戶失敗：${error.message}`);
  return (data ?? []) as CustomerOption[];
}

/** 廠商選項（預設只列啟用中）。 */
export async function listVendorOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<VendorOption[]> {
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_vendors")
    .select(
      "id, code, name, tax_id, contact_person, phone, address, currency, payment_terms",
    );
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.order("code");
  if (error) throw new Error(`讀取廠商失敗：${error.message}`);
  return (data ?? []) as VendorOption[];
}

/** 倉庫選項（預設倉排最前）。 */
export async function listWarehouseOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<WarehouseOption[]> {
  const supabase = await getServerSupabase();
  let query = supabase
    .from("erp_warehouses")
    .select("id, code, name, is_default");
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("code");
  if (error) throw new Error(`讀取倉庫失敗：${error.message}`);
  return (data ?? []) as WarehouseOption[];
}

/**
 * 可選機號：依品項 + 狀態（+ 倉庫 / 客戶）篩選。
 * 例：銷貨出庫 → { itemId, warehouseId, status: 'in_stock' }；
 *     銷退 → { itemId, status: 'sold', customerId }。
 * itemId 可傳陣列（一次載入整張單所有序號品項的機號）。
 * PostgREST 預設單次最多回 1,000 列、且 `.in()` 會把 id 放進 URL：
 * item id 每 SERIAL_ITEM_CHUNK 個一批，每批以 `.range()` 分頁讀到短頁為止；
 * 結果依 serial_no、id 排序。
 */
export const SERIAL_ITEM_CHUNK = 100;
export const SERIAL_PAGE_SIZE = 1000;

export async function listAvailableSerials(params: {
  itemId: string | string[];
  warehouseId?: string | null;
  customerId?: string | null;
  status: SerialStatus;
}): Promise<SerialOption[]> {
  const itemIds = [
    ...new Set(Array.isArray(params.itemId) ? params.itemId : [params.itemId]),
  ];
  if (itemIds.length === 0) return [];
  const supabase = await getServerSupabase();
  const out: SerialOption[] = [];
  for (let c = 0; c < itemIds.length; c += SERIAL_ITEM_CHUNK) {
    const chunk = itemIds.slice(c, c + SERIAL_ITEM_CHUNK);
    for (let from = 0; ; from += SERIAL_PAGE_SIZE) {
      let query = supabase
        .from("erp_serials")
        .select("id, item_id, serial_no, status, warehouse_id, customer_id")
        .in("item_id", chunk)
        .eq("status", params.status);
      if (params.warehouseId) {
        query = query.eq("warehouse_id", params.warehouseId);
      }
      if (params.customerId) query = query.eq("customer_id", params.customerId);
      const { data, error } = await query
        .order("serial_no")
        .order("id")
        .range(from, from + SERIAL_PAGE_SIZE - 1);
      if (error) throw new Error(`讀取機號失敗：${error.message}`);
      const rows = (data ?? []) as SerialOption[];
      out.push(...rows);
      if (rows.length < SERIAL_PAGE_SIZE) break;
    }
  }
  if (itemIds.length > SERIAL_ITEM_CHUNK) {
    // 多批時合併後重新排序（單批已由 DB 排好）。
    out.sort((a, b) =>
      a.serial_no === b.serial_no
        ? a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
        : a.serial_no < b.serial_no
          ? -1
          : 1,
    );
  }
  return out;
}
