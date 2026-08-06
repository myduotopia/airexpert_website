"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  GripVertical,
  MoveVertical,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  X,
} from "lucide-react";
import type { ActionResult } from "@/lib/admin/crud";
import {
  moveItem,
  moveToEdge,
  pageWindow,
  type MovePosition,
} from "@/lib/admin/table";

// 注意：本元件是 client component，故 props 必須可序列化——不能傳「函式」
// （cell renderer / getKey）過界，否則 server→client 會丟
// 「Functions cannot be passed directly to Client Components」而整頁 500。
// 因此由 server component 先把每列 cells 渲染成 ReactNode，再傳進來；
// 排序 / 搜尋所需的原始值另以「可序列化的原始型別」附帶（sortValues / search）。
// 只有 onReorder（"use server" action）允許跨界。
//
// 本元件是後台清單的唯一表格元件，功能：拖移排序、跨頁移動、表頭排序、
// 即時搜尋、10/30 筆分頁。
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
  // 純文字標題，用於「移動中：《XXX》」提示與插入鈕的 aria-label。
  // cells 是 ReactNode 無法拿來當文字，故另外附帶。
  label?: string;
};

type SortDir = "asc" | "desc";

/**
 * 後台通用資料表（client）。功能：
 * - 表頭點擊排序（asc → desc → 回到手動順序循環）。
 * - 右上角即時搜尋（對 row.search 做 includes）。
 * - 10 / 30 筆分頁，含頁碼、首頁 / 末頁鈕。
 * - 可選拖移排序（提供 onReorder 時啟用）。
 * - 可選「跨頁移動」：點列左側的移動鈕進入移動模式，翻頁 / 搜尋 / 排序找到
 *   目標列後，點該列的「插入到上方 / 下方」完成移動。
 *
 * 「手動模式」= 未排序且搜尋為空（sortCol === null && query 為空）。
 * 只有在手動模式、且有 onReorder 時才允許**拖移**——因為排序 / 過濾後的
 * 視覺順序已非 sort_order，拖移的落點會語意不明。
 *
 * 反之，**跨頁移動在任何檢視下都可用**：插入位置綁定的是「某一具體列」而非
 * 「第 N 筆」，故即使在搜尋 / 排序視圖，落點在手動全序中仍唯一確定。
 * 這也是把後面頁次的項目移到最前面最快的路徑——直接搜尋目標列即可。
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
  // 本地 rows 供拖移 / 移動的樂觀更新使用。
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<10 | 30>(10);
  const [page, setPage] = useState(1);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [movingKey, setMovingKey] = useState<string | null>(null);
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
    // 移動中的項目若已不存在（例如被刪除），直接退出移動模式。
    if (movingKey && !initialRows.some((r) => r.key === movingKey)) {
      setMovingKey(null);
    }
  }

  // 移動模式：Esc 取消。
  useEffect(() => {
    if (!movingKey) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMovingKey(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [movingKey]);

  const trimmed = query.trim().toLowerCase();
  const manualMode = sortCol === null && trimmed === "";
  const hasGrip = Boolean(onReorder);
  // 移動模式進行中時停用拖移，避免兩套機制同時作用。
  const dragEnabled = hasGrip && manualMode && movingKey === null;
  const movingRow = movingKey
    ? (rows.find((r) => r.key === movingKey) ?? null)
    : null;

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
  // 注意：這些都**不會**結束移動模式——跨頁移動就是要靠翻頁 / 搜尋找目標列。
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

  // ---- 排序寫入（拖移與跨頁移動共用）----
  function submitOrder(nextRows: AdminRow[]) {
    if (!onReorder) return;
    setRows(nextRows);
    setError(null);
    startTransition(async () => {
      const res = await onReorder(nextRows.map((r) => r.key));
      if (!res.ok) {
        setError(res.error);
        setRows(initialRows);
      } else {
        router.refresh();
      }
    });
  }

  function handleDrop(localIndex: number) {
    const from = fromIndex.current;
    fromIndex.current = null;
    setDragKey(null);
    setOverKey(null);
    if (!onReorder || !dragEnabled) return;

    // 分頁下 local(page) index 需換算成整份 rows 的 global index。
    // 手動模式時 filtered === rows 且 sorted === filtered，故 global = pageStart + localIndex。
    const toGlobal = pageStart + localIndex;
    if (from === null || from === toGlobal) return;

    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(toGlobal, 0, moved);
    submitOrder(next);
  }

  // 依新的 key 順序重組 rows（key 一定來自現有 rows，故不會遺失資料）。
  function rowsByKeys(nextKeys: string[]) {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return nextKeys
      .map((k) => byKey.get(k))
      .filter((r): r is AdminRow => Boolean(r));
  }

  function commitMove(nextKeys: string[]) {
    const key = movingKey;
    setMovingKey(null);
    if (!onReorder || !key) return;
    if (nextKeys.join("|") === rows.map((r) => r.key).join("|")) return;

    submitOrder(rowsByKeys(nextKeys));
    // 手動模式下把使用者帶到項目落腳的那一頁，讓結果看得見。
    // （搜尋 / 排序視圖的頁碼與手動順序無關，故不跳頁。）
    if (manualMode) {
      const index = nextKeys.indexOf(key);
      if (index >= 0) setPage(Math.floor(index / pageSize) + 1);
    }
  }

  function handleInsert(targetKey: string, position: MovePosition) {
    if (!movingKey) return;
    commitMove(
      moveItem(
        rows.map((r) => r.key),
        movingKey,
        targetKey,
        position,
      ),
    );
  }

  function handleMoveToEdge(edge: "start" | "end") {
    if (!movingKey) return;
    commitMove(
      moveToEdge(
        rows.map((r) => r.key),
        movingKey,
        edge,
      ),
    );
  }

  const iconButton =
    "border-border hover:bg-surface-muted text-text-muted hover:text-ink inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors";

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          排序儲存失敗：{error}
        </p>
      ) : null}

      {/* 移動模式提示條（sticky，捲動長清單時仍看得到目前在移動什麼） */}
      {movingRow ? (
        <div
          role="status"
          className="border-primary/40 bg-primary/5 sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-[13px]"
        >
          <span className="text-ink">
            移動中：
            <strong className="font-semibold">
              {movingRow.label ?? "已選取的項目"}
            </strong>
            <span className="text-text-muted">
              　可翻頁或搜尋找到目標，再點該列左側的插入鈕
            </span>
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => handleMoveToEdge("start")}
              className="border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-md border bg-white px-2"
            >
              移到最前面
            </button>
            <button
              type="button"
              onClick={() => handleMoveToEdge("end")}
              className="border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-md border bg-white px-2"
            >
              移到最後面
            </button>
            <button
              type="button"
              onClick={() => setMovingKey(null)}
              className="text-text-muted hover:text-ink inline-flex h-8 items-center gap-1 rounded-md px-2"
            >
              <X size={14} aria-hidden="true" />
              取消 (Esc)
            </button>
          </span>
        </div>
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
                  <th className="w-24 px-2 py-3" aria-label="排序" />
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
                    dragKey === row.key || movingKey === row.key
                      ? "opacity-50"
                      : overKey === row.key
                        ? "bg-primary/5"
                        : "hover:bg-surface-muted"
                  }`}
                >
                  {hasGrip ? (
                    <td className="w-24 px-2 py-3 align-middle">
                      {movingKey === null ? (
                        <div className="flex items-center gap-1">
                          {/* 只有把手可拖移，避免誤拖整列 / 干擾欄內連結與刪除鈕。
                              非手動模式時把手停用並轉灰（排序 / 搜尋後拖移語意不明）。 */}
                          <span
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
                              dragEnabled
                                ? "拖曳排序"
                                : "排序 / 搜尋中，無法拖移"
                            }
                            className={`inline-flex h-7 w-5 items-center justify-center ${
                              dragEnabled
                                ? "text-text-muted cursor-grab active:cursor-grabbing"
                                : "text-text-muted/30 cursor-not-allowed"
                            }`}
                          >
                            <GripVertical size={16} aria-hidden="true" />
                          </span>
                          <button
                            type="button"
                            onClick={() => setMovingKey(row.key)}
                            title="移動到其他位置（可跨頁）"
                            aria-label={`移動${row.label ? `「${row.label}」` : "此列"}到其他位置`}
                            className={iconButton}
                          >
                            <MoveVertical size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : movingKey === row.key ? (
                        <span className="text-primary-deep text-[12px] font-medium whitespace-nowrap">
                          移動中
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleInsert(row.key, "before")}
                            title="插入到此列上方"
                            aria-label={`插入到${row.label ? `「${row.label}」` : "此列"}上方`}
                            className={iconButton}
                          >
                            <ArrowUpToLine size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsert(row.key, "after")}
                            title="插入到此列下方"
                            aria-label={`插入到${row.label ? `「${row.label}」` : "此列"}下方`}
                            className={iconButton}
                          >
                            <ArrowDownToLine size={14} aria-hidden="true" />
                          </button>
                        </div>
                      )}
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

      {/* 頁尾：總筆數 + 分頁（頁碼、首頁 / 末頁） */}
      {sorted.length > 0 ? (
        <div className="text-text-muted flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span>共 {sorted.length} 筆</span>
          {totalPages > 1 ? (
            <nav
              aria-label="分頁"
              className="flex flex-wrap items-center gap-1"
            >
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                aria-label="第一頁"
                className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ChevronsLeft size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="上一頁"
                className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>

              {pageWindow(currentPage, totalPages).map((token, i) =>
                token === "ellipsis" ? (
                  <span
                    key={`gap-${i}`}
                    aria-hidden="true"
                    className="text-text-muted/60 px-1 select-none"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={token}
                    type="button"
                    onClick={() => setPage(token)}
                    aria-label={`第 ${token} 頁`}
                    aria-current={token === currentPage ? "page" : undefined}
                    className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 transition-colors ${
                      token === currentPage
                        ? "border-primary bg-primary font-semibold text-white"
                        : "border-border hover:bg-surface-muted text-ink"
                    }`}
                  >
                    {token}
                  </button>
                ),
              )}

              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="下一頁"
                className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                aria-label="最後一頁"
                className={`${iconButton} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ChevronsRight size={14} aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}

      {/* 排序操作說明 */}
      {hasGrip && sorted.length > 0 && !movingRow ? (
        <p className="text-text-muted text-[12px]">
          拖曳左側{" "}
          <GripVertical size={12} className="inline" aria-hidden="true" />{" "}
          可在同頁內調整順序（排序或搜尋時停用）；要跨頁移動請點{" "}
          <MoveVertical size={12} className="inline" aria-hidden="true" />{" "}
          ，再翻頁或搜尋找到目標列插入。順序會自動儲存並重新編號。
        </p>
      ) : null}
    </div>
  );
}
