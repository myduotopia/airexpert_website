"use client";
// 客戶選擇（編號 / 名稱 / 統編搜尋）。options 由 server 以 listCustomerOptions() 讀出傳入。
import type { CustomerOption } from "@/lib/erp/types";
import { Combobox } from "./Combobox";

export function CustomerPicker({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "搜尋客戶編號 / 名稱 / 統編",
  disabled,
  required,
  "aria-label": ariaLabel = "客戶",
}: {
  options: CustomerOption[];
  value: string | null;
  onChange: (id: string | null, customer: CustomerOption | null) => void;
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}) {
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      name={name}
      id={id}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      getLabel={(o) => (o.code ? `${o.code} ${o.name}` : o.name)}
      getSearchText={(o) => `${o.code ?? ""} ${o.name} ${o.tax_id ?? ""}`}
      renderOption={(o) => (
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">
            {o.code && <span className="font-mono text-[13px]">{o.code} </span>}
            {o.name}
          </span>
          {o.tax_id && (
            <span className="text-text-muted shrink-0 text-[12px]">
              {o.tax_id}
            </span>
          )}
        </span>
      )}
    />
  );
}
