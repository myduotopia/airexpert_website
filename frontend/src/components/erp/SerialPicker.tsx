"use client";
// 既有機號多選（S 出庫、SR 退回、PR 退廠、T 調撥、A 盤虧）。
// options 由 server 以 listAvailableSerials() 讀出傳入；client 端搜尋 + 勾選。
// 已選但不在 options 內的機號（例：草稿選好後狀態已變）仍列出並標示，方便取消。
import { useMemo, useState } from "react";
import type { SerialOption } from "@/lib/erp/types";
import { ERP_INPUT } from "./styles";

export function SerialPicker({
  options,
  value,
  onChange,
  max,
  disabled,
  name,
  "aria-label": ariaLabel = "機號",
}: {
  options: SerialOption[];
  /** 已選 erp_serials.id。 */
  value: string[];
  onChange: (ids: string[]) => void;
  /** 最多可選幾台（通常 = 數量）；未指定不限。 */
  max?: number;
  disabled?: boolean;
  /** 傳入時每個已選 id 輸出一個 hidden input（同名多值）。 */
  name?: string;
  "aria-label"?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const known = useMemo(() => new Set(options.map((o) => o.id)), [options]);
  const missing = value.filter((id) => !known.has(id));

  const q = query.trim().toLowerCase();
  const visible = q
    ? options.filter((o) => o.serial_no.toLowerCase().includes(q))
    : options;
  const full = max !== undefined && value.length >= max;

  function toggle(id: string) {
    if (selected.has(id)) onChange(value.filter((v) => v !== id));
    else if (!full) onChange([...value, id]);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="border-border rounded-lg border bg-white p-2"
    >
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋機號"
          aria-label="搜尋機號"
          disabled={disabled}
          className={`${ERP_INPUT} h-9`}
        />
        <span className="text-text-muted shrink-0 text-[12px] tabular-nums">
          已選 {value.length}
          {max !== undefined ? ` / ${max}` : ""}
        </span>
      </div>
      {options.length === 0 && missing.length === 0 ? (
        <p className="text-text-muted px-1 py-1 text-[13px]">無可選機號</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {missing.map((id) => (
            <li key={id}>
              <label className="flex items-center gap-2 rounded px-1 py-1 text-[13px] text-amber-700">
                <input
                  type="checkbox"
                  checked
                  disabled={disabled}
                  onChange={() => toggle(id)}
                />
                已選機號目前不可用（請取消後重選）
              </label>
            </li>
          ))}
          {visible.map((o) => {
            const checked = selected.has(o.id);
            return (
              <li key={o.id}>
                <label
                  className={`hover:bg-surface-muted flex items-center gap-2 rounded px-1 py-1 text-[13px] ${
                    !checked && full ? "text-text-muted" : "text-ink"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || (!checked && full)}
                    onChange={() => toggle(o.id)}
                  />
                  <span className="font-mono">{o.serial_no}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {name &&
        value.map((id) => (
          <input key={id} type="hidden" name={name} value={id} />
        ))}
    </div>
  );
}
