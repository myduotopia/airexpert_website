import Link from "next/link";
import type { ReactNode } from "react";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate } from "@/lib/admin/minguo";
import type { ErpDocumentListRow } from "@/lib/erp/types";

// 單據列表表格（server component）。extraColumn 供採購單顯示到貨進度、進退單建立頁放「帶入」按鈕。
export function DocListTable({
  rows,
  basePath,
  empty,
  extraColumn,
}: {
  rows: ErpDocumentListRow[];
  basePath: string;
  empty: string;
  extraColumn?: {
    header: string;
    cell: (row: ErpDocumentListRow) => ReactNode;
  };
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
      <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-border text-text-muted border-b">
            <th className="px-4 py-3 font-medium">單號</th>
            <th className="px-4 py-3 font-medium">日期</th>
            <th className="px-4 py-3 font-medium">廠商</th>
            <th className="px-4 py-3 text-right font-medium">總計</th>
            <th className="px-4 py-3 font-medium">狀態</th>
            {extraColumn && (
              <th className="px-4 py-3 font-medium">{extraColumn.header}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-border border-b last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`${basePath}/${r.id}`}
                  className="text-ink hover:text-primary-deep font-mono font-medium"
                >
                  {r.doc_no ?? "（草稿）"}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {rocDate(r.doc_date)}
              </td>
              <td className="px-4 py-3">{r.party_name ?? "—"}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <MoneyText
                  value={Number(r.total_amount)}
                  currency={r.currency}
                  showCurrency={r.currency !== "TWD"}
                />
              </td>
              <td className="px-4 py-3">
                <DocStatusBadge status={r.status} />
              </td>
              {extraColumn && (
                <td className="px-4 py-3">{extraColumn.cell(r)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
