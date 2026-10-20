// 員工主檔列表的搜尋與篩選（#257）— 純函式，server（queries.ts）與測試共用。
// 員工數量很少（數十筆），列表一次讀完後在記憶體篩選：「在職」需同時判斷 active 與離職日
// （預定離職日到期後 DB 不會自動改 active，見 status.ts），用 PostgREST 篩選需要兩組 or 條件。
import { employeeNameKey } from "./normalize";
import { isEmployeeCurrent } from "./status";
import { EMPLOYEE_ROLES, type Employee, type EmployeeRole } from "./types";

/** 狀態篩選：在職（預設）、離職（含停用）、全部。 */
export type EmployeeStatusFilter = "current" | "former" | "all";

/** 角色篩選：4 種角色或「無角色」。 */
export type EmployeeRoleFilter = EmployeeRole | "none";

export interface EmployeeListFilter {
  q?: string | null;
  status?: EmployeeStatusFilter;
  role?: EmployeeRoleFilter | null;
  /** 職務原文（完全相同）。 */
  title?: string | null;
}

export function parseStatusFilter(
  v: string | null | undefined,
): EmployeeStatusFilter {
  return v === "former" || v === "all" ? v : "current";
}

export function parseRoleFilter(
  v: string | null | undefined,
): EmployeeRoleFilter | null {
  if (v === "none") return "none";
  return (EMPLOYEE_ROLES as readonly string[]).includes(v ?? "")
    ? (v as EmployeeRole)
    : null;
}

/** 電話比對只看數字（「02-1234 5678」可用「12345678」找到）。 */
function digits(v: string | null | undefined): string {
  return (v ?? "").normalize("NFKC").replace(/\D+/g, "");
}

/** 搜尋：員工編號、姓名（不分大小寫與空白）、電話（只比對數字）。 */
export function matchesEmployeeSearch(e: Employee, q: string): boolean {
  const query = q.trim();
  if (!query) return true;
  const key = employeeNameKey(query);
  if ((e.code ?? "").toLowerCase().includes(key)) return true;
  if (employeeNameKey(e.name).includes(key)) return true;
  const d = digits(query);
  return d.length >= 3 && digits(e.phone).includes(d);
}

export function filterEmployees(
  rows: readonly Employee[],
  f: EmployeeListFilter,
  today: string,
): Employee[] {
  const status = f.status ?? "current";
  return rows.filter((e) => {
    const current = isEmployeeCurrent(e, today);
    if (status === "current" && !current) return false;
    if (status === "former" && current) return false;
    if (f.role === "none" && e.roles.length > 0) return false;
    if (f.role && f.role !== "none" && !e.roles.includes(f.role)) return false;
    if (f.title && (e.title ?? "") !== f.title) return false;
    if (f.q && !matchesEmployeeSearch(e, f.q)) return false;
    return true;
  });
}

/** 列表排序：在職在前，再依員工編號（無編號在後）、姓名。 */
export function sortEmployees(
  rows: readonly Employee[],
  today: string,
): Employee[] {
  return [...rows].sort((a, b) => {
    const ca = isEmployeeCurrent(a, today) ? 0 : 1;
    const cb = isEmployeeCurrent(b, today) ? 0 : 1;
    if (ca !== cb) return ca - cb;
    const xa = a.code ?? "￿";
    const xb = b.code ?? "￿";
    if (xa !== xb) return xa < xb ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

/** 職務篩選選項（不重複、依筆數多到少）。 */
export function distinctTitles(rows: readonly Employee[]): string[] {
  const count = new Map<string, number>();
  for (const e of rows) {
    if (e.title) count.set(e.title, (count.get(e.title) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
    .map(([t]) => t);
}
