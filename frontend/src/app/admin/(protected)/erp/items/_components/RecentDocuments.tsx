// 客戶／廠商詳情頁的「近期單據」表（server component）。
// 單據詳情頁屬各單別區（銷售／採購…）負責，此處只列出單號與金額，不連結。
import { DataTable, type Column } from "@/components/admin/DataTable";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import type { RecentDocumentRow } from "@/lib/erp/queries/master-data";
import { rocDate } from "@/lib/admin/minguo";

const COLUMNS: Column<RecentDocumentRow>[] = [
  { header: "日期", cell: (d) => rocDate(d.doc_date) },
  { header: "單別", cell: (d) => DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type },
  {
    header: "單號",
    cell: (d) => (
      <span className="font-mono text-[13px]">{d.doc_no ?? "（草稿）"}</span>
    ),
  },
  { header: "狀態", cell: (d) => <DocStatusBadge status={d.status} /> },
  {
    header: "金額",
    className: "text-right",
    cell: (d) => (
      <MoneyText
        value={d.total_amount}
        currency={d.currency}
        showCurrency={d.currency !== "TWD"}
      />
    ),
  },
];

export function RecentDocuments({ rows }: { rows: RecentDocumentRow[] }) {
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      getKey={(d) => d.id}
      empty="尚無單據。"
    />
  );
}
