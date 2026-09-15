// 調撥單 T / 盤點調整單 A 共用的頁面本體（列表 / 新增 / 編輯 / 詳情）。server components。
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import {
  DocStatusBadge,
  DOC_STATUS_LABEL,
} from "@/components/erp/DocStatusBadge";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { draftDocumentFromRow, newDraftDocument } from "@/lib/erp/draft";
import { formatMoney, formatQty } from "@/lib/erp/format";
import {
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { listStockDocuments } from "@/lib/erp/queries/inventory";
import { DOC_STATUSES } from "@/lib/erp/types";
import {
  deleteAdjustmentDraftAction,
  postAdjustmentAction,
  saveAdjustmentAction,
  voidAdjustmentAction,
} from "../../adjustments/actions";
import {
  deleteTransferDraftAction,
  postTransferAction,
  saveTransferAction,
  voidTransferAction,
} from "../../transfers/actions";
import { loadStockDocFormOptions } from "../_lib/form-data";
import { todayTaipeiIso, type StockDocType } from "../_lib/inventory-logic";
import {
  firstParam,
  parseEnum,
  parseIsoDate,
  parsePage,
  type SearchParamsRecord,
} from "../_lib/params";
import { DateRangeFields } from "./DateRangeFields";
import {
  InventoryShell,
  PRIMARY_LINK,
  SECONDARY_LINK,
  TABLE_WRAP,
  TD,
  TH,
} from "./InventoryShell";
import { Pager } from "./Pager";
import { StockDocActions } from "./StockDocActions";
import { StockDocForm } from "./StockDocForm";

const CONFIG = {
  T: {
    label: "調撥單",
    basePath: "/admin/erp/transfers",
    tab: "transfers",
    actions: {
      save: saveTransferAction,
      post: postTransferAction,
      void: voidTransferAction,
      delete: deleteTransferDraftAction,
    },
  },
  A: {
    label: "盤點調整單",
    basePath: "/admin/erp/adjustments",
    tab: "adjustments",
    actions: {
      save: saveAdjustmentAction,
      post: postAdjustmentAction,
      void: voidAdjustmentAction,
      delete: deleteAdjustmentDraftAction,
    },
  },
} as const;

function warehouseLabel(
  map: Map<string, { code: string; name: string }>,
  id: string | null,
): string {
  if (!id) return "—";
  const w = map.get(id);
  return w ? `${w.code} ${w.name}` : "—";
}

async function warehouseMap() {
  const list = await listWarehouseOptions({ includeInactive: true });
  return new Map(list.map((w) => [w.id, w]));
}

// ── 列表 ─────────────────────────────────────────────────────

export async function StockDocListPage({
  docType,
  searchParams,
}: {
  docType: StockDocType;
  searchParams: SearchParamsRecord;
}) {
  const cfg = CONFIG[docType];
  const status = parseEnum(searchParams.status, DOC_STATUSES);
  const q = firstParam(searchParams.q);
  const from = parseIsoDate(searchParams.from);
  const to = parseIsoDate(searchParams.to);
  const page = parsePage(searchParams.page);

  const [result, whMap] = await Promise.all([
    listStockDocuments({ docType, status, q, from, to, page }),
    warehouseMap(),
  ]);
  const filterParams = { status, q, from, to };

  return (
    <InventoryShell
      active={cfg.tab}
      actions={
        <Link href={`${cfg.basePath}/new`} className={PRIMARY_LINK}>
          新增{cfg.label}
        </Link>
      }
    >
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"
      >
        <div className="flex min-w-[200px] flex-col gap-1">
          <span className="text-text-muted text-[12px]">搜尋單號 / 備註</span>
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
            {DOC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DOC_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFields from={from ?? ""} to={to ?? ""} />
        <button type="submit" className={SECONDARY_LINK}>
          篩選
        </button>
        <Link
          href={cfg.basePath}
          className="text-text-muted hover:text-ink inline-flex h-10 items-center px-2 text-[14px]"
        >
          清除
        </Link>
      </form>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[720px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={TH}>單號</th>
              <th className={TH}>日期</th>
              {docType === "T" ? (
                <th className={TH}>來源倉 → 目的倉</th>
              ) : (
                <th className={TH}>倉庫</th>
              )}
              <th className={TH}>備註</th>
              <th className={TH}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  尚無{cfg.label}。
                </td>
              </tr>
            )}
            {result.rows.map((r) => (
              <tr key={r.id} className="border-border border-t">
                <td className={TD}>
                  <Link
                    href={`${cfg.basePath}/${r.id}`}
                    className="text-ink hover:text-primary-deep font-medium"
                  >
                    {r.doc_no ?? "（草稿）"}
                  </Link>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {rocDate(r.doc_date)}
                </td>
                <td className={TD}>
                  {docType === "T"
                    ? `${warehouseLabel(whMap, r.warehouse_id)} → ${warehouseLabel(whMap, r.to_warehouse_id)}`
                    : warehouseLabel(whMap, r.warehouse_id)}
                </td>
                <td className={`${TD} text-text-muted max-w-[320px] truncate`}>
                  {r.note ?? ""}
                </td>
                <td className={TD}>
                  <DocStatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        base={cfg.basePath}
        params={filterParams}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </InventoryShell>
  );
}

// ── 新增 / 編輯 ──────────────────────────────────────────────

export async function StockDocNewPage({ docType }: { docType: StockDocType }) {
  const cfg = CONFIG[docType];
  const options = await loadStockDocFormOptions();
  const defaultWarehouse = options.warehouses.find((w) => w.is_default);
  const initial = newDraftDocument(docType, todayTaipeiIso(), {
    warehouse_id: defaultWarehouse?.id ?? null,
  });
  return (
    <InventoryShell active={cfg.tab}>
      <h2 className="text-ink mb-3 text-[18px] font-bold">新增{cfg.label}</h2>
      <StockDocForm
        docType={docType}
        initial={initial}
        items={options.items}
        warehouses={options.warehouses}
        serials={options.serials}
        basePath={cfg.basePath}
        saveAction={cfg.actions.save}
        postAction={cfg.actions.post}
      />
    </InventoryShell>
  );
}

export async function StockDocEditPage({
  docType,
  id,
}: {
  docType: StockDocType;
  id: string;
}) {
  const cfg = CONFIG[docType];
  const res = await getDocumentWithLines(id);
  if (!res.ok || res.data.doc_type !== docType) notFound();
  if (res.data.status !== "draft") redirect(`${cfg.basePath}/${id}`);

  const referenced = res.data.lines
    .map((l) => l.item_id)
    .filter((v): v is string => Boolean(v));
  const options = await loadStockDocFormOptions(referenced);
  return (
    <InventoryShell active={cfg.tab}>
      <h2 className="text-ink mb-3 text-[18px] font-bold">
        編輯{cfg.label}（草稿）
      </h2>
      <StockDocForm
        docType={docType}
        initial={draftDocumentFromRow(res.data)}
        items={options.items}
        warehouses={options.warehouses}
        serials={options.serials}
        basePath={cfg.basePath}
        saveAction={cfg.actions.save}
        postAction={cfg.actions.post}
      />
    </InventoryShell>
  );
}

// ── 詳情 ─────────────────────────────────────────────────────

export async function StockDocDetailPage({
  docType,
  id,
}: {
  docType: StockDocType;
  id: string;
}) {
  const cfg = CONFIG[docType];
  const res = await getDocumentWithLines(id);
  if (!res.ok || res.data.doc_type !== docType) notFound();
  const doc = res.data;
  const [items, whMap] = await Promise.all([
    listItemOptions({ includeInactive: true }),
    warehouseMap(),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const posted = doc.status !== "draft";

  return (
    <InventoryShell active={cfg.tab}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={cfg.basePath}
            className="text-text-muted hover:text-ink text-[13px]"
          >
            ← {cfg.label}列表
          </Link>
          <h2 className="text-ink mt-1 flex items-center gap-2 text-[20px] font-bold">
            {cfg.label} {doc.doc_no ?? "（草稿）"}
            <DocStatusBadge status={doc.status} />
          </h2>
        </div>
        <StockDocActions
          id={doc.id}
          status={doc.status}
          editHref={`${cfg.basePath}/${doc.id}/edit`}
          listHref={cfg.basePath}
          postAction={cfg.actions.post}
          deleteAction={cfg.actions.delete}
          voidAction={cfg.actions.void}
        />
      </div>

      <dl className="border-border mb-5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border bg-white p-4 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
        <Info label="單據日期">{rocDate(doc.doc_date)}</Info>
        {docType === "T" ? (
          <>
            <Info label="來源倉">
              {warehouseLabel(whMap, doc.warehouse_id)}
            </Info>
            <Info label="目的倉">
              {warehouseLabel(whMap, doc.to_warehouse_id)}
            </Info>
          </>
        ) : (
          <Info label="倉庫">{warehouseLabel(whMap, doc.warehouse_id)}</Info>
        )}
        {doc.posted_at && (
          <Info label="過帳時間">{rocDateTime(doc.posted_at)}</Info>
        )}
        {doc.voided_at && (
          <Info label="作廢時間">{rocDateTime(doc.voided_at)}</Info>
        )}
        {doc.void_reason && <Info label="作廢原因">{doc.void_reason}</Info>}
        <div className="sm:col-span-2 lg:col-span-3">
          <Info label="備註">{doc.note ?? "—"}</Info>
        </div>
      </dl>

      <div className={TABLE_WRAP}>
        <table className="w-full min-w-[720px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={`${TH} w-10 text-center`}>#</th>
              <th className={TH}>品項</th>
              <th className={TH}>
                {docType === "A" ? "調整原因" : "品名規格"}
              </th>
              <th className={`${TH} text-right`}>
                {docType === "A" ? "調整數量" : "數量"}
              </th>
              {posted && <th className={`${TH} text-right`}>單位成本</th>}
              <th className={TH}>機號</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length === 0 && (
              <tr>
                <td
                  colSpan={posted ? 6 : 5}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  尚無明細。
                </td>
              </tr>
            )}
            {doc.lines.map((l, idx) => {
              if (l.line_type !== "item") {
                return (
                  <tr key={l.id} className="border-border border-t">
                    <td className={`${TD} text-text-muted text-center`}>
                      {idx + 1}
                    </td>
                    <td
                      colSpan={posted ? 5 : 4}
                      className={`${TD} text-text-muted`}
                    >
                      {l.description}
                    </td>
                  </tr>
                );
              }
              const item = l.item_id ? itemById.get(l.item_id) : undefined;
              const qty = Number(l.qty);
              const serialNos = l.serials.length
                ? l.serials.map((s) => s.serial_no)
                : (l.serial_nos ?? []);
              return (
                <tr key={l.id} className="border-border border-t">
                  <td className={`${TD} text-text-muted text-center`}>
                    {idx + 1}
                  </td>
                  <td className={TD}>
                    {item ? (
                      <>
                        <span className="font-medium">{item.code}</span>{" "}
                        <span className="text-text-muted">{item.name}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={TD}>{l.description ?? "—"}</td>
                  <td
                    className={`${TD} text-right tabular-nums ${
                      qty < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {docType === "A" && qty > 0 ? "+" : ""}
                    {formatQty(qty)} {item?.unit ?? ""}
                  </td>
                  {posted && (
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatMoney(l.unit_cost, { decimals: 2 })}
                    </td>
                  )}
                  <td className={`${TD} font-mono text-[13px]`}>
                    {serialNos.length ? serialNos.join("、") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </InventoryShell>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-text-muted text-[12px]">{label}</dt>
      <dd className="text-ink whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
