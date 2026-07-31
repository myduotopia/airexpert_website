import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

/** 通用唯讀小表（熱門頁面／關鍵字／著陸頁共用）。 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  empty = "此區間無資料。",
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, i: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-text-muted text-[13px]">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-muted border-border border-b text-left">
            {columns.map((c) => (
              <th
                key={c.header}
                className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getKey(row, i)} className="border-border/60 border-b">
              {columns.map((c) => (
                <td
                  key={c.header}
                  className={`text-ink px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
