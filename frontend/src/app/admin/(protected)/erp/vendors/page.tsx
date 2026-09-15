import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listVendors } from "@/lib/erp/queries/master-data";
import type { ErpVendor } from "@/lib/erp/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ERP_INPUT } from "@/components/erp/styles";
import {
  ActiveBadge,
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
  MasterTabs,
  Pager,
  TEXT_LINK,
  firstParam,
  pageParam,
} from "../items/_components/master-ui";

export const metadata = { title: "廠商 · ERP 基本資料" };

const COLUMNS: Column<ErpVendor>[] = [
  {
    header: "廠商代碼",
    cell: (v) => (
      <Link href={`/admin/erp/vendors/${v.id}`} className={TEXT_LINK}>
        <span className="font-mono text-[13px]">{v.code}</span>
      </Link>
    ),
  },
  {
    header: "廠商名稱",
    cell: (v) => (
      <Link href={`/admin/erp/vendors/${v.id}`} className={TEXT_LINK}>
        {v.name}
      </Link>
    ),
  },
  { header: "統編", cell: (v) => v.tax_id ?? "—" },
  { header: "聯絡人", cell: (v) => v.contact_person ?? "—" },
  { header: "電話", cell: (v) => v.phone ?? "—" },
  { header: "幣別", cell: (v) => v.currency },
  { header: "狀態", cell: (v) => <ActiveBadge active={v.active} /> },
];

export default async function ErpVendorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const inactive = firstParam(sp.inactive) === "1";
  const page = pageParam(sp.page);
  const result = await listVendors({ q, includeInactive: inactive, page });

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="vendors" />
      <MasterHeader
        title="廠商"
        description={`共 ${result.total} 筆${inactive ? "（含停用）" : ""}。`}
        actions={
          <Link href="/admin/erp/vendors/new" className={LINK_PRIMARY}>
            新增廠商
          </Link>
        }
      />
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">搜尋代碼／名稱／統編／聯絡人</span>
          <input name="q" defaultValue={q} className={ERP_INPUT} />
        </label>
        <label className="flex h-10 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={inactive}
          />
          顯示停用
        </label>
        <button type="submit" className={LINK_SECONDARY}>
          查詢
        </button>
      </form>
      <DataTable
        rows={result.rows}
        columns={COLUMNS}
        getKey={(v) => v.id}
        empty="查無廠商。"
      />
      <Pager
        basePath="/admin/erp/vendors"
        params={{ q: q || undefined, inactive: inactive ? "1" : undefined }}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
