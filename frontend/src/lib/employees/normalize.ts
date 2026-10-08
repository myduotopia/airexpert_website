// 員工主檔的純邏輯：姓名正規化、表單輸入驗證、寫入錯誤訊息、人員欄位（id + 文字快照）整理。
// client / server / 測試共用；不可 import server-only 模組。
import {
  EMPLOYEE_NAME_MAX,
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  type Employee,
  type EmployeeInput,
  type EmployeeRole,
} from "./types";

/**
 * 顯示用姓名：連續空白（含全形空白）併為一個半形空白、去頭尾空白。
 * 與 DB employee_clean_name() 一致。
 */
export function cleanEmployeeName(v: string | null | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 比對用姓名 key：cleanEmployeeName 再轉小寫。與 DB employee_name_key()（員工姓名唯一索引）一致——
 * 「王小明」「 王小明 」「Amy  Wu」「amy wu」各自視為同一人，報表不會因空白／大小寫拆成兩筆。
 */
export function employeeNameKey(v: string | null | undefined): string {
  return cleanEmployeeName(v).toLowerCase();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEmployeeId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * 人員欄位寫入 DB 前整理（客戶業務、單據業務、報告單維護人員）：
 * - 文字去頭尾空白（空白 → null），沒有文字就沒有 id（不留孤立的關聯）；
 * - id 必須是 UUID，否則視為未關聯（舊資料只有文字）。
 */
export function normalizeEmployeeRef(
  name: string | null | undefined,
  id: string | null | undefined,
): { name: string | null; id: string | null } {
  const text = (name ?? "").trim();
  if (!text) return { name: null, id: null };
  return { name: text, id: isEmployeeId(id) ? id : null };
}

export function emptyEmployeeInput(
  patch: Partial<EmployeeInput> = {},
): EmployeeInput {
  return {
    code: "",
    name: "",
    roles: [],
    active: true,
    note: "",
    ...patch,
  };
}

/** DB 資料列 → 編輯表單初始值。 */
export function employeeInputFromRow(e: Employee): EmployeeInput {
  return {
    code: e.code ?? "",
    name: e.name,
    roles: [...e.roles],
    active: e.active,
    note: e.note ?? "",
  };
}

export type EmployeeRow = Omit<Employee, "id" | "created_at" | "updated_at">;

/** 表單輸入驗證 + 正規化（server action 用；角色依固定順序去重）。 */
export function normalizeEmployeeInput(
  input: EmployeeInput,
): { ok: true; row: EmployeeRow } | { ok: false; error: string } {
  const name = cleanEmployeeName(input.name);
  if (!name) return { ok: false, error: "請填寫姓名。" };
  if (name.length > EMPLOYEE_NAME_MAX) {
    return { ok: false, error: `姓名不可超過 ${EMPLOYEE_NAME_MAX} 字。` };
  }
  const picked = new Set(input.roles ?? []);
  const roles = EMPLOYEE_ROLES.filter((r) => picked.has(r));
  if (roles.length === 0) {
    return {
      ok: false,
      error: `請至少勾選一個角色（${EMPLOYEE_ROLES.map((r) => EMPLOYEE_ROLE_LABELS[r]).join("／")}）。`,
    };
  }
  const code = (input.code ?? "").trim();
  const note = (input.note ?? "").trim();
  return {
    ok: true,
    row: {
      code: code || null,
      name,
      roles,
      active: input.active !== false,
      note: note || null,
    },
  };
}

type DbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

export const EMPLOYEE_NAME_TAKEN_MESSAGE =
  "已有同名員工（姓名不分大小寫與空白），請確認是否為同一人；若停用中可到員工主檔重新啟用。";
export const EMPLOYEE_CODE_TAKEN_MESSAGE = "員工代號已存在，請改用其他代號。";
export const EMPLOYEE_IN_USE_MESSAGE =
  "此員工已被客戶、單據或維護報告單使用，無法刪除，請改為停用。";

/** employees 寫入錯誤 → 中文訊息（唯一索引、外鍵、check、權限）。 */
export function employeeWriteError(err: DbError | null | undefined): string {
  const code = err?.code ?? "";
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;
  if (code === "23505") {
    if (text.includes("code_key") || text.includes("btrim(code)")) {
      return EMPLOYEE_CODE_TAKEN_MESSAGE;
    }
    return EMPLOYEE_NAME_TAKEN_MESSAGE;
  }
  if (code === "23503") return EMPLOYEE_IN_USE_MESSAGE;
  if (code === "23514") {
    return `員工資料不符規則（姓名必填且不超過 ${EMPLOYEE_NAME_MAX} 字、至少一個角色）。`;
  }
  if (code === "42501") return "沒有權限維護員工主檔。";
  const msg = err?.message?.trim();
  return msg ? `儲存失敗：${msg}` : "儲存失敗，請稍後再試。";
}

/** 角色顯示文字（「業務、維修師傅」）。 */
export function employeeRolesText(roles: readonly EmployeeRole[]): string {
  return EMPLOYEE_ROLES.filter((r) => roles.includes(r))
    .map((r) => EMPLOYEE_ROLE_LABELS[r])
    .join("、");
}
