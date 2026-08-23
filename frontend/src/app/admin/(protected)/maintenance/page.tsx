import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listMachines } from "@/lib/admin/maintenance";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { rocDate } from "@/lib/admin/minguo";
import { archiveMachineAction } from "./actions";

export const metadata = { title: "保養記錄卡 · 後台" };

export default async function MaintenanceListPage() {
  await requireRole(["office"]);
  const machines = await listMachines();

  const columns: AdminColumn[] = [
    { header: "機號", sortable: true },
    { header: "客戶", sortable: true },
    { header: "機型", sortable: true },
    { header: "最後保養日", sortable: true },
    { header: "操作", className: "text-right whitespace-nowrap" },
  ];
  const rows: AdminRow[] = machines.map((m) => ({
    key: m.id,
    cells: [
      <Link
        key="serial"
        href={`/admin/maintenance/${m.id}`}
        className="text-ink hover:text-primary-deep font-medium"
      >
        {m.serial_no}
      </Link>,
      <Link
        key="customer"
        href={`/admin/maintenance/customers/${m.customer_id}`}
        className="text-ink hover:text-primary-deep"
      >
        {m.customer_name}
      </Link>,
      m.model ?? "—",
      rocDate(m.last_service_date),
      <div key="actions" className="flex justify-end">
        <DeleteButton
          onDelete={archiveMachineAction.bind(null, m.id)}
          label="刪除"
          confirmText="確定刪除此保養卡？將移到封存區，可再復原。"
        />
      </div>,
    ],
    sortValues: [
      m.serial_no,
      m.customer_name,
      m.model,
      m.last_service_date,
      null,
    ],
    search: `${m.serial_no} ${m.customer_name} ${m.model ?? ""}`.toLowerCase(),
  }));

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">保養記錄卡</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            共 {machines.length} 張卡。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/maintenance/customers"
            className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
          >
            客戶
          </Link>
          <Link
            href="/admin/maintenance/archive"
            className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
          >
            封存區
          </Link>
          <Link
            href="/admin/maintenance/import"
            className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
          >
            拍照辨識
          </Link>
          <Link
            href="/admin/maintenance/new"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
          >
            新增保養卡
          </Link>
        </div>
      </div>
      <AdminTable
        rows={rows}
        columns={columns}
        searchPlaceholder="搜尋機號 / 客戶…"
        empty="尚無保養卡，點右上角建立第一張。"
      />
    </div>
  );
}
