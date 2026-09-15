import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { formatMoney, formatQty } from "@/lib/erp/format";
import {
  getStockMatrixData,
  INVENTORY_PAGE_SIZE,
} from "@/lib/erp/queries/inventory";
import type { ItemKind } from "@/lib/erp/types";
import {
  InventoryShell,
  PRIMARY_LINK,
  SECONDARY_LINK,
  TABLE_WRAP,
  TD,
  TH,
} from "./_components/InventoryShell";
import { Pager } from "./_components/Pager";
import { buildStockMatrix, ITEM_KIND_LABEL } from "./_lib/inventory-logic";
import {
  firstParam,
  parseEnum,
  parsePage,
  withParams,
  type SearchParamsRecord,
} from "./_lib/params";

export const metadata = { title: "庫存 · ERP · 後台" };

/** 追蹤庫存的類別（服務 / 費用不追蹤庫存）。 */
const STOCK_KINDS: ItemKind[] = ["machine", "part"];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const kind = parseEnum(sp.kind, STOCK_KINDS);
  const warehouseParam = firstParam(sp.warehouse);
  const onlyLow = firstParam(sp.low) === "1";
  const q = firstParam(sp.q);
  const page = parsePage(sp.page);

  const data = await getStockMatrixData();
  const rows = buildStockMatrix(data.items, data.levels, { kind, onlyLow, q });

  const warehouseWithStock = new Set(
    data.levels.filter((l) => l.qty !== 0).map((l) => l.warehouse_id),
  );
  const selectedWarehouse =
    data.warehouses.find((w) => w.id === warehouseParam) ?? null;
  const columns = selectedWarehouse
    ? [selectedWarehouse]
    : data.warehouses.filter((w) => w.active || warehouseWithStock.has(w.id));

  const lowCount = rows.filter((r) => r.low).length;
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const start = (page - 1) * INVENTORY_PAGE_SIZE;
  const pageRows = rows.slice(start, start + INVENTORY_PAGE_SIZE);
  const filterParams = {
    kind,
    warehouse: selectedWarehouse?.id,
    low: onlyLow ? "1" : null,
    q,
  };

  return (
    <InventoryShell
      active="levels"
      description="各倉存量、平均成本（全公司移動加權）與庫存金額；總量低於安全存量標紅。"
      actions={
        <>
          <Link href="/admin/erp/transfers/new" className={SECONDARY_LINK}>
            新增調撥單
          </Link>
          <Link href="/admin/erp/adjustments/new" className={PRIMARY_LINK}>
            新增盤點調整
          </Link>
        </>
      }
    >
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"
      >
        <div className="flex min-w-[200px] flex-col gap-1">
          <span className="text-text-muted text-[12px]">
            搜尋品項代碼 / 名稱
          </span>
          <input name="q" defaultValue={q} className={ERP_INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-text-muted text-[12px]">類別</span>
          <select name="kind" defaultValue={kind ?? ""} className={ERP_SELECT}>
            <option value="">全部</option>
            {STOCK_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-text-muted text-[12px]">倉庫</span>
          <select
            name="warehouse"
            defaultValue={selectedWarehouse?.id ?? ""}
            className={ERP_SELECT}
          >
            <option value="">全部倉庫</option>
            {data.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} {w.name}
                {w.active ? "" : "（停用）"}
              </option>
            ))}
          </select>
        </div>
        <label className="text-ink flex h-10 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="low"
            value="1"
            defaultChecked={onlyLow}
          />
          只看低庫存
        </label>
        <button type="submit" className={SECONDARY_LINK}>
          篩選
        </button>
        <Link
          href="/admin/erp/inventory"
          className="text-text-muted hover:text-ink inline-flex h-10 items-center px-2 text-[14px]"
        >
          清除
        </Link>
      </form>

      <p className="text-text-muted mb-2 text-[13px]">
        共 {rows.length} 個品項
        {lowCount > 0 && (
          <span className="ml-2 font-semibold text-red-600">
            低庫存 {lowCount} 項
          </span>
        )}
        <span className="ml-2">庫存金額合計 NT$ {formatMoney(totalValue)}</span>
        {selectedWarehouse && (
          <span className="ml-2">
            （倉庫欄只顯示 {selectedWarehouse.name}；總量與低庫存以全倉計）
          </span>
        )}
      </p>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[860px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={TH}>代碼</th>
              <th className={TH}>品名</th>
              <th className={TH}>類別</th>
              {columns.map((w) => (
                <th key={w.id} className={`${TH} text-right`}>
                  {w.name}
                </th>
              ))}
              <th className={`${TH} text-right`}>總量</th>
              <th className={`${TH} text-right`}>安全存量</th>
              <th className={`${TH} text-right`}>平均成本</th>
              <th className={`${TH} text-right`}>庫存金額</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={7 + columns.length}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  沒有符合條件的品項。
                </td>
              </tr>
            )}
            {pageRows.map((r) => (
              <tr
                key={r.id}
                className={`border-border border-t ${r.low ? "bg-red-50" : ""}`}
              >
                <td className={`${TD} whitespace-nowrap`}>
                  <Link
                    href={withParams("/admin/erp/inventory/moves", {
                      item: r.id,
                    })}
                    className="text-ink hover:text-primary-deep font-medium"
                  >
                    {r.code}
                  </Link>
                </td>
                <td className={TD}>
                  {r.name}
                  {!r.active && (
                    <span className="text-text-muted ml-1 text-[12px]">
                      （停用）
                    </span>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {ITEM_KIND_LABEL[r.kind]}
                </td>
                {columns.map((w) => {
                  const qty = r.qtyByWarehouse[w.id] ?? 0;
                  return (
                    <td key={w.id} className={`${TD} text-right tabular-nums`}>
                      {qty === 0 ? (
                        <span className="text-text-muted">0</span>
                      ) : (
                        <Link
                          href={withParams("/admin/erp/inventory/moves", {
                            item: r.id,
                            warehouse: w.id,
                          })}
                          className="hover:text-primary-deep"
                        >
                          {formatQty(qty)}
                        </Link>
                      )}
                    </td>
                  );
                })}
                <td
                  className={`${TD} text-right font-semibold tabular-nums ${
                    r.low ? "text-red-600" : "text-ink"
                  }`}
                >
                  {formatQty(r.total)} {r.unit}
                  {r.low && (
                    <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium">
                      低庫存
                    </span>
                  )}
                </td>
                <td className={`${TD} text-text-muted text-right tabular-nums`}>
                  {formatQty(r.safety_stock)}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatMoney(r.avg_cost, { decimals: 2 })}
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatMoney(r.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        base="/admin/erp/inventory"
        params={filterParams}
        page={page}
        pageSize={INVENTORY_PAGE_SIZE}
        total={rows.length}
      />
    </InventoryShell>
  );
}
