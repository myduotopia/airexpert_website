// 員工在職狀態（#257）— client / server / 測試共用的純函式。
// DB 觸發器 employees_left_on_active 只在「寫入當下」把離職日 ≤ 今天的員工設為停用；
// 預定離職日（未來）到期後 DB 不會自動改，故選取器與列表一律以 isEmployeeCurrent 判斷「實際在職」。

/** 台灣時間的今天（YYYY-MM-DD）。與 DB (now() at time zone 'Asia/Taipei')::date 一致。 */
export function taipeiToday(now: Date = new Date()): string {
  // en-CA 的日期格式即 YYYY-MM-DD。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface EmployeeStatusFields {
  active: boolean;
  left_on?: string | null;
}

/** 離職日已到（≤ 今天）。 */
export function hasLeft(e: EmployeeStatusFields, today: string): boolean {
  return !!e.left_on && e.left_on <= today;
}

/** 實際在職：active 且未到離職日。 */
export function isEmployeeCurrent(
  e: EmployeeStatusFields,
  today: string,
): boolean {
  return e.active && !hasLeft(e, today);
}

export type EmployeeStatus = "active" | "leaving" | "left" | "inactive";

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "在職",
  leaving: "預定離職",
  left: "離職",
  inactive: "停用",
};

/**
 * 顯示用狀態：
 *   left     — 離職日 ≤ 今天（不論 active）
 *   inactive — 已停用但沒有離職日
 *   leaving  — 在職、離職日在未來
 *   active   — 在職
 */
export function employeeStatus(
  e: EmployeeStatusFields,
  today: string,
): EmployeeStatus {
  if (hasLeft(e, today)) return "left";
  if (!e.active) return "inactive";
  if (e.left_on) return "leaving";
  return "active";
}
