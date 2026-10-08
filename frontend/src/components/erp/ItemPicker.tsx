"use client";
// 品項選擇（代碼 / 名稱 / 型號搜尋）。options 由 server 以 listItemOptions() 讀出傳入。
// allowCreate：找不到時可就地新增品項（#218）；同張單多行共用時由父層以 onOptionCreated 收集。
import { useState } from "react";
import type { ItemOption } from "@/lib/erp/types";
import { Combobox } from "./Combobox";
import { QuickCreateItemDialog } from "./QuickCreateItemDialog";
import { useAddedOptions } from "./useAddedOptions";

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
  allowCreate = false,
  onOptionCreated,
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
  /** 允許就地新增（#218）：清單最後出現「＋ 新增『xxx』」，開 Dialog 建檔後自動選取。 */
  allowCreate?: boolean;
  /** 就地新增成功後通知父層（多個選取器需共用新項目時用）；選取仍走 onChange。 */
  onOptionCreated?: (item: ItemOption) => void;
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
      {allowCreate && (
        <QuickCreateItemDialog
          query={createQuery}
          onClose={() => setCreateQuery(null)}
          onCreated={(item) => {
            setCreateQuery(null);
            addOption(item);
            onOptionCreated?.(item);
            // 與手動選取相同的 onChange 流程（例如帶入業務、幣別、品名單價）。
            onChange(item.id, item);
          }}
        />
      )}
    </>
  );
}
