"use client";
// 員工選擇（業務／維修師傅，#223）：Combobox 薄包裝。
// - value 為「id + 姓名文字快照」：舊資料只有文字（id = null）時照常顯示、不會被清空；
//   已停用或沒有此角色的目前值也照常顯示（見 lib/employees/picker.ts）。
// - role：只列在職且有此角色的員工；就地新增時預設勾選此角色。
// - allowCreate：找不到時「＋ 新增『xxx』」→ Dialog 建檔後自動選取（沿用 #218 模式）。
import { useMemo, useState } from "react";
import { EMPLOYEE_ROLE_LABELS } from "@/lib/employees/types";
import type {
  EmployeeOption,
  EmployeeRef,
  EmployeeRole,
} from "@/lib/employees/types";
import {
  employeePickerModel,
  employeeRefFromOption,
} from "@/lib/employees/picker";
import { quickCreateLabel } from "@/lib/erp/quick-create";
import { Combobox } from "./Combobox";
import { QuickCreateEmployeeDialog } from "./QuickCreateEmployeeDialog";
import { useAddedOptions } from "./useAddedOptions";

export function EmployeePicker({
  options,
  value,
  onChange,
  role,
  id,
  placeholder,
  disabled,
  allowCreate = false,
  onOptionCreated,
  "aria-label": ariaLabel,
}: {
  options: EmployeeOption[];
  value: EmployeeRef;
  onChange: (next: EmployeeRef) => void;
  role?: EmployeeRole;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 允許就地新增員工。 */
  allowCreate?: boolean;
  /** 就地新增成功後通知父層（同頁多個選取器共用新員工時用）；選取仍走 onChange。 */
  onOptionCreated?: (employee: EmployeeOption) => void;
  "aria-label"?: string;
}) {
  const [allOptions, addOption] = useAddedOptions(options);
  const [createQuery, setCreateQuery] = useState<string | null>(null);
  const model = useMemo(
    () => employeePickerModel(allOptions, value, role),
    [allOptions, value, role],
  );
  const noun = role ? EMPLOYEE_ROLE_LABELS[role] : "員工";

  return (
    <>
      <Combobox
        options={model.options}
        value={model.selectedId}
        onChange={(_, option) => onChange(employeeRefFromOption(option, value))}
        id={id}
        placeholder={placeholder ?? `搜尋${noun}姓名 / 代號`}
        disabled={disabled}
        aria-label={ariaLabel ?? noun}
        onCreate={allowCreate ? setCreateQuery : undefined}
        createLabel={(q) => quickCreateLabel(q, noun)}
        getLabel={(o) => o.name}
        getSearchText={(o) => `${o.code ?? ""} ${o.name}`}
        renderOption={(o) => (
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              {o.code && (
                <span className="font-mono text-[13px]">{o.code} </span>
              )}
              {o.name}
            </span>
            {o.legacy ? (
              <span className="text-text-muted shrink-0 text-[12px]">
                舊資料（未建檔）
              </span>
            ) : o.offList ? (
              <span className="text-text-muted shrink-0 text-[12px]">
                {o.active ? `非${noun}` : "已停用"}
              </span>
            ) : null}
          </span>
        )}
      />
      {allowCreate && (
        <QuickCreateEmployeeDialog
          query={createQuery}
          role={role}
          onClose={() => setCreateQuery(null)}
          onCreated={(employee) => {
            setCreateQuery(null);
            addOption(employee);
            onOptionCreated?.(employee);
            onChange({ id: employee.id, name: employee.name });
          }}
        />
      )}
    </>
  );
}
