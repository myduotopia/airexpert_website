import Link from "next/link";
import { hasMaintenanceAccess, requireModule } from "@/lib/admin/auth";
import { GatedLink, PermissionHint } from "@/components/erp/GatedLink";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import { maintenanceMachineHref } from "@/lib/erp/admin-links";
import { formatMoney } from "@/lib/erp/format";
import { listWarehouseOptions } from "@/lib/erp/queries/pickers";
import {
  listSerials,
  type SerialDocRef,
  type SerialListRow,
} from "@/lib/erp/queries/inventory";
import type { SerialStatus } from "@/lib/erp/types";
import {
  InventoryShell,
  SECONDARY_LINK,
  TABLE_WRAP,
  TD,
  TH,
} from "../_components/InventoryShell";
import { Pager } from "../_components/Pager";
import {
  docHref,
  SERIAL_STATUS_LABEL,
  serialDocColumn,
} from "../_lib/inventory-logic";
import {
  firstParam,
  parseEnum,
  parsePage,
  type SearchParamsRecord,
} from "../_lib/params";

export const metadata = { title: "機號清單 · ERP · 後台" };

const STATUSES = Object.keys(SERIAL_STATUS_LABEL) as SerialStatus[];

const STATUS_CLASS: Record<SerialStatus, string> = {
  in_stock: "bg-primary/10 text-primary-deep",
  sold: "bg-sky-100 text-sky-700",
  returned_to_vendor: "bg-amber-100 text-amber-700",
  written_off: "bg-gray-100 text-gray-500",
};

function DocLink({ doc }: { doc: SerialDocRef | null }) {
  if (!doc) return <span className="text-text-muted">—</span>;
  return (
    <Link
      href={docHref(doc.doc_type, doc.id)}
      className="hover:text-primary-deep whitespace-nowrap"
      title={DOC_TYPE_LABEL[doc.doc_type]}
    >
      {doc.doc_no ?? DOC_TYPE_LABEL[doc.doc_type]}
      {doc.status === "voided" && (
        <span className="text-text-muted ml-1 text-[12px]">（作廢）</span>
      )}
    </Link>
  );
}

/**
 * 出庫單欄（B-06）：非在庫顯示出庫單；在庫不顯示出庫單（銷退回庫時 DB 仍保留原銷貨單供作廢還原），
 * 改以「最後異動」標示回庫／調撥的單據。
 */
function OutDocCell({ serial }: { serial: SerialListRow }) {
  const col = serialDocColumn(serial, serial.last_move);
  if (!col) return <span className="text-text-muted">—</span>;
  if (col.kind === "out") return <DocLink doc={col.doc} />;
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-text-muted text-[12px]">
        最後異動・{DOC_TYPE_LABEL[col.doc.doc_type]}
      </span>
      <DocLink doc={col.doc} />
    </span>
  );
}

export default async function SerialsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const status = parseEnum(sp.status, STATUSES);
  const warehouseId = firstParam(sp.warehouse) || null;
  const itemId = firstParam(sp.item) || null;
  const q = firstParam(sp.q);
  const page = parsePage(sp.page);

  // 保養卡欄：有保養卡權限才可點（#283）；沒有權限時只顯示文字，欄名旁提示一次。
  const [result, warehouses, canOpenMaintenance] = await Promise.all([
    listSerials({ status, warehouseId, itemId, q, page }),
    listWarehouseOptions({ includeInactive: true }),
    hasMaintenanceAccess(),
  ]);

  return (
    <InventoryShell
      active="serials"
      description="逐台機號的狀態、所在倉庫或客戶，以及入庫 / 出庫單據；在庫機號顯示最後異動（如銷退、調撥）。"
    >
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"
      >
        {itemId && <input type="hidden" name="item" value={itemId} />}
        <div className="flex min-w-[220px] flex-col gap-1">
          <span className="text-text-muted text-[12px]">
            搜尋機號 / 品項代碼 / 名稱
          </span>
          <input name="q" defaultValue={q} className={ERP_INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-text-muted text-[12px]">狀態</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className={ERP_SELECT}
          >
            <option value="">全部</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {SERIAL_STATUS_LABEL[s]}
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
        <button type="submit" className={SECONDARY_LINK}>
          篩選
        </button>
        <Link
          href="/admin/erp/inventory/serials"
          className="text-text-muted hover:text-ink inline-flex h-10 items-center px-2 text-[14px]"
        >
          清除
        </Link>
      </form>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[960px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={TH}>機號</th>
              <th className={TH}>品項</th>
              <th className={TH}>狀態</th>
              <th className={TH}>所在倉庫 / 客戶</th>
              <th className={TH}>入庫單</th>
              <th className={TH}>出庫單 / 最後異動</th>
              <th className={`${TH} text-right`}>進貨成本</th>
              <th className={TH}>
                保養卡
                {!canOpenMaintenance && <PermissionHint />}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  沒有符合條件的機號。
                </td>
              </tr>
            )}
            {result.rows.map((s) => (
              <tr key={s.id} className="border-border border-t">
                <td className={`${TD} font-mono text-[13px]`}>{s.serial_no}</td>
                <td className={TD}>
                  {s.item ? (
                    <>
                      <span className="font-medium">{s.item.code}</span>{" "}
                      <span className="text-text-muted">{s.item.name}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={TD}>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${STATUS_CLASS[s.status]}`}
                  >
                    {SERIAL_STATUS_LABEL[s.status]}
                  </span>
                </td>
                <td className={TD}>
                  {s.status === "in_stock" && s.warehouse
                    ? `${s.warehouse.code} ${s.warehouse.name}`
                    : s.status === "sold" && s.customer
                      ? s.customer.name
                      : "—"}
                </td>
                <td className={TD}>
                  <DocLink doc={s.in_doc} />
                </td>
                <td className={TD}>
                  <OutDocCell serial={s} />
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {formatMoney(
                    s.unit_cost === null ? null : Number(s.unit_cost),
                    { decimals: 2 },
                  )}
                </td>
                <td className={TD}>
                  {s.mx_machine_id ? (
                    <GatedLink
                      href={maintenanceMachineHref(s.mx_machine_id)}
                      allowed={canOpenMaintenance}
                      className="text-primary-deep hover:underline"
                    >
                      機台
                    </GatedLink>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        base="/admin/erp/inventory/serials"
        params={{ status, warehouse: warehouseId, item: itemId, q }}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </InventoryShell>
  );
}
