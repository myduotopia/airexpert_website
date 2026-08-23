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
import { rocDate } from "@/lib/admin/minguo";
import { archiveMachineAction } from "./actions";

export const metadata = { title: "保養記錄卡 · 後台" };

/** 卡別分頁。all = 不分卡別。 */
const TABS: { key: "all" | MxCardType; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "compressor", label: "空壓機" },
  { key: "filter", label: "過濾系統" },
];

const CARD_TYPE_LABEL: Record<MxCardType, string> = {
  compressor: "空壓機",
  filter: "過濾系統",
};

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
    { header: "機號", sortable: true },
    { header: "卡別", sortable: true },
    { header: "客戶", sortable: true },
    { header: "機型", sortable: true },
    { header: "最後保養日", sortable: true },
    { header: "操作", className: "text-right whitespace-nowrap" },
  ];
  const rows: AdminRow[] = machines.map((m) => {
    const cardTypeLabel = CARD_TYPE_LABEL[m.card_type] ?? m.card_type;
    return {
      key: m.id,
      cells: [
        <Link
          key="serial"
          href={`/admin/maintenance/${m.id}`}
          className="text-ink hover:text-primary-deep font-medium"
        >
          {m.serial_no}
        </Link>,
        cardTypeLabel,
        m.customer_name,
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
        cardTypeLabel,
        m.customer_name,
        m.model,
        m.last_service_date,
        null,
      ],
      search:
        `${m.serial_no} ${cardTypeLabel} ${m.customer_name} ${m.model ?? ""}`.toLowerCase(),
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
        searchPlaceholder="搜尋機號 / 客戶…"
        empty="尚無保養卡，點右上角建立第一張。"
      />
    </div>
  );
}
