"use client";
// 倉庫選擇（倉庫數量少，用原生 select）。options 由 server 以 listWarehouseOptions() 讀出傳入。
import type { WarehouseOption } from "@/lib/erp/types";
import { ERP_SELECT } from "./styles";

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
}) {
  const list = excludeId ? options.filter((o) => o.id !== excludeId) : options;
  return (
    <select
      id={id}
      name={name}
      aria-label={ariaLabel}
      value={value ?? ""}
      disabled={disabled}
      required={required}
      onChange={(e) => {
        const next = options.find((o) => o.id === e.target.value) ?? null;
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
    </select>
  );
}
