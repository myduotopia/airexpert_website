"use client";
// 廠商選擇（代碼 / 名稱 / 統編搜尋）。options 由 server 以 listVendorOptions() 讀出傳入。
// allowCreate：找不到時可就地新增廠商（#218）。
import { useState } from "react";
import type { VendorOption } from "@/lib/erp/types";
import { Combobox } from "./Combobox";
import { QuickCreateVendorDialog } from "./QuickCreateVendorDialog";
import { useAddedOptions } from "./useAddedOptions";

export function VendorPicker({
  options,
  value,
  onChange,
  name,
  id,
  placeholder = "搜尋廠商代碼 / 名稱 / 統編",
  disabled,
  required,
  allowCreate = false,
  onOptionCreated,
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
  /** 允許就地新增（#218）：清單最後出現「＋ 新增『xxx』」，開 Dialog 建檔後自動選取。 */
  allowCreate?: boolean;
  /** 就地新增成功後通知父層（多個選取器需共用新項目時用）；選取仍走 onChange。 */
  onOptionCreated?: (vendor: VendorOption) => void;
}) {
  // server 傳入的選項 + 本頁就地新增的項目（父層重傳 options 不會洗掉新增項）。
  const [allOptions, addOption] = useAddedOptions(options);
  const [createQuery, setCreateQuery] = useState<string | null>(null);
  return (
    <>
      <Combobox
        options={allOptions}
        value={value}
        onChange={onChange}
        name={name}
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        onCreate={allowCreate ? setCreateQuery : undefined}
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
      {allowCreate && (
        <QuickCreateVendorDialog
          query={createQuery}
          onClose={() => setCreateQuery(null)}
          onCreated={(vendor) => {
            setCreateQuery(null);
            addOption(vendor);
            onOptionCreated?.(vendor);
            // 與手動選取相同的 onChange 流程（例如帶入業務、幣別、品名單價）。
            onChange(vendor.id, vendor);
          }}
        />
      )}
    </>
  );
}
