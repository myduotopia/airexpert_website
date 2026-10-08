"use client";
// 報價單用品項欄：可搜尋品項（代碼 / 名稱 / 型號）、保養卡機型，或直接自由輸入。
// - 選品項 → onPickItem(item)；選機型或自由輸入 → onText(text)（item_id 清空，文字存於品項文字，不動品名規格）。
// - 打字即時以 onText 回寫，失焦不需另外確認；鍵盤 ↑↓ Enter Esc 同 Combobox。
// - allowCreate：清單最後多一個「＋ 新增品項『xxx』」，開 Dialog 建立品項主檔後帶入（#218）。
// - 下拉清單以 FloatingList 浮層顯示，不會被明細表的 overflow-x-auto 裁切（#219）。
import { useId, useMemo, useRef, useState } from "react";
import { isImeComposing, quickCreateLabel } from "@/lib/erp/quick-create";
import type { ItemOption } from "@/lib/erp/types";
import { FloatingList, scrollOptionIntoView } from "./FloatingList";
import { QuickCreateItemDialog } from "./QuickCreateItemDialog";
import { useAddedOptions } from "./useAddedOptions";
import { ERP_INPUT } from "./styles";

const MAX_RESULTS = 50;

type Option =
  | { kind: "item"; key: string; item: ItemOption }
  | { kind: "model"; key: string; model: string }
  | { kind: "create"; key: string; query: string };

export function ItemOrTextPicker({
  items,
  models,
  itemId,
  text,
  onPickItem,
  onText,
  disabled,
  allowCreate = false,
  onItemCreated,
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
  /** 允許就地新增品項主檔（#218）。 */
  allowCreate?: boolean;
  /** 就地新增成功後通知父層（同張單其他明細行共用）；帶入仍走 onPickItem。 */
  onItemCreated?: (item: ItemOption) => void;
}) {
  const autoId = useId();
  const listId = `${autoId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // 輸入框元素（FloatingList 的定位基準）；用 callback ref 存 state，render 時可安全讀取。
  const [anchor, setAnchor] = useState<HTMLInputElement | null>(null);
  const [allItems, addItem] = useAddedOptions(items);
  const [createQuery, setCreateQuery] = useState<string | null>(null);
  // 選了「新增」後 Dialog 關閉時焦點會回到輸入框；那次聚焦不要再展開清單。
  const skipFocusOpen = useRef(false);

  const selected = useMemo(
    () => (itemId ? (allItems.find((i) => i.id === itemId) ?? null) : null),
    [allItems, itemId],
  );

  const results = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase();
    const matchedItems = allItems
      .filter(
        (i) =>
          !q ||
          `${i.code} ${i.name} ${i.model ?? ""}`.toLowerCase().includes(q),
      )
      .map((item) => ({ kind: "item" as const, key: `i:${item.id}`, item }));
    const matchedModels = models
      .filter((m) => !q || m.toLowerCase().includes(q))
      .map((model) => ({ kind: "model" as const, key: `m:${model}`, model }));
    const matched: Option[] = [...matchedItems, ...matchedModels].slice(
      0,
      MAX_RESULTS,
    );
    if (allowCreate) {
      matched.push({ kind: "create", key: "__create__", query: query.trim() });
    }
    return matched;
  }, [allItems, models, query, allowCreate]);
  const matchCount = results.filter((o) => o.kind !== "create").length;

  function pick(option: Option) {
    if (option.kind === "item") onPickItem(option.item);
    else if (option.kind === "model") onText(option.model);
    else {
      skipFocusOpen.current = true;
      setCreateQuery(option.query);
    }
    setOpen(false);
  }

  function onFocus() {
    if (skipFocusOpen.current) {
      skipFocusOpen.current = false;
      return;
    }
    // 自由輸入中 → 接著編輯原文字；已選品項 → 清空以便重新搜尋。
    setQuery(selected ? "" : text);
    setHighlight(-1);
    setOpen(true);
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;

  // 鍵盤移動 highlight：同時把該選項捲進清單可視範圍（-1 = 未選任何項，清單未開時找不到選項即略過）。
  function moveHighlight(next: number) {
    setHighlight(next);
    if (open && next >= 0) scrollOptionIntoView(optionId(next));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 輸入法選字中的 Enter／方向鍵交給輸入法。
    if (isImeComposing(e.nativeEvent)) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      moveHighlight(Math.min(highlight + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(Math.max(highlight - 1, -1));
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

  // 已選品項只顯示產品編號（與單據明細頁的「產品編號」欄一致；品名在品名規格欄）。
  const display = open ? query : selected ? selected.code : text;
  const activeId =
    open && !disabled && results[highlight] ? optionId(highlight) : undefined;

  return (
    <div className="relative">
      <input
        ref={setAnchor}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        autoComplete="off"
        value={display}
        placeholder={
          selected && open ? selected.code : "搜尋品項 / 機型，或直接輸入"
        }
        disabled={disabled}
        onMouseDown={() => {
          skipFocusOpen.current = false;
        }}
        onFocus={onFocus}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          skipFocusOpen.current = false;
          setQuery(e.target.value);
          setHighlight(-1);
          setOpen(true);
          onText(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className={ERP_INPUT}
      />
      {open && !disabled && (
        <FloatingList
          anchor={anchor}
          minWidth={260}
          id={listId}
          role="listbox"
          className="border-border rounded-lg border bg-white py-1 shadow-lg"
        >
          {matchCount === 0 && (
            <li className="text-text-muted px-3 py-2 text-[13px]">
              {query.trim()
                ? `查無符合項目，將以「${query.trim()}」自由輸入`
                : "可直接輸入品名"}
            </li>
          )}
          {results.map((o, i) =>
            o.kind === "create" ? (
              <li
                key={o.key}
                id={optionId(i)}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`text-primary-deep border-border cursor-pointer border-t px-3 py-2 text-[14px] font-semibold ${
                  i === highlight ? "bg-surface-muted" : ""
                }`}
              >
                {quickCreateLabel(o.query, "品項")}
              </li>
            ) : (
              <li
                key={o.key}
                id={optionId(i)}
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
            ),
          )}
        </FloatingList>
      )}
      {allowCreate && (
        <QuickCreateItemDialog
          query={createQuery}
          onClose={() => setCreateQuery(null)}
          onCreated={(item) => {
            setCreateQuery(null);
            addItem(item);
            onItemCreated?.(item);
            // 與手動選品項相同：帶入品名規格與單價、清掉品項文字。
            onPickItem(item);
          }}
        />
      )}
    </div>
  );
}
