// EmployeePicker（#223）的純邏輯：可選清單（在職 + 角色篩選）與「目前值」的顯示。
// 目前值一律顯示、不會被清空：
//   - id 在可選清單 → 直接選取；
//   - id 不在可選清單（已停用、沒有此角色、讀不到）→ 以單據上的文字快照另列一項並選取；
//   - 只有文字（舊資料）→ 主檔有同名（不分空白／大小寫）就顯示為該員工，否則列為「舊資料」項。
// client（EmployeePicker）與測試共用；不可 import server-only 模組。
import { cleanEmployeeName, employeeNameKey } from "./normalize";
import type { EmployeeOption, EmployeeRef, EmployeeRole } from "./types";

/** 舊資料（只有文字）選項的 id 前綴；不會寫入 DB。 */
export const LEGACY_OPTION_PREFIX = "legacy:";

export interface EmployeePickerOption extends EmployeeOption {
  /** 舊資料：只有文字、主檔找不到同名員工。 */
  legacy?: boolean;
  /** 目前值但不在可選清單（已停用、沒有此角色或讀不到）。 */
  offList?: boolean;
}

export interface EmployeePickerModel {
  options: EmployeePickerOption[];
  /** Combobox 的 value（可能是舊資料選項的 id）。 */
  selectedId: string | null;
}

export function employeePickerModel(
  options: readonly EmployeeOption[],
  value: EmployeeRef,
  role?: EmployeeRole,
): EmployeePickerModel {
  const available: EmployeePickerOption[] = options.filter(
    (o) => o.active && (!role || o.roles.includes(role)),
  );
  const text = cleanEmployeeName(value.name);

  if (value.id) {
    if (available.some((o) => o.id === value.id)) {
      return { options: available, selectedId: value.id };
    }
    const known = options.find((o) => o.id === value.id);
    const current: EmployeePickerOption = {
      id: value.id,
      code: known?.code ?? null,
      name: text || known?.name || "（查無此員工）",
      roles: known?.roles ?? [],
      active: known?.active ?? false,
      offList: true,
    };
    return { options: [current, ...available], selectedId: value.id };
  }

  if (!text) return { options: available, selectedId: null };

  const key = employeeNameKey(text);
  const match = options.find((o) => employeeNameKey(o.name) === key);
  if (match) {
    if (available.some((o) => o.id === match.id)) {
      return { options: available, selectedId: match.id };
    }
    return {
      options: [{ ...match, offList: true }, ...available],
      selectedId: match.id,
    };
  }

  const legacy: EmployeePickerOption = {
    id: `${LEGACY_OPTION_PREFIX}${key}`,
    code: null,
    name: text,
    roles: [],
    active: false,
    legacy: true,
  };
  return { options: [legacy, ...available], selectedId: legacy.id };
}

/**
 * Combobox 選取結果 → 人員欄位。
 * 選到「舊資料」或「不在清單的目前值」→ 原值不變（保留文字快照）；清除 → 兩者皆空。
 */
export function employeeRefFromOption(
  option: EmployeePickerOption | null,
  current: EmployeeRef,
): EmployeeRef {
  if (!option) return { id: null, name: null };
  if (option.legacy || option.offList) return current;
  return { id: option.id, name: option.name };
}
