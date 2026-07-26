import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listMachines } from "@/lib/admin/maintenance";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";

export const metadata = { title: "保養記錄卡 · 後台" };

const DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export default async function MaintenanceListPage() {
  await requireRole(["office"]);
  const machines = await listMachines();

  const columns: AdminColumn[] = [
    { header: "機號", sortable: true },
    { header: "客戶", sortable: true },
    { header: "機型", sortable: true },
    { header: "最後保養日", sortable: true },
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
      m.customer_name,
      m.model ?? "—",
      fmtDate(m.last_service_date),
    ],
    sortValues: [m.serial_no, m.customer_name, m.model, m.last_service_date],
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
