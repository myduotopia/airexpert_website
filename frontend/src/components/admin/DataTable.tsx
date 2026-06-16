import type { ReactNode } from "react";

// 通用後台資料表。無 hooks，可在 server component 直接使用。
// 用法：<DataTable rows={products} getKey={(p)=>p.id} columns={[{header:"名稱", cell:(p)=>p.name}, ...]} />
export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  rows,
  columns,
  getKey,
  empty = "尚無資料",
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
        {empty}
      </div>
    );
  }

  return (
    <div className="border-border overflow-x-auto rounded-xl border bg-white">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-border text-text-muted border-b">
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
          {rows.map((row) => (
            <tr
              key={getKey(row)}
              className="border-border hover:bg-surface-muted border-b last:border-b-0"
            >
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={`text-ink px-4 py-3 ${c.className ?? ""}`}
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
