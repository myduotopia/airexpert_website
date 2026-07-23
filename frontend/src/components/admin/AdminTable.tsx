"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type { ActionResult } from "@/lib/admin/crud";

// 注意：本元件是 client component，故 props 必須可序列化——不能傳「函式」
// （cell renderer / getKey）過界，否則 server→client 會丟
// 「Functions cannot be passed directly to Client Components」而整頁 500。
// 因此由 server component 先把每列 cells 渲染成 ReactNode，再傳進來；
// 排序 / 搜尋所需的原始值另以「可序列化的原始型別」附帶（sortValues / search）。
// 只有 onReorder（"use server" action）允許跨界。
//
// 本元件取代這幾頁的 ReorderableTable / DataTable，同時保留拖移排序，
// 並新增：欄位表頭排序、右上角即時搜尋、10/30 筆分頁。
export type AdminColumn = {
  header: string;
  className?: string;
  // 是否可排序。「操作」/ 空白欄應為 false（預設 false）。
  sortable?: boolean;
};

export type AdminRow = {
  key: string;
  // 與 columns 以索引對齊的預渲染 cells。
  cells: ReactNode[];
  // 與 columns 以索引對齊的排序原始值；只有 sortable 欄位會被讀取。
  sortValues: (string | number | null)[];
  // 預先小寫化、串接好的可搜尋文字。
  search: string;
};

type SortDir = "asc" | "desc";

/**
 * 後台通用資料表（client）。功能：
 * - 表頭點擊排序（asc → desc → 回到手動順序循環）。
 * - 右上角即時搜尋（對 row.search 做 includes）。
 * - 10 / 30 筆分頁。
 * - 可選拖移排序（提供 onReorder 時啟用）。
 *
 * 「手動模式」= 未排序且搜尋為空（sortCol === null && query 為空）。
 * 只有在手動模式、且有 onReorder 時才允許拖移——因為排序 / 過濾後的
 * 視覺順序已非 sort_order，拖移會語意不明。
 */
export function AdminTable({
  rows: initialRows,
  columns,
  onReorder,
  searchPlaceholder = "搜尋…",
  empty = "尚無資料",
}: {
  rows: AdminRow[];
  columns: AdminColumn[];
  onReorder?: (orderedIds: string[]) => Promise<ActionResult>;
  searchPlaceholder?: string;
  empty?: ReactNode;
}) {
  // 本地 rows 供拖移樂觀更新使用（與 ReorderableTable 相同的簽章同步模式）。
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<10 | 30>(10);
  const [page, setPage] = useState(1);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fromIndex = useRef<number | null>(null);
  const router = useRouter();

  // router.refresh() 後 server 重新給 rows；以 key 簽章在 render 期間同步本地狀態
  // （React 官方「prop 變動時調整 state」模式，避免 effect 內 setState）。
  const signature = initialRows.map((r) => r.key).join("|");
  const [syncedSig, setSyncedSig] = useState(signature);
  if (syncedSig !== signature) {
    setSyncedSig(signature);
    setRows(initialRows);
  }

  const trimmed = query.trim().toLowerCase();
  const manualMode = sortCol === null && trimmed === "";
  const dragEnabled = Boolean(onReorder) && manualMode;
  const hasGrip = Boolean(onReorder);

  // ---- 資料管線（每次 render 重算）----
  // 1) 過濾
  const filtered =
    trimmed === "" ? rows : rows.filter((r) => r.search.includes(trimmed));

  // 2) 排序（nulls 恆置底，不受方向影響）
  const sorted =
    sortCol === null
      ? filtered
      : [...filtered].sort((a, b) => {
          const av = a.sortValues[sortCol];
          const bv = b.sortValues[sortCol];
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          let cmp: number;
          if (typeof av === "number" && typeof bv === "number") {
            cmp = av - bv;
          } else {
            cmp = String(av).localeCompare(String(bv), "zh-Hant");
          }
          return sortDir === "asc" ? cmp : -cmp;
        });

  // 3) 分頁（把 page 夾在合法範圍內）
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  // 任何會改變結果集的操作都把頁碼歸 1（在 setter 內同步處理，不用 effect）。
  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handlePageSize(value: 10 | 30) {
    setPageSize(value);
    setPage(1);
  }

  function handleSort(colIndex: number) {
    if (sortCol !== colIndex) {
      setSortCol(colIndex);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      // 第三次點同欄：清除排序，回到手動順序。
      setSortCol(null);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleDrop(localIndex: number) {
    const from = fromIndex.current;
    fromIndex.current = null;
    setDragKey(null);
    setOverKey(null);
    if (!onReorder || !dragEnabled) return;

    // 分頁下 local(page) index 需換算成整份 rows 的 global index。
    // 手動模式時 filtered === rows 且 sorted === filtered，故 global = pageStart + localIndex。
    const fromGlobal = from;
    const toGlobal = pageStart + localIndex;
    if (fromGlobal === null || fromGlobal === toGlobal) return;

    const next = [...rows];
    const [moved] = next.splice(fromGlobal, 1);
    next.splice(toGlobal, 0, moved);
    setRows(next);
    setError(null);

    startTransition(async () => {
      const res = await onReorder(next.map((r) => r.key));
      if (!res.ok) {
        setError(res.error);
        setRows(initialRows);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          排序儲存失敗：{error}
        </p>
      ) : null}

      {/* 工具列：右上角搜尋 + 每頁筆數 */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="text-text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="搜尋"
            className="border-border focus:border-primary h-9 w-52 rounded-lg border pr-3 pl-9 text-[14px] outline-none"
          />
        </div>
        <select
          value={pageSize}
          onChange={(e) => handlePageSize(Number(e.target.value) as 10 | 30)}
          aria-label="每頁筆數"
          className="border-border focus:border-primary h-9 rounded-lg border px-2 text-[14px] outline-none"
        >
          <option value={10}>10 筆/頁</option>
          <option value={30}>30 筆/頁</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
          {trimmed === "" ? empty : `找不到符合「${query.trim()}」的資料`}
        </div>
      ) : (
        <div
          className={`border-border overflow-x-auto rounded-xl border bg-white ${
            pending ? "opacity-60" : ""
          }`}
        >
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-border text-text-muted border-b">
                {hasGrip ? (
                  <th className="w-10 px-2 py-3" aria-label="拖移" />
                ) : null}
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 font-medium ${c.className ?? ""}`}
                    aria-sort={
                      c.sortable && sortCol === i
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(i)}
                        className="focus-visible:ring-primary -mx-1 inline-flex items-center gap-1 rounded px-1 font-medium outline-none focus-visible:ring-2"
                      >
                        <span>{c.header}</span>
                        {sortCol === i ? (
                          sortDir === "asc" ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown
                            size={14}
                            aria-hidden="true"
                            className="text-text-muted/50"
                          />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, localIndex) => (
                <tr
                  key={row.key}
                  onDragEnter={() =>
                    dragEnabled ? setOverKey(row.key) : undefined
                  }
                  onDragOver={(e) => {
                    if (dragEnabled) e.preventDefault();
                  }}
                  onDrop={() =>
                    dragEnabled ? handleDrop(localIndex) : undefined
                  }
                  className={`border-border border-b last:border-b-0 ${
                    dragKey === row.key
                      ? "opacity-40"
                      : overKey === row.key
                        ? "bg-primary/5"
                        : "hover:bg-surface-muted"
                  }`}
                >
                  {hasGrip ? (
                    // 只有把手可拖移，避免誤拖整列 / 干擾欄內連結與刪除鈕。
                    // 非手動模式時把手停用並轉灰（排序 / 搜尋後拖移語意不明）。
                    <td
                      draggable={dragEnabled}
                      onDragStart={() => {
                        if (!dragEnabled) return;
                        fromIndex.current = pageStart + localIndex;
                        setDragKey(row.key);
                      }}
                      onDragEnd={() => {
                        fromIndex.current = null;
                        setDragKey(null);
                        setOverKey(null);
                      }}
                      aria-label={
                        dragEnabled ? "拖曳排序" : "排序 / 搜尋中，無法拖移"
                      }
                      className={`w-10 px-2 py-3 ${
                        dragEnabled
                          ? "text-text-muted cursor-grab active:cursor-grabbing"
                          : "text-text-muted/30 cursor-not-allowed"
                      }`}
                    >
                      <GripVertical size={16} aria-hidden="true" />
                    </td>
                  ) : null}
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={`text-ink px-4 py-3 ${columns[i]?.className ?? ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 頁尾：總筆數 + 分頁 */}
      {sorted.length > 0 ? (
        <div className="text-text-muted flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span>共 {sorted.length} 筆</span>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="border-border hover:bg-surface-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                上一頁
              </button>
              <span>
                第 {currentPage} / {totalPages} 頁
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="border-border hover:bg-surface-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一頁
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 手動模式且可拖移時，顯示與 ReorderableTable 相同的提示。 */}
      {dragEnabled && sorted.length > 0 ? (
        <p className="text-text-muted text-[12px]">
          拖曳左側{" "}
          <GripVertical size={12} className="inline" aria-hidden="true" />{" "}
          即可調整順序，會自動儲存並重新編號（排序或搜尋時停用）。
        </p>
      ) : null}
    </div>
  );
}
