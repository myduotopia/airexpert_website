"use client";
// 品項選擇（代碼 / 名稱 / 型號搜尋）。options 由 server 以 listItemOptions() 讀出傳入。
import type { ItemOption } from "@/lib/erp/types";
import { Combobox } from "./Combobox";

const KIND_LABEL: Record<ItemOption["kind"], string> = {
  machine: "整機",
  part: "零件耗材",
  service: "服務",
  expense: "費用",
};

export function ItemPicker({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "搜尋品項代碼 / 名稱",
  disabled,
  required,
  "aria-label": ariaLabel = "品項",
}: {
  options: ItemOption[];
  value: string | null;
  onChange: (id: string | null, item: ItemOption | null) => void;
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
      getSearchText={(o) => `${o.code} ${o.name} ${o.model ?? ""}`}
      renderOption={(o) => (
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">
            <span className="font-mono text-[13px]">{o.code}</span> {o.name}
          </span>
          <span className="text-text-muted shrink-0 text-[12px]">
            {KIND_LABEL[o.kind]}
            {o.track_serial ? "・機號" : ""}
          </span>
        </span>
      )}
    />
  );
}
