"use client";
// ERP 通用單選 combobox：輸入文字即時過濾 options（client 端搜尋），鍵盤 ↑↓ Enter Esc。
// 受控：value = 選中項目 id（null = 未選）。傳 name 時另輸出 hidden input 供 <form> 送出。
// 各 Picker（品項 / 客戶 / 廠商）為此元件的薄包裝。
import { useId, useMemo, useState, type ReactNode } from "react";
import { ERP_INPUT } from "./styles";

/** 最多顯示幾筆（避免上千筆選項時渲染過慢；使用者可再輸入縮小範圍）。 */
const MAX_RESULTS = 50;

export interface ComboboxProps<T extends { id: string }> {
  options: T[];
  value: string | null;
  onChange: (id: string | null, option: T | null) => void;
  /** 選中後輸入框顯示的文字。 */
  getLabel: (option: T) => string;
  /** 供搜尋比對的文字（不分大小寫）；預設 = getLabel。 */
  getSearchText?: (option: T) => string;
  /** 下拉列的內容；預設 = getLabel。 */
  renderOption?: (option: T) => ReactNode;
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  /** 是否顯示清除鈕（預設 true）。 */
  clearable?: boolean;
}

export function Combobox<T extends { id: string }>({
  options,
  value,
  onChange,
  getLabel,
  getSearchText,
  renderOption,
  name,
  id,
  placeholder = "輸入關鍵字搜尋",
  disabled,
  required,
  "aria-label": ariaLabel,
  clearable = true,
}: ComboboxProps<T>) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const text = getSearchText ?? getLabel;
    const matched = q
      ? options.filter((o) => text(o).toLowerCase().includes(q))
      : options;
    return matched.slice(0, MAX_RESULTS);
  }, [options, query, getLabel, getSearchText]);

  function pick(option: T | null) {
    onChange(option?.id ?? null, option);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const display = open ? query : selected ? getLabel(selected) : "";

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={display}
        placeholder={selected && open ? getLabel(selected) : placeholder}
        disabled={disabled}
        required={required && !value}
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={`${ERP_INPUT} ${clearable && value && !disabled ? "pr-8" : ""}`}
      />
      {clearable && value && !disabled && (
        <button
          type="button"
          aria-label="清除"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(null)}
          className="text-text-muted hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 px-1 text-[16px] leading-none"
        >
          ×
        </button>
      )}
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="border-border absolute z-30 mt-1 max-h-72 w-full min-w-[240px] overflow-y-auto rounded-lg border bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="text-text-muted px-3 py-2 text-[13px]">
              查無符合項目
            </li>
          ) : (
            results.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={o.id === value}
                // mousedown 先於 input blur，才點得到選項。
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 text-[14px] ${
                  i === highlight ? "bg-surface-muted" : ""
                } ${o.id === value ? "text-primary-deep font-semibold" : "text-ink"}`}
              >
                {renderOption ? renderOption(o) : getLabel(o)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
