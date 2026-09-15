import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listWarehouses } from "@/lib/erp/queries/master-data";
import type { ErpWarehouse } from "@/lib/erp/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import {
  ActiveBadge,
  LINK_PRIMARY,
  MasterHeader,
  MasterTabs,
  TEXT_LINK,
} from "../items/_components/master-ui";

export const metadata = { title: "倉庫 · ERP 基本資料" };

const COLUMNS: Column<ErpWarehouse>[] = [
  {
    header: "代碼",
    cell: (w) => (
      <Link href={`/admin/erp/warehouses/${w.id}/edit`} className={TEXT_LINK}>
        <span className="font-mono text-[13px]">{w.code}</span>
      </Link>
    ),
  },
  {
    header: "名稱",
    cell: (w) => (
      <Link href={`/admin/erp/warehouses/${w.id}/edit`} className={TEXT_LINK}>
        {w.name}
      </Link>
    ),
  },
  {
    header: "預設",
    cell: (w) =>
      w.is_default ? (
        <span className="bg-primary/10 text-primary-deep inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium">
          預設倉
        </span>
      ) : (
        ""
      ),
  },
  { header: "狀態", cell: (w) => <ActiveBadge active={w.active} /> },
  { header: "備註", cell: (w) => w.note ?? "—" },
];

export default async function ErpWarehousesPage() {
  await requireModule("erp");
  const warehouses = await listWarehouses();
  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="warehouses" />
      <MasterHeader
        title="倉庫"
        description={`共 ${warehouses.length} 個倉庫。有庫存或異動的倉庫只能停用，不能刪除。`}
        actions={
          <Link href="/admin/erp/warehouses/new" className={LINK_PRIMARY}>
            新增倉庫
          </Link>
        }
      />
      <DataTable
        rows={warehouses}
        columns={COLUMNS}
        getKey={(w) => w.id}
        empty="尚無倉庫。"
      />
    </div>
  );
}
