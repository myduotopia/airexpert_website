import Link from "next/link";
import { requireRole } from "@/lib/admin/auth";
import { listMachines } from "@/lib/admin/maintenance";
import type { MxCardType } from "@/lib/admin/maintenance";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { cardTypeLabel } from "@/lib/admin/maintenance-normalize";
import { machineDisplayName } from "@/lib/admin/machine-identity";
import { rocDate } from "@/lib/admin/minguo";
import { archiveMachineAction } from "./actions";

export const metadata = { title: "保養記錄卡 · 後台" };

/** 卡別分頁。all = 不分卡別。 */
const TABS: { key: "all" | MxCardType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "compressor", label: "空壓機" },
  { key: "filter", label: "過濾系統" },
];

/** ?type= 收斂成分頁 key；認不得一律回 all。 */
function parseTab(v: string | string[] | undefined): "all" | MxCardType {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "compressor" || s === "filter" ? s : "all";
}

export default async function MaintenanceListPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireRole(["office"]);
  const tab = parseTab((await searchParams).type);
  const machines = await listMachines(tab === "all" ? undefined : tab);

  const columns: AdminColumn[] = [
    // 機台識別是三段式的「客戶-機台代號-機號」（#165）；客戶另留一欄是為了
    // 連進客戶頁與依客戶排序。
    { header: "機台", sortable: true },
    { header: "卡別", sortable: true },
    { header: "客戶", sortable: true },
    { header: "機型", sortable: true },
    { header: "最後保養日", sortable: true },
    { header: "操作", className: "text-right whitespace-nowrap" },
  ];
  const rows: AdminRow[] = machines.map((m) => {
    const typeLabel = cardTypeLabel(m.card_type);
    const displayName = machineDisplayName(m.customer_name, m);
    return {
      key: m.id,
      cells: [
        <Link
          key="identity"
          href={`/admin/maintenance/${m.id}`}
          className="text-ink hover:text-primary-deep font-medium"
        >
          {displayName}
        </Link>,
        typeLabel,
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
        displayName,
        typeLabel,
        m.customer_name,
        m.model,
        m.last_service_date,
        null,
      ],
      // 三段識別任一段都要能搜到（客戶原名與正規化後的短名都收進來）。
      search:
        `${displayName} ${m.machine_no ?? ""} ${m.serial_no ?? ""} ${typeLabel} ${m.customer_name} ${m.model ?? ""}`.toLowerCase(),
    };
  });

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
            新增空壓機卡
          </Link>
          <Link
            href="/admin/maintenance/new?type=filter"
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
          >
            新增過濾系統卡
          </Link>
        </div>
      </div>
      <nav className="border-border mb-4 flex gap-1 border-b" aria-label="卡別">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={
                t.key === "all"
                  ? "/admin/maintenance"
                  : `/admin/maintenance?type=${t.key}`
              }
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-semibold ${
                active
                  ? "border-primary text-primary-deep"
                  : "text-text-muted hover:text-ink border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <AdminTable
        rows={rows}
        columns={columns}
        searchPlaceholder="搜尋客戶 / 機台代號 / 機號…"
        empty="尚無保養卡，點右上角建立第一張。"
      />
    </div>
  );
}
