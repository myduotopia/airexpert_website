import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listErpCustomers } from "@/lib/erp/queries/master-data";
import type { ErpCustomer } from "@/lib/erp/types";
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

export const metadata = { title: "客戶 · ERP 基本資料" };

const COLUMNS: Column<ErpCustomer>[] = [
  {
    header: "客戶編號",
    cell: (c) => (
      <Link href={`/admin/erp/customers/${c.id}`} className={TEXT_LINK}>
        <span className="font-mono text-[13px]">{c.code ?? "—"}</span>
      </Link>
    ),
  },
  {
    header: "客戶名稱",
    cell: (c) => (
      <Link href={`/admin/erp/customers/${c.id}`} className={TEXT_LINK}>
        {c.name}
      </Link>
    ),
  },
  { header: "統編", cell: (c) => c.tax_id ?? "—" },
  { header: "聯絡人", cell: (c) => c.contact_person ?? "—" },
  { header: "電話", cell: (c) => c.phone ?? "—" },
  { header: "業務", cell: (c) => c.sales_rep ?? "—" },
  { header: "ERP 狀態", cell: (c) => <ActiveBadge active={c.erp_active} /> },
];

export default async function ErpCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const inactive = firstParam(sp.inactive) === "1";
  const page = pageParam(sp.page);
  const result = await listErpCustomers({ q, includeInactive: inactive, page });

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="customers" />
      <MasterHeader
        title="客戶"
        description={`與保養記錄卡共用客戶主檔。共 ${result.total} 筆${inactive ? "（含停用）" : ""}。`}
        actions={
          <Link href="/admin/erp/customers/new" className={LINK_PRIMARY}>
            新增客戶
          </Link>
        }
      />
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">
            搜尋編號／名稱／統編／聯絡人／電話
          </span>
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
        getKey={(c) => c.id}
        empty="查無客戶。"
      />
      <Pager
        basePath="/admin/erp/customers"
        params={{ q: q || undefined, inactive: inactive ? "1" : undefined }}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
