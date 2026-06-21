"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import type { ActionResult } from "@/lib/admin/crud";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

/**
 * 可拖移排序的後台資料表。拖移後以新順序呼叫 onReorder（server action，會把
 * sort_order 重設為 0,1,2…）；樂觀更新本地順序，失敗則還原。
 */
export function ReorderableTable<T>({
  rows: initialRows,
  columns,
  getKey,
  onReorder,
  empty = "尚無資料",
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  onReorder: (orderedIds: string[]) => Promise<ActionResult>;
  empty?: ReactNode;
}) {
  const [rows, setRows] = useState(initialRows);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fromIndex = useRef<number | null>(null);
  const router = useRouter();

  // router.refresh() 後 server 重新給 rows；以 id 簽章在 render 期間同步本地狀態
  // （React 官方「prop 變動時調整 state」模式，避免 effect 內 setState）。
  const signature = initialRows.map(getKey).join("|");
  const [syncedSig, setSyncedSig] = useState(signature);
  if (syncedSig !== signature) {
    setSyncedSig(signature);
    setRows(initialRows);
  }

  if (rows.length === 0) {
    return (
      <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
        {empty}
      </div>
    );
  }

  function handleDrop(toIndex: number) {
    const from = fromIndex.current;
    fromIndex.current = null;
    setDragKey(null);
    setOverKey(null);
    if (from === null || from === toIndex) return;

    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(toIndex, 0, moved);
    setRows(next);
    setError(null);

    startTransition(async () => {
      const res = await onReorder(next.map(getKey));
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
      <div
        className={`border-border overflow-x-auto rounded-xl border bg-white ${pending ? "opacity-60" : ""}`}
      >
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b">
              <th className="w-10 px-2 py-3" aria-label="拖移" />
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 font-medium ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const key = getKey(row);
              return (
                <tr
                  key={key}
                  draggable
                  onDragStart={() => {
                    fromIndex.current = index;
                    setDragKey(key);
                  }}
                  onDragEnter={() => setOverKey(key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={() => {
                    fromIndex.current = null;
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  className={`border-border border-b last:border-b-0 ${
                    dragKey === key
                      ? "opacity-40"
                      : overKey === key
                        ? "bg-primary/5"
                        : "hover:bg-surface-muted"
                  }`}
                >
                  <td className="text-text-muted w-10 cursor-grab px-2 py-3 active:cursor-grabbing">
                    <GripVertical size={16} aria-hidden="true" />
                  </td>
                  {columns.map((c, i) => (
                    <td
                      key={i}
                      className={`text-ink px-4 py-3 ${c.className ?? ""}`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted text-[12px]">
        拖曳左側{" "}
        <GripVertical size={12} className="inline" aria-hidden="true" />{" "}
        即可調整順序，會自動儲存並重新編號。
      </p>
    </div>
  );
}
