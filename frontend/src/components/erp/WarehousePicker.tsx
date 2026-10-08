"use client";
// 倉庫選擇（倉庫數量少，用原生 select）。options 由 server 以 listWarehouseOptions() 讀出傳入。
// allowCreate：選單最後多一個「＋ 新增倉庫…」，開 Dialog 建檔後自動選取（#218）。
import { useState } from "react";
import { quickCreateLabel } from "@/lib/erp/quick-create";
import type { WarehouseOption } from "@/lib/erp/types";
import { QuickCreateWarehouseDialog } from "./QuickCreateWarehouseDialog";
import { useAddedOptions } from "./useAddedOptions";
import { ERP_SELECT } from "./styles";

/** 「新增倉庫」選項的 value（不會成為受控值：選到時只開 Dialog）。 */
const CREATE_VALUE = "__create__";

export function WarehousePicker({
  options,
  value,
  onChange,
  name,
  id,
  disabled,
  required,
  placeholder = "請選擇倉庫",
  excludeId,
  allowCreate = false,
  onOptionCreated,
  "aria-label": ariaLabel = "倉庫",
}: {
  options: WarehouseOption[];
  value: string | null;
  onChange: (id: string | null, warehouse: WarehouseOption | null) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** 排除某倉（調撥單目的倉不可等於來源倉）。 */
  excludeId?: string | null;
  "aria-label"?: string;
  /** 允許就地新增倉庫（#218）。 */
  allowCreate?: boolean;
  /** 就地新增成功後通知父層（調撥單來源倉／目的倉共用新倉時用）；選取仍走 onChange。 */
  onOptionCreated?: (warehouse: WarehouseOption) => void;
}) {
  const [allOptions, addOption] = useAddedOptions(options);
  const [creating, setCreating] = useState(false);
  const list = excludeId
    ? allOptions.filter((o) => o.id !== excludeId)
    : allOptions;
  return (
    <>
      <select
        id={id}
        name={name}
        aria-label={ariaLabel}
        value={value ?? ""}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          // 受控 select：選到「新增」時不呼叫 onChange，React 會把顯示值還原為原本的 value。
          if (allowCreate && e.target.value === CREATE_VALUE) {
            setCreating(true);
            return;
          }
          const next = allOptions.find((o) => o.id === e.target.value) ?? null;
          onChange(next?.id ?? null, next);
        }}
        className={ERP_SELECT}
      >
        <option value="">{placeholder}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code} {o.name}
            {o.is_default ? "（預設）" : ""}
          </option>
        ))}
        {allowCreate && (
          <option value={CREATE_VALUE}>{quickCreateLabel("", "倉庫")}</option>
        )}
      </select>
      {allowCreate && (
        <QuickCreateWarehouseDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(warehouse) => {
            setCreating(false);
            addOption(warehouse);
            onOptionCreated?.(warehouse);
            onChange(warehouse.id, warehouse);
          }}
        />
      )}
    </>
  );
}
