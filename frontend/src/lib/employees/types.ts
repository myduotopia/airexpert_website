// 員工主檔（issue #223、#257）型別與常數 — client / server 共用。
// 對應 supabase/migrations/0027_employees.sql、0031_employee_hr.sql 的 employees；ERP 與機台維護報告單共用。
// 註：後台「人員管理」（/admin/staff）是登入帳號，與此員工主檔不同；employees.admin_profile_id 保留供日後連結。

export type EmployeeRole = "sales" | "technician" | "office" | "manager";

/** 角色（顯示順序）。與 DB employees_roles_check 一致。 */
export const EMPLOYEE_ROLES: readonly EmployeeRole[] = [
  "sales",
  "technician",
  "office",
  "manager",
];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  sales: "業務",
  technician: "維修師傅",
  office: "內勤／會計",
  manager: "負責人",
};

/** 各角色會出現在哪些選取器（表單提示用）。 */
export const EMPLOYEE_ROLE_USAGE: Record<EmployeeRole, string> = {
  sales: "客戶與單據的「業務」欄",
  technician: "維護報告單的「維護人員」欄",
  office: "目前沒有專用欄位，保留給日後的承辦人欄位",
  manager: "目前沒有專用欄位，保留給日後的簽核人欄位",
};

export function isEmployeeRole(v: unknown): v is EmployeeRole {
  return (
    typeof v === "string" && (EMPLOYEE_ROLES as readonly string[]).includes(v)
  );
}

/** 姓名長度上限（與 DB employees_name_check、維護報告單維護人員 50 字一致）。 */
export const EMPLOYEE_NAME_MAX = 50;
/** 職務、部門、電話長度上限（DB employees_text_len_check）。 */
export const EMPLOYEE_SHORT_TEXT_MAX = 50;
/** 緊急聯絡人（非敏感內容）長度上限（DB employees_text_len_check）。 */
export const EMPLOYEE_CONTACT_MAX = 200;

/** employees 資料列。 */
export interface Employee {
  id: string;
  code: string | null;
  name: string;
  roles: EmployeeRole[];
  active: boolean;
  note: string | null;
  title: string | null;
  department: string | null;
  phone: string | null;
  emergency_contact: string | null;
  /** YYYY-MM-DD */
  hired_on: string | null;
  /** YYYY-MM-DD */
  left_on: string | null;
  /** 保留：連結的後台登入帳號（本次不提供設定 UI）。 */
  admin_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 選取器選項（EmployeePicker）。active 為「實際在職」（含離職日判斷，見 status.ts）。 */
export type EmployeeOption = Pick<
  Employee,
  "id" | "code" | "name" | "roles" | "active"
>;

/** 新增／編輯表單輸入（日期為 YYYY-MM-DD 或空字串）。 */
export interface EmployeeInput {
  code: string;
  name: string;
  roles: EmployeeRole[];
  active: boolean;
  note: string;
  title: string;
  phone: string;
  emergency_contact: string;
  hired_on: string;
  left_on: string;
}

/**
 * 單據／客戶／報告單上的人員欄位：id（employees，可空）＋ 姓名文字快照。
 * 舊資料只有文字（id = null）；選取器照常顯示文字，不會被清空。
 */
export interface EmployeeRef {
  id: string | null;
  name: string | null;
}
