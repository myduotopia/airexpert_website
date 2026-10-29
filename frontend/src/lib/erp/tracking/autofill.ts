// 週報追蹤表單（#272）的「自動帶入」規則。純函式（client 表單用、可單元測試）。
//
// 選了來源單據／機台後要帶入機器設備、機型、交機日期等欄位，但不可蓋掉使用者自己填的值：
//   · 目前值空白，或仍等於「上一次自動帶入的值」（使用者沒改過）→ 換成新值；
//     新來源沒有值時，清掉上一次自動帶入的舊值（避免留著別張單據／別台機器的資料）；
//   · 使用者改過（與上一次自動帶入不同、且不空白）→ 保留。
import type { EmployeeRef } from "@/lib/employees/types";

export function autofill(
  current: string,
  prevAuto: string | null,
  next: string | null | undefined,
): string {
  const blank = current.trim() === "";
  const untouched = blank || (prevAuto !== null && current === prevAuto);
  if (!untouched) return current;
  if (next) return next;
  return blank ? current : "";
}

/**
 * 員工（負責業務）自動帶入：目前未指定、或仍是上一次自動帶入的那位 → 換成新來源的員工；
 * 新來源沒有員工時保留目前值（不清除）。
 */
export function autofillEmployee(
  current: EmployeeRef,
  prevAutoId: string | null,
  next: EmployeeRef | null,
): EmployeeRef {
  if (!next?.id) return current;
  const unset = !current.id && !current.name?.trim();
  const untouched = unset || (prevAutoId !== null && current.id === prevAutoId);
  return untouched ? next : current;
}
