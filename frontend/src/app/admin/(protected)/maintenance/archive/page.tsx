import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listArchivedMachines } from "@/lib/admin/maintenance";
import type { MxMachineListItem } from "@/lib/admin/maintenance";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { rocDateTime } from "@/lib/admin/minguo";
import {
  restoreMachineAction,
  deleteMachinePermanentlyAction,
} from "../actions";

export const metadata = { title: "封存區 · 後台" };

export default async function MaintenanceArchivePage() {
  await requireRole(["office"]);
  const machines = await listArchivedMachines();

  const columns: Column<MxMachineListItem>[] = [
    {
      header: "機號",
      cell: (m) => (
        <Link
          href={`/admin/maintenance/${m.id}`}
          className="text-ink hover:text-primary-deep font-medium"
        >
          {m.serial_no}
        </Link>
      ),
    },
    {
      header: "卡別",
      cell: (m) => (m.card_type === "filter" ? "過濾系統" : "空壓機"),
    },
    { header: "客戶", cell: (m) => m.customer_name },
    { header: "機型", cell: (m) => m.model ?? "—" },
    { header: "封存時間", cell: (m) => rocDateTime(m.archived_at) },
    {
      header: "操作",
      className: "text-right whitespace-nowrap",
      cell: (m) => (
        <div className="flex items-center justify-end gap-2">
          <form action={restoreMachineAction.bind(null, m.id)}>
            <SubmitButton>復原</SubmitButton>
          </form>
          <DeleteButton
            onDelete={deleteMachinePermanentlyAction.bind(null, m.id)}
            label="永久刪除"
            confirmText="確定永久刪除？此卡與其所有維護紀錄將無法復原。"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">封存區</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            共 {machines.length} 張已封存卡。
          </p>
        </div>
        <Link
          href="/admin/maintenance"
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
        >
          返回保養記錄卡
        </Link>
      </div>
      <DataTable
        rows={machines}
        columns={columns}
        getKey={(m) => m.id}
        empty="封存區沒有卡片。"
      />
    </div>
  );
}
