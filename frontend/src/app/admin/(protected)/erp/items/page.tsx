import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listItems } from "@/lib/erp/queries/master-data";
import type { ErpItem, ItemKind } from "@/lib/erp/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { MoneyText } from "@/components/erp/MoneyText";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { ITEM_KINDS, ITEM_KIND_LABEL, MX_CARD_TYPE_LABEL } from "./_lib/rules";
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
} from "./_components/master-ui";

export const metadata = { title: "品項 · ERP 基本資料" };

const COLUMNS: Column<ErpItem>[] = [
  {
    header: "產品編號",
    cell: (i) => (
      <Link href={`/admin/erp/items/${i.id}`} className={TEXT_LINK}>
        <span className="font-mono text-[13px]">{i.code}</span>
      </Link>
    ),
  },
  {
    header: "品名規格",
    cell: (i) => (
      <Link href={`/admin/erp/items/${i.id}`} className={TEXT_LINK}>
        {i.name}
      </Link>
    ),
  },
  { header: "類別", cell: (i) => ITEM_KIND_LABEL[i.kind] },
  { header: "單位", cell: (i) => i.unit },
  {
    header: "追蹤",
    cell: (i) =>
      [
        i.track_stock ? "庫存" : null,
        i.track_serial ? "機號" : null,
        i.mx_card_type ? MX_CARD_TYPE_LABEL[i.mx_card_type] : null,
      ]
        .filter(Boolean)
        .join("・") || "—",
  },
  {
    header: "售價",
    className: "text-right",
    cell: (i) => <MoneyText value={i.sale_price} />,
  },
  { header: "狀態", cell: (i) => <ActiveBadge active={i.active} /> },
];

export default async function ErpItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const kindParam = firstParam(sp.kind);
  const kind = (ITEM_KINDS as readonly string[]).includes(kindParam)
    ? (kindParam as ItemKind)
    : null;
  const inactive = firstParam(sp.inactive) === "1";
  const page = pageParam(sp.page);
  const result = await listItems({ q, kind, includeInactive: inactive, page });

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="items" />
      <MasterHeader
        title="品項"
        description={`共 ${result.total} 筆${inactive ? "（含停用）" : ""}。`}
        actions={
          <Link href="/admin/erp/items/new" className={LINK_PRIMARY}>
            新增品項
          </Link>
        }
      />

      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">搜尋代碼／名稱</span>
          <input
            name="q"
            defaultValue={q}
            className={ERP_INPUT}
            placeholder="例：ALH-15AI"
          />
        </label>
        <label className="flex w-[160px] flex-col gap-1 text-[13px]">
          <span className="text-text-muted">類別</span>
          <select name="kind" defaultValue={kind ?? ""} className={ERP_SELECT}>
            <option value="">全部</option>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
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
        getKey={(i) => i.id}
        empty="查無品項。"
      />
      <Pager
        basePath="/admin/erp/items"
        params={{
          q: q || undefined,
          kind: kind ?? undefined,
          inactive: inactive ? "1" : undefined,
        }}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
