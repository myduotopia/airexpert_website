"use client";
// ERP 通用單選 combobox：輸入文字即時過濾 options（client 端搜尋），鍵盤 ↑↓ Enter Esc。
// 受控：value = 選中項目 id（null = 未選）。傳 name 時另輸出 hidden input 供 <form> 送出。
// 各 Picker（品項 / 客戶 / 廠商）為此元件的薄包裝。
// 傳 onCreate 時，清單最後（含查無結果）多一個「＋ 新增『查詢字』」項（建單時就地新增，#218）。
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  comboboxEntries,
  filterComboboxOptions,
  quickCreateLabel,
} from "@/lib/erp/quick-create";
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
  /** 傳入時清單最後顯示「＋ 新增」項；選取時以目前查詢字（已去頭尾空白）呼叫。 */
  onCreate?: (query: string) => void;
  /** 新增項的文字；預設「＋ 新增『xxx』」／查詢空白時「＋ 新增…」。 */
  createLabel?: (query: string) => ReactNode;
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
  onCreate,
  createLabel = quickCreateLabel,
}: ComboboxProps<T>) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // 選了「新增」後 Dialog 關閉時，瀏覽器會把焦點還給輸入框；那次聚焦不要再展開清單。
  const skipFocusOpen = useRef(false);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const results = useMemo(
    () =>
      filterComboboxOptions(
        options,
        query,
        getSearchText ?? getLabel,
        MAX_RESULTS,
      ),
    [options, query, getLabel, getSearchText],
  );
  const entries = useMemo(
    () => comboboxEntries(results, query, !!onCreate),
    [results, query, onCreate],
  );

  function pick(option: T | null) {
    onChange(option?.id ?? null, option);
    setOpen(false);
    setQuery("");
  }

  function create(q: string) {
    setOpen(false);
    setQuery("");
    skipFocusOpen.current = true;
    onCreate?.(q);
  }

  function choose(index: number) {
    const entry = entries[index];
    if (!entry) return;
    if (entry.kind === "create") create(entry.query);
    else pick(entry.option);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && entries[highlight]) {
        e.preventDefault();
        choose(highlight);
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
        onMouseDown={() => {
          skipFocusOpen.current = false;
        }}
        onFocus={() => {
          if (skipFocusOpen.current) {
            skipFocusOpen.current = false;
            return;
          }
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          skipFocusOpen.current = false;
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
          {results.length === 0 && (
            <li className="text-text-muted px-3 py-2 text-[13px]">
              查無符合項目
            </li>
          )}
          {entries.map((entry, i) =>
            entry.kind === "option" ? (
              <li
                key={entry.option.id}
                role="option"
                aria-selected={entry.option.id === value}
                // mousedown 先於 input blur，才點得到選項。
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(entry.option);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`cursor-pointer px-3 py-2 text-[14px] ${
                  i === highlight ? "bg-surface-muted" : ""
                } ${entry.option.id === value ? "text-primary-deep font-semibold" : "text-ink"}`}
              >
                {renderOption
                  ? renderOption(entry.option)
                  : getLabel(entry.option)}
              </li>
            ) : (
              <li
                key="__create__"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  create(entry.query);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`text-primary-deep border-border cursor-pointer border-t px-3 py-2 text-[14px] font-semibold ${
                  i === highlight ? "bg-surface-muted" : ""
                }`}
              >
                {createLabel(entry.query)}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
