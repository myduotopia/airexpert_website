import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { ERP_SELECT } from "@/components/erp/styles";
import { rocDate } from "@/lib/admin/minguo";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import { formatMoney, formatQty } from "@/lib/erp/format";
import { listWarehouseOptions } from "@/lib/erp/queries/pickers";
import {
  getItemStockMoves,
  INVENTORY_PAGE_SIZE,
  listStockItemOptions,
  listStockMoves,
  type StockMoveRow,
} from "@/lib/erp/queries/inventory";
import { DateRangeFields } from "../_components/DateRangeFields";
import {
  InventoryShell,
  SECONDARY_LINK,
  TABLE_WRAP,
  TD,
  TH,
} from "../_components/InventoryShell";
import { Pager } from "../_components/Pager";
import {
  computeRunningBalance,
  docHref,
  roundQty,
} from "../_lib/inventory-logic";
import {
  firstParam,
  parseIsoDate,
  parsePage,
  type SearchParamsRecord,
} from "../_lib/params";

export const metadata = { title: "庫存異動明細 · ERP · 後台" };

export default async function StockMovesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const itemId = firstParam(sp.item) || null;
  const warehouseId = firstParam(sp.warehouse) || null;
  const from = parseIsoDate(sp.from);
  const to = parseIsoDate(sp.to);
  const page = parsePage(sp.page);

  const [items, warehouses] = await Promise.all([
    listStockItemOptions(),
    listWarehouseOptions({ includeInactive: true }),
  ]);
  const item = items.find((i) => i.id === itemId) ?? null;

  let rows: (StockMoveRow & { balance: number | null })[];
  let total: number;
  let summary: {
    opening: number;
    inQty: number;
    outQty: number;
    closing: number;
  } | null = null;

  if (item) {
    const { opening, moves } = await getItemStockMoves({
      itemId: item.id,
      warehouseId,
      from,
      to,
    });
    const withBalance = computeRunningBalance(opening, moves);
    const inQty = roundQty(
      moves.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0),
    );
    const outQty = roundQty(
      moves.filter((m) => m.qty < 0).reduce((s, m) => s - m.qty, 0),
    );
    summary = {
      opening: roundQty(opening),
      inQty,
      outQty,
      closing: withBalance.at(-1)?.balance ?? roundQty(opening),
    };
    total = withBalance.length;
    const start = (page - 1) * INVENTORY_PAGE_SIZE;
    rows = withBalance.slice(start, start + INVENTORY_PAGE_SIZE);
  } else {
    const res = await listStockMoves({ warehouseId, from, to, page });
    rows = res.rows.map((r) => ({ ...r, balance: null }));
    total = res.total;
  }

  const showBalance = Boolean(item);
  const colCount = 8;

  return (
    <InventoryShell
      active="moves"
      description="庫存帳（過帳與作廢沖回）。選擇品項後依日期逐列計算結存，期初為起日前的累計量。"
    >
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"
      >
        <div className="flex min-w-[240px] flex-col gap-1">
          <span className="text-text-muted text-[12px]">品項</span>
          <select
            name="item"
            defaultValue={item?.id ?? ""}
            className={ERP_SELECT}
          >
            <option value="">全部品項（不計結存）</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.code} {i.name}
                {i.active ? "" : "（停用）"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-text-muted text-[12px]">倉庫</span>
          <select
            name="warehouse"
            defaultValue={warehouseId ?? ""}
            className={ERP_SELECT}
          >
            <option value="">全部倉庫</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} {w.name}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFields from={from ?? ""} to={to ?? ""} />
        <button type="submit" className={SECONDARY_LINK}>
          查詢
        </button>
        <Link
          href="/admin/erp/inventory/moves"
          className="text-text-muted hover:text-ink inline-flex h-10 items-center px-2 text-[14px]"
        >
          清除
        </Link>
      </form>

      {summary && item && (
        <dl className="border-border mb-4 grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 text-[14px] sm:grid-cols-4">
          <Stat label="期初結存" value={summary.opening} />
          <Stat label="區間入庫" value={summary.inQty} />
          <Stat label="區間出庫" value={summary.outQty} />
          <Stat label="期末結存" value={summary.closing} strong />
        </dl>
      )}

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[900px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={TH}>日期</th>
              <th className={TH}>單據</th>
              {!showBalance && <th className={TH}>品項</th>}
              <th className={TH}>倉庫</th>
              <th className={TH}>摘要</th>
              <th className={`${TH} text-right`}>入庫</th>
              <th className={`${TH} text-right`}>出庫</th>
              <th className={`${TH} text-right`}>單位成本</th>
              {showBalance && <th className={`${TH} text-right`}>結存</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  此條件下沒有庫存異動。
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="border-border border-t">
                <td className={`${TD} whitespace-nowrap`}>
                  {rocDate(m.move_date)}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {m.document ? (
                    <Link
                      href={docHref(m.document.doc_type, m.document.id)}
                      className="hover:text-primary-deep"
                    >
                      <span className="text-text-muted text-[12px]">
                        {DOC_TYPE_LABEL[m.document.doc_type]}
                      </span>{" "}
                      {m.document.doc_no ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                {!showBalance && (
                  <td className={TD}>
                    {m.item ? `${m.item.code} ${m.item.name}` : "—"}
                  </td>
                )}
                <td className={`${TD} whitespace-nowrap`}>
                  {m.warehouse ? m.warehouse.name : "—"}
                </td>
                <td className={`${TD} text-text-muted`}>
                  {m.is_reversal && (
                    <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      作廢沖回
                    </span>
                  )}
                  {m.line?.description ?? ""}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {m.qty > 0 ? formatQty(m.qty) : ""}
                </td>
                <td className={`${TD} text-right text-red-600 tabular-nums`}>
                  {m.qty < 0 ? formatQty(-m.qty) : ""}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatMoney(m.unit_cost, { decimals: 2 })}
                </td>
                {showBalance && (
                  <td
                    className={`${TD} text-ink text-right font-semibold tabular-nums`}
                  >
                    {formatQty(m.balance)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        base="/admin/erp/inventory/moves"
        params={{ item: item?.id, warehouse: warehouseId, from, to }}
        page={page}
        pageSize={INVENTORY_PAGE_SIZE}
        total={total}
      />
    </InventoryShell>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-muted text-[12px]">{label}</dt>
      <dd
        className={`tabular-nums ${strong ? "text-ink text-[18px] font-bold" : "text-ink"}`}
      >
        {formatQty(value)}
      </dd>
    </div>
  );
}
