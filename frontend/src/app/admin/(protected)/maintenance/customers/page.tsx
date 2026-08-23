import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listCustomers } from "@/lib/admin/maintenance";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";
import { rocDate } from "@/lib/admin/minguo";

export const metadata = { title: "客戶 · 後台" };

export default async function CustomersListPage() {
  await requireRole(["office"]);
  const customers = await listCustomers();

  const columns: AdminColumn[] = [
    { header: "客戶編號", sortable: true },
    { header: "客戶名稱", sortable: true },
    { header: "聯絡人", sortable: true },
    { header: "電話", sortable: true },
    { header: "機台數", sortable: true, className: "text-right" },
    { header: "最後保養日", sortable: true },
  ];

  const rows: AdminRow[] = customers.map((c) => ({
    key: c.id,
    label: c.name,
    cells: [
      <Link
        key="code"
        href={`/admin/maintenance/customers/${c.id}`}
        className="text-ink hover:text-primary-deep font-medium"
      >
        {c.code ?? "—"}
      </Link>,
      <Link
        key="name"
        href={`/admin/maintenance/customers/${c.id}`}
        className="text-ink hover:text-primary-deep font-medium"
      >
        {c.name}
      </Link>,
      c.contact_person ?? "—",
      c.phone ?? "—",
      <span key="count" className="tabular-nums">
        {c.machine_count}
      </span>,
      rocDate(c.last_service_date),
    ],
    sortValues: [
      c.code,
      c.name,
      c.contact_person,
      c.phone,
      c.machine_count,
      c.last_service_date,
    ],
    search:
      `${c.code ?? ""} ${c.name} ${c.contact_person ?? ""} ${c.phone ?? ""}`.toLowerCase(),
  }));

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">客戶</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            共 {customers.length} 位客戶。
          </p>
        </div>
        <Link
          href="/admin/maintenance"
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
        >
          返回保養記錄卡
        </Link>
      </div>
      <AdminTable
        rows={rows}
        columns={columns}
        searchPlaceholder="搜尋客戶編號 / 名稱 / 聯絡人 / 電話…"
        empty="尚無客戶。建立保養卡時會一併建立客戶。"
      />
    </div>
  );
}
