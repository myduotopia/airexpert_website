"use client";
// 報價單用品項欄：可搜尋品項（代碼 / 名稱 / 型號）、保養卡機型，或直接自由輸入。
// - 選品項 → onPickItem(item)；選機型或自由輸入 → onText(text)（item_id 清空，文字存於品項文字，不動品名規格）。
// - 打字即時以 onText 回寫，失焦不需另外確認；鍵盤 ↑↓ Enter Esc 同 Combobox。
import { useId, useMemo, useState } from "react";
import type { ItemOption } from "@/lib/erp/types";
import { ERP_INPUT } from "./styles";

const MAX_RESULTS = 50;

type Option =
  | { kind: "item"; key: string; item: ItemOption }
  | { kind: "model"; key: string; model: string };

export function ItemOrTextPicker({
  items,
  models,
  itemId,
  text,
  onPickItem,
  onText,
  disabled,
  "aria-label": ariaLabel = "品項",
}: {
  items: ItemOption[];
  /** 保養卡 / 維護報告單上的機型。 */
  models: string[];
  itemId: string | null;
  /** 未選品項時顯示的自由輸入文字（品項文字）。 */
  text: string;
  onPickItem: (item: ItemOption) => void;
  onText: (text: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => (itemId ? (items.find((i) => i.id === itemId) ?? null) : null),
    [items, itemId],
  );

  const results = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedItems = items
      .filter(
        (i) =>
          !q ||
          `${i.code} ${i.name} ${i.model ?? ""}`.toLowerCase().includes(q),
      )
      .map((item) => ({ kind: "item" as const, key: `i:${item.id}`, item }));
    const matchedModels = models
      .filter((m) => !q || m.toLowerCase().includes(q))
      .map((model) => ({ kind: "model" as const, key: `m:${model}`, model }));
    return [...matchedItems, ...matchedModels].slice(0, MAX_RESULTS);
  }, [items, models, query]);

  function pick(option: Option) {
    if (option.kind === "item") onPickItem(option.item);
    else onText(option.model);
    setOpen(false);
  }

  function onFocus() {
    // 自由輸入中 → 接著編輯原文字；已選品項 → 清空以便重新搜尋。
    setQuery(selected ? "" : text);
    setHighlight(-1);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (results[highlight]) pick(results[highlight]);
        else setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const display = open
    ? query
    : selected
      ? `${selected.code} ${selected.name}`
      : text;

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={display}
        placeholder={
          selected && open
            ? `${selected.code} ${selected.name}`
            : "搜尋品項 / 機型，或直接輸入"
        }
        disabled={disabled}
        onFocus={onFocus}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(-1);
          setOpen(true);
          onText(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={ERP_INPUT}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="border-border absolute z-30 mt-1 max-h-72 w-full min-w-[260px] overflow-y-auto rounded-lg border bg-white py-1 shadow-lg"
        >
          {results.length === 0 ? (
            <li className="text-text-muted px-3 py-2 text-[13px]">
              {query.trim()
                ? `查無符合項目，將以「${query.trim()}」自由輸入`
                : "可直接輸入品名"}
            </li>
          ) : (
            results.map((o, i) => (
              <li
                key={o.key}
                role="option"
                aria-selected={o.kind === "item" && o.item.id === itemId}
                // mousedown 先於 input blur，才點得到選項。
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`text-ink cursor-pointer px-3 py-2 text-[14px] ${
                  i === highlight ? "bg-surface-muted" : ""
                }`}
              >
                {o.kind === "item" ? (
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="font-mono text-[13px]">
                        {o.item.code}
                      </span>{" "}
                      {o.item.name}
                    </span>
                    <span className="text-text-muted shrink-0 text-[12px]">
                      品項
                    </span>
                  </span>
                ) : (
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{o.model}</span>
                    <span className="text-text-muted shrink-0 text-[12px]">
                      保養卡機型
                    </span>
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
