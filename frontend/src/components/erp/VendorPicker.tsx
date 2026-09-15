"use client";
// 廠商選擇（代碼 / 名稱 / 統編搜尋）。options 由 server 以 listVendorOptions() 讀出傳入。
import type { VendorOption } from "@/lib/erp/types";
import { Combobox } from "./Combobox";

export function VendorPicker({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "搜尋廠商代碼 / 名稱 / 統編",
  disabled,
  required,
  "aria-label": ariaLabel = "廠商",
}: {
  options: VendorOption[];
  value: string | null;
  onChange: (id: string | null, vendor: VendorOption | null) => void;
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
      getLabel={(o) => `${o.code} ${o.name}`}
      getSearchText={(o) => `${o.code} ${o.name} ${o.tax_id ?? ""}`}
      renderOption={(o) => (
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">
            <span className="font-mono text-[13px]">{o.code}</span> {o.name}
          </span>
          {o.currency !== "TWD" && (
            <span className="text-text-muted shrink-0 text-[12px]">
              {o.currency}
            </span>
          )}
        </span>
      )}
    />
  );
}
