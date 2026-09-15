import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import {
  getItem,
  getItemStock,
  getVendor,
  type ItemStockRow,
} from "@/lib/erp/queries/master-data";
import { formatQty } from "@/lib/erp/format";
import { rocDateTime } from "@/lib/admin/minguo";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { MoneyText } from "@/components/erp/MoneyText";
import { ITEM_KIND_LABEL, MX_CARD_TYPE_LABEL } from "../_lib/rules";
import {
  ActiveBadge,
  Info,
  InfoGrid,
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
  MasterTabs,
  StatCard,
} from "../_components/master-ui";

export const metadata = { title: "品項 · ERP 基本資料" };

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  await requireModule("erp");
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item) notFound();
  const [stock, vendor] = await Promise.all([
    getItemStock(itemId),
    item.default_vendor_id ? getVendor(item.default_vendor_id) : null,
  ]);
  const totalQty = stock.reduce((s, r) => s + r.qty, 0);
  const lowStock = item.track_stock && totalQty < item.safety_stock;

  const columns: Column<ItemStockRow>[] = [
    {
      header: "倉庫",
      cell: (r) => (
        <>
          <span className="font-mono text-[13px]">{r.warehouse_code}</span>{" "}
          {r.warehouse_name}
        </>
      ),
    },
    {
      header: `存量（${item.unit}）`,
      className: "text-right",
      cell: (r) => (
        <span
          className={`tabular-nums ${r.qty < 0 ? "text-red-600" : ""}`.trim()}
        >
          {formatQty(r.qty)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterTabs active="items" />
      <MasterHeader
        title={
          <>
            {item.name}
            <span className="text-text-muted ml-2 font-mono text-[16px] font-normal">
              {item.code}
            </span>
          </>
        }
        description={
          <span className="inline-flex items-center gap-2">
            {ITEM_KIND_LABEL[item.kind]} <ActiveBadge active={item.active} />
          </span>
        }
        actions={
          <>
            <Link href="/admin/erp/items" className={LINK_SECONDARY}>
              返回品項列表
            </Link>
            <Link
              href={`/admin/erp/items/${item.id}/edit`}
              className={LINK_PRIMARY}
            >
              編輯
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="全倉存量"
          hint={
            item.track_stock
              ? `安全存量 ${formatQty(item.safety_stock)} ${item.unit}`
              : "此品項不追蹤庫存"
          }
        >
          {item.track_stock ? (
            <span className={lowStock ? "text-red-600" : ""}>
              {formatQty(totalQty)} {item.unit}
            </span>
          ) : (
            "—"
          )}
        </StatCard>
        <StatCard label="平均成本（唯讀）" hint="移動加權平均，由過帳自動計算">
          <MoneyText value={item.avg_cost} decimals={2} />
        </StatCard>
        <StatCard label="售價／進價">
          <MoneyText value={item.sale_price} /> /{" "}
          <MoneyText value={item.purchase_price} />
        </StatCard>
      </div>

      <InfoGrid>
        <Info label="單位">{item.unit}</Info>
        <Info label="追蹤庫存">{item.track_stock ? "是" : "否"}</Info>
        <Info label="追蹤機號">{item.track_serial ? "是" : "否"}</Info>
        <Info label="銷貨建立保養卡">
          {item.mx_card_type ? MX_CARD_TYPE_LABEL[item.mx_card_type] : "不建卡"}
        </Info>
        <Info label="品牌">{item.brand ?? "—"}</Info>
        <Info label="機型">{item.model ?? "—"}</Info>
        <Info label="預設廠商">
          {vendor ? (
            <Link
              href={`/admin/erp/vendors/${vendor.id}`}
              className="text-primary-deep hover:underline"
            >
              {vendor.code} {vendor.name}
            </Link>
          ) : (
            "—"
          )}
        </Info>
        <Info label="最後更新">{rocDateTime(item.updated_at)}</Info>
        <Info label="備註" wide>
          {item.note ?? "—"}
        </Info>
      </InfoGrid>

      {item.track_stock && (
        <>
          <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">各倉存量</h2>
          <DataTable
            rows={stock}
            columns={columns}
            getKey={(r) => r.warehouse_id}
            empty="尚無庫存紀錄。"
          />
        </>
      )}
    </div>
  );
}
