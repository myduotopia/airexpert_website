// 員工主檔（業務／維修師傅，issue #223）型別與常數 — client / server 共用。
// 對應 supabase/migrations/0027_employees.sql 的 employees；ERP 與機台維護報告單共用。
// 註：後台「人員管理」（/admin/staff）是登入帳號，與此員工主檔無關。

export type EmployeeRole = "sales" | "technician";

/** 角色（顯示順序）。 */
export const EMPLOYEE_ROLES: readonly EmployeeRole[] = ["sales", "technician"];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> = {
  sales: "業務",
  technician: "維修師傅",
};

/** 姓名長度上限（與 DB employees_name_check、維護報告單維護人員 50 字一致）。 */
export const EMPLOYEE_NAME_MAX = 50;

/** employees 資料列。 */
export interface Employee {
  id: string;
  code: string | null;
  name: string;
  roles: EmployeeRole[];
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** 選取器選項（EmployeePicker）。 */
export type EmployeeOption = Pick<
  Employee,
  "id" | "code" | "name" | "roles" | "active"
>;

/** 新增／編輯表單輸入。 */
export interface EmployeeInput {
  code: string;
  name: string;
  roles: EmployeeRole[];
  active: boolean;
  note: string;
}

/**
 * 單據／客戶／報告單上的人員欄位：id（employees，可空）＋ 姓名文字快照。
 * 舊資料只有文字（id = null）；選取器照常顯示文字，不會被清空。
 */
export interface EmployeeRef {
  id: string | null;
  name: string | null;
}
