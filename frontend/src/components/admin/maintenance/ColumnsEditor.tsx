"use client";
// 過濾（乾燥機）卡的「耗材欄位」編輯器。
// 每張卡的耗材欄名稱與數量都不同（來源：過濾系統保養紀錄卡.xlsx 三個分頁），
// 故欄位由此逐張卡自訂：可新增 / 更名 / 刪除 / 拖曳排序。
//
// 送出方式：不逐欄開 input name，而是把整份定義序列化成單一隱藏欄位
// columns_json，由 server action 以 parseColumnDefs() 解析。
// 既有欄位帶 id（uuid），新增的欄位 id 為 null（由 DB 產生）。
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

export interface ColumnItem {
  id: string | null;
  label: string;
}

// React key 用的本地序號。欄位新增後 id 仍是 null，不能拿 id 或索引當 key
// （拿索引當 key 會讓刪除中間列時輸入游標跳到別列）。
type Row = ColumnItem & { key: string };

const INPUT_CLASS =
  "border-border focus:border-primary h-11 w-full rounded-lg border px-3 text-[15px] outline-none";
const ICON_BTN =
  "text-text-muted hover:bg-surface-muted hover:text-ink inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-30";

export function ColumnsEditor({ initial }: { initial?: ColumnItem[] }) {
  // key 只需在本元件內唯一且穩定；初始列直接用索引，之後新增的列由 seq 續號。
  // seq 只在事件處理器內遞增，不在 render 期間讀寫 ref。
  const seq = useRef(initial?.length ?? 0);
  const nextKey = () => `c${seq.current++}`;
  const [rows, setRows] = useState<Row[]>(() =>
    (initial ?? []).map((c, i) => ({ ...c, key: `c${i}` })),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  const payload = JSON.stringify(
    rows.map((r) => ({ id: r.id, label: r.label })),
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-ink text-[16px] font-bold">耗材欄位</h2>
        <p className="text-text-muted mt-1 text-[13px]">
          紀錄表由左到右的欄位，例：EA350-Q 濾蕊、CKD 排水器、16&quot;
          散熱馬達+葉片。日期 / 維護員 / 備註為固定欄，不需在此新增。
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="border-border text-text-muted rounded-xl border border-dashed bg-white p-6 text-center text-[14px]">
          尚未設定耗材欄位，點下方「新增欄位」開始。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <li
              key={row.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragKey === null) return;
                move(
                  rows.findIndex((r) => r.key === dragKey),
                  i,
                );
                setDragKey(null);
              }}
              className={`border-border flex items-center gap-2 rounded-lg border bg-white p-2 ${
                dragKey === row.key ? "opacity-50" : ""
              }`}
            >
              {/* 只有把手可拖移，避免拖到文字輸入時被當成拖曳。 */}
              <span
                draggable
                onDragStart={() => setDragKey(row.key)}
                onDragEnd={() => setDragKey(null)}
                aria-label="拖曳排序"
                className="text-text-muted inline-flex h-9 w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
              >
                <GripVertical size={16} aria-hidden="true" />
              </span>
              <span className="text-text-muted w-6 shrink-0 text-center text-[13px]">
                {i + 1}
              </span>
              <input
                type="text"
                value={row.label}
                aria-label={`第 ${i + 1} 個耗材欄位名稱`}
                placeholder="欄位名稱"
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key ? { ...r, label: e.target.value } : r,
                    ),
                  )
                }
                className={INPUT_CLASS}
              />
              <button
                type="button"
                aria-label="上移"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
                className={ICON_BTN}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="下移"
                disabled={i === rows.length - 1}
                onClick={() => move(i, i + 1)}
                className={ICON_BTN}
              >
                <ArrowDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="刪除欄位"
                onClick={() =>
                  setRows((prev) => prev.filter((r) => r.key !== row.key))
                }
                className={`${ICON_BTN} hover:text-red-600`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { key: nextKey(), id: null, label: "" },
            ])
          }
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center gap-1.5 rounded-lg border px-4 text-[14px] font-semibold"
        >
          <Plus size={16} aria-hidden="true" />
          新增欄位
        </button>
      </div>

      <p className="text-text-muted text-[13px]">
        刪除欄位只會移除欄位定義；既有紀錄中該欄的值仍保留在資料庫，只是不再顯示。
      </p>

      <input type="hidden" name="columns_json" value={payload} />
    </div>
  );
}
