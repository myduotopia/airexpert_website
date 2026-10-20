// 員工主檔查詢 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp') 或 has_module('service_report')）；
// 讀取錯誤 throw（同 lib/erp/queries/pickers.ts 慣例）。
// 敏感資料（employee_private）只能透過 hr_* RPC，且只對 hr 使用者呼叫（見 private-queries.ts）。
import "server-only";

import { fetchAllRows } from "@/lib/fetch-all-rows";
import { getServerSupabase } from "@/lib/supabase-server";
import { IMPORT_EXISTING_COLUMNS, type ExistingEmployee } from "./import";
import {
  distinctTitles,
  filterEmployees,
  sortEmployees,
  type EmployeeListFilter,
} from "./list";
import { hasLeft, taipeiToday } from "./status";
import type { Employee, EmployeeOption } from "./types";

/**
 * 選取器選項欄位；建立員工的 action 也用同一組欄位讀回新列。
 * left_on 用來判斷「實際在職」（預定離職日到期後 DB 不會自動改 active）。
 */
export const EMPLOYEE_OPTION_COLUMNS = "id, code, name, roles, active, left_on";

/** 列表每頁筆數（同 ERP 基本資料）。 */
export const EMPLOYEE_PAGE_SIZE = 50;

type OptionRow = EmployeeOption & { left_on?: string | null };

/** DB 列 → 選取器選項（active = 實際在職）。 */
export function toEmployeeOption(
  row: OptionRow,
  today: string = taipeiToday(),
): EmployeeOption {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    roles: row.roles,
    active: row.active && !hasLeft(row, today),
  };
}

/**
 * 選取器選項（預設只列在職：active 且未到離職日；角色篩選在 client 端依欄位用途進行）。
 * 以 fetchAllRows 分頁讀完（PostgREST 單次上限 1000 列，#229）；任一頁失敗即 throw。
 * 舊單據上的離職員工不在清單中時，選取器以單據上的文字快照照常顯示（lib/employees/picker.ts）。
 */
export async function listEmployeeOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<EmployeeOption[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await fetchAllRows<OptionRow>((from, to) => {
    let query = supabase.from("employees").select(EMPLOYEE_OPTION_COLUMNS);
    if (!opts.includeInactive) query = query.eq("active", true);
    return query.order("name").order("id").range(from, to);
  });
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  const today = taipeiToday();
  return data
    .filter((r) => opts.includeInactive || !hasLeft(r, today))
    .map((r) => toEmployeeOption(r, today));
}

/** 員工主檔全表（非敏感欄位；員工數量少，列表篩選在記憶體進行，見 list.ts）。 */
async function listAllEmployees(): Promise<Employee[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await fetchAllRows<Employee>((from, to) =>
    supabase
      .from("employees")
      .select("*")
      .order("name")
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  return data;
}

export interface ListEmployeesParams extends EmployeeListFilter {
  page?: number;
}

export async function listEmployees(params: ListEmployeesParams = {}): Promise<{
  rows: Employee[];
  total: number;
  page: number;
  pageSize: number;
  titles: string[];
}> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const start = (page - 1) * EMPLOYEE_PAGE_SIZE;
  const today = taipeiToday();
  const all = await listAllEmployees();
  const filtered = sortEmployees(filterEmployees(all, params, today), today);
  return {
    rows: filtered.slice(start, start + EMPLOYEE_PAGE_SIZE),
    total: filtered.length,
    page,
    pageSize: EMPLOYEE_PAGE_SIZE,
    titles: distinctTitles(all),
  };
}

export async function getEmployee(id: string): Promise<Employee | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  return (data as Employee | null) ?? null;
}

/** 匯入比對用的既有員工（含離職；非敏感欄位）。 */
export async function listImportExisting(): Promise<ExistingEmployee[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await fetchAllRows<ExistingEmployee>((from, to) =>
    supabase
      .from("employees")
      .select(IMPORT_EXISTING_COLUMNS)
      .order("name")
      .order("id")
      .range(from, to),
  );
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  return data;
}

/** listEmployeeOptions 的不 throw 版本（讀不到時頁面仍可運作：選取器照常顯示目前值、可就地新增）。 */
export async function tryListEmployeeOptions(): Promise<
  { ok: true; data: EmployeeOption[] } | { ok: false; error: string }
> {
  try {
    return { ok: true, data: await listEmployeeOptions() };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "讀取員工失敗" };
  }
}
