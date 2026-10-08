// 員工主檔查詢 — SERVER ONLY。
// 讀取走登入者 session（RLS：has_module('erp') 或 has_module('service_report')）；
// 讀取錯誤 throw（同 lib/erp/queries/pickers.ts 慣例）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import type { Employee, EmployeeOption, EmployeeRole } from "./types";

/** 選取器選項欄位（types.ts 的 EmployeeOption）；建立員工的 action 也用同一組欄位讀回新列。 */
export const EMPLOYEE_OPTION_COLUMNS = "id, code, name, roles, active";

/** 列表每頁筆數（同 ERP 基本資料）。 */
export const EMPLOYEE_PAGE_SIZE = 50;

/** PostgREST or-filter 的值不可含結構字元；移除以避免語法錯誤。 */
function sanitizeSearch(q: string | null | undefined): string {
  return (q ?? "").replace(/[,()"\\%*]/g, " ").trim();
}

/** 選取器選項（預設只列在職；角色篩選在 client 端依欄位用途進行）。 */
export async function listEmployeeOptions(
  opts: { includeInactive?: boolean } = {},
): Promise<EmployeeOption[]> {
  const supabase = await getServerSupabase();
  let query = supabase.from("employees").select(EMPLOYEE_OPTION_COLUMNS);
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query.order("name");
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  return (data ?? []) as EmployeeOption[];
}

export interface ListEmployeesParams {
  q?: string | null;
  role?: EmployeeRole | null;
  /** true = 含停用。 */
  includeInactive?: boolean;
  page?: number;
}

export async function listEmployees(params: ListEmployeesParams = {}): Promise<{
  rows: Employee[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const start = (page - 1) * EMPLOYEE_PAGE_SIZE;
  const supabase = await getServerSupabase();
  let query = supabase.from("employees").select("*", { count: "exact" });
  if (!params.includeInactive) query = query.eq("active", true);
  if (params.role) query = query.contains("roles", [params.role]);
  const q = sanitizeSearch(params.q);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, error, count } = await query
    .order("active", { ascending: false })
    .order("name")
    .range(start, start + EMPLOYEE_PAGE_SIZE - 1);
  if (error) throw new Error(`讀取員工失敗：${error.message}`);
  return {
    rows: (data ?? []) as Employee[],
    total: count ?? 0,
    page,
    pageSize: EMPLOYEE_PAGE_SIZE,
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
