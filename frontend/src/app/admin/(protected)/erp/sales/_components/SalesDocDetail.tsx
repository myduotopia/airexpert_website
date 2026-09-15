// 銷售單據明細頁（server component，報價 / 銷貨 / 銷退共用）：
// 表頭資訊、明細（含機號）、合計；銷貨單另顯示每行成本毛利（僅畫面）與保養卡機台連結；
// 來源單據與衍生單據連結；動作列（SalesDocActions）。
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { formatQty } from "@/lib/erp/format";
import {
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import {
  calcSaleMargins,
  getDocumentBrief,
  isSalesDocType,
  listDerivedDocuments,
  listMachineLinks,
  type DocumentBrief,
  type SalesDocType,
} from "@/lib/erp/queries/sales";
import type { TaxType } from "@/lib/erp/types";
import { SalesDocActions } from "./SalesDocActions";
import { SalesTabs } from "./SalesTabs";
import {
  maintenanceMachineHref,
  SALES_BASE_PATH,
  SALES_DOC_LABEL,
} from "./sales-config";

const TAX_LABEL: Record<TaxType, string> = {
  excluded: "外加稅",
  included: "內含稅",
  exempt: "免稅",
};

const CARD_LABEL = { compressor: "空壓機", filter: "過濾系統" } as const;

function briefHref(b: DocumentBrief): string | null {
  return isSalesDocType(b.doc_type)
    ? `${SALES_BASE_PATH[b.doc_type]}/${b.id}`
    : null;
}

export async function SalesDocDetail({
  docType,
  id,
}: {
  docType: SalesDocType;
  id: string;
}) {
  const res = await getDocumentWithLines(id);
  if (!res.ok || res.data.doc_type !== docType) notFound();
  const doc = res.data;
  const label = SALES_DOC_LABEL[docType];
  const basePath = SALES_BASE_PATH[docType];
  const isDraft = doc.status === "draft";
  const showCost = docType === "S" && !isDraft;

  const derivedType: SalesDocType | null =
    docType === "Q" ? "S" : docType === "S" ? "SR" : null;
  const [items, warehouses, source, derived, machineLinks] = await Promise.all([
    listItemOptions({ includeInactive: true }),
    listWarehouseOptions({ includeInactive: true }),
    doc.source_doc_id ? getDocumentBrief(doc.source_doc_id) : null,
    derivedType ? listDerivedDocuments(doc.id, derivedType) : [],
    docType === "S" && !isDraft
      ? listMachineLinks(doc.lines.map((l) => l.id))
      : [],
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const warehouse = warehouses.find((w) => w.id === doc.warehouse_id);
  const margins = showCost ? calcSaleMargins(doc) : null;
  const machinesBySerial = new Map(machineLinks.map((m) => [m.serial_id, m]));

  const info: [string, React.ReactNode][] = [
    ["客戶", doc.party_name ?? "—"],
    ["統一編號", doc.party_tax_id ?? "—"],
    ["聯絡人", doc.party_contact ?? "—"],
    ["電話", doc.party_phone ?? "—"],
    ["送貨地址", doc.party_address ?? "—"],
    ["單據日期", rocDate(doc.doc_date)],
  ];
  if (docType === "Q") info.push(["報價有效期限", rocDate(doc.expected_date)]);
  if (docType !== "Q") {
    info.push([
      docType === "S" ? "出庫倉" : "入庫倉",
      warehouse ? `${warehouse.code} ${warehouse.name}` : "—",
    ]);
  }
  info.push([
    "稅別",
    `${TAX_LABEL[doc.tax_type]}${doc.tax_type !== "exempt" ? `（${Math.round(Number(doc.tax_rate) * 10000) / 100}%）` : ""}`,
  ]);
  if (docType !== "Q") info.push(["發票號碼", doc.invoice_no ?? "—"]);
  info.push(["業務", doc.sales_rep ?? "—"]);
  if (source) {
    const href = briefHref(source);
    info.push([
      docType === "S" ? "來源報價單" : "來源銷貨單",
      href ? (
        <Link
          href={href}
          className="text-primary-deep font-mono hover:underline"
        >
          {source.doc_no ?? "（草稿）"}
        </Link>
      ) : (
        (source.doc_no ?? "—")
      ),
    ]);
  }
  if (doc.posted_at) info.push(["過帳時間", rocDateTime(doc.posted_at)]);

  const colCount = showCost ? 8 : 6;

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-4">
        <h1 className="text-ink text-[24px] font-bold">銷售</h1>
      </div>
      <SalesTabs active={docType} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={basePath}
          className="text-text-muted hover:text-ink text-[14px]"
        >
          ← {label}列表
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-ink text-[20px] font-bold">
          {label}{" "}
          <span className="font-mono">
            {doc.doc_no ?? "（草稿，過帳時取號）"}
          </span>
        </h2>
        <DocStatusBadge status={doc.status} />
      </div>

      <div className="mb-6">
        <SalesDocActions docId={doc.id} docType={docType} status={doc.status} />
      </div>

      {doc.status === "voided" && (
        <p className="mb-4 rounded-lg bg-gray-100 px-4 py-3 text-[14px] text-gray-600">
          已於 {rocDateTime(doc.voided_at)} 作廢，原因：{doc.void_reason ?? "—"}
        </p>
      )}

      <section className="border-border mb-6 rounded-xl border bg-white p-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k} className="flex min-w-0 gap-2">
              <dt className="text-text-muted shrink-0">{k}</dt>
              <dd className="text-ink min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        {doc.note && (
          <p className="text-ink mt-3 text-[14px] whitespace-pre-wrap">
            <span className="text-text-muted">備註　</span>
            {doc.note}
          </p>
        )}
      </section>

      <section className="mb-6">
        <h3 className="text-ink mb-2 text-[15px] font-semibold">明細</h3>
        <div className="border-border overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
              <tr>
                <th className="w-10 px-2 py-2 text-center font-medium">#</th>
                <th className="px-2 py-2 font-medium">產品編號</th>
                <th className="px-2 py-2 font-medium">品名規格</th>
                <th className="px-2 py-2 text-right font-medium">數量</th>
                <th className="px-2 py-2 text-right font-medium">單價</th>
                <th className="px-2 py-2 text-right font-medium">金額</th>
                {showCost && (
                  <>
                    <th className="px-2 py-2 text-right font-medium">成本</th>
                    <th className="px-2 py-2 text-right font-medium">毛利</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {doc.lines.length === 0 && (
                <tr>
                  <td
                    colSpan={colCount}
                    className="text-text-muted px-3 py-6 text-center"
                  >
                    尚無明細。
                  </td>
                </tr>
              )}
              {doc.lines.map((l, index) => {
                const item = l.item_id ? itemById.get(l.item_id) : null;
                if (l.line_type === "note") {
                  return (
                    <tr key={l.id} className="border-border border-t">
                      <td className="text-text-muted px-2 py-2 text-center tabular-nums">
                        {index + 1}
                      </td>
                      <td
                        colSpan={colCount - 1}
                        className="text-text-muted px-2 py-2 whitespace-pre-wrap"
                      >
                        {l.description}
                      </td>
                    </tr>
                  );
                }
                const m = margins?.lines[l.id];
                return (
                  <tr key={l.id} className="border-border border-t align-top">
                    <td className="text-text-muted px-2 py-2 text-center tabular-nums">
                      {index + 1}
                    </td>
                    <td className="px-2 py-2 font-mono text-[13px]">
                      {l.line_type === "discount"
                        ? "折扣"
                        : (item?.code ?? "—")}
                    </td>
                    <td className="px-2 py-2">
                      {l.description}
                      {l.serials.length > 0 && (
                        <ul className="text-text-muted mt-1 text-[12px]">
                          {l.serials.map((s) => {
                            const link = machinesBySerial.get(s.id);
                            return (
                              <li key={s.id}>
                                機號*
                                <span className="font-mono">{s.serial_no}</span>
                                {link?.machine && (
                                  <>
                                    {" "}
                                    →{" "}
                                    <Link
                                      href={maintenanceMachineHref(
                                        link.machine.id,
                                      )}
                                      className="text-primary-deep hover:underline"
                                    >
                                      保養卡
                                    </Link>
                                  </>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.line_type === "item" ? (
                        <>
                          {formatQty(Number(l.qty))}
                          {item?.unit ? ` ${item.unit}` : ""}
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {l.line_type === "item" && (
                        <MoneyText value={Number(l.unit_price)} decimals={2} />
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText
                        value={Number(l.amount)}
                        currency={doc.currency}
                        negativeRed
                      />
                    </td>
                    {showCost && (
                      <>
                        <td className="text-text-muted px-2 py-2 text-right">
                          {m ? <MoneyText value={m.cost} /> : ""}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {m ? <MoneyText value={m.margin} negativeRed /> : ""}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap justify-end gap-8">
          {margins && (
            <dl className="grid w-full max-w-[280px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[14px]">
              <dt className="text-text-muted">總成本</dt>
              <dd className="text-right">
                <MoneyText value={margins.totalCost} />
              </dd>
              <dt className="text-text-muted">毛利（未稅）</dt>
              <dd className="text-right">
                <MoneyText value={margins.grossMargin} negativeRed />
              </dd>
              <dt className="text-text-muted">毛利率</dt>
              <dd className="text-right tabular-nums">
                {margins.marginRate === null
                  ? "—"
                  : `${(margins.marginRate * 100).toFixed(1)}%`}
              </dd>
              <dd className="text-text-muted col-span-2 text-[12px]">
                成本 / 毛利僅供內部檢視，不列印。
              </dd>
            </dl>
          )}
          <dl className="grid w-full max-w-[280px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[14px]">
            <dt className="text-text-muted">合計（未稅）</dt>
            <dd className="text-right">
              <MoneyText
                value={Number(doc.amount_untaxed)}
                currency={doc.currency}
              />
            </dd>
            <dt className="text-text-muted">稅額</dt>
            <dd className="text-right">
              <MoneyText
                value={Number(doc.tax_amount)}
                currency={doc.currency}
              />
            </dd>
            <dt className="text-ink font-semibold">總計</dt>
            <dd className="text-ink text-right font-semibold">
              <MoneyText
                value={Number(doc.total_amount)}
                currency={doc.currency}
              />
            </dd>
          </dl>
        </div>
      </section>

      {docType === "S" && machineLinks.length > 0 && (
        <section className="border-border mb-6 rounded-xl border bg-white p-4">
          <h3 className="text-ink mb-2 text-[15px] font-semibold">
            保養卡機台
          </h3>
          {doc.status === "voided" && (
            <p className="text-text-muted mb-2 text-[13px]">
              本單已作廢：由本單建立且無保養紀錄的機台已刪除；以下為仍保留的機台。
            </p>
          )}
          <ul className="flex flex-col gap-1 text-[14px]">
            {machineLinks.map((m) => (
              <li key={`${m.line_id}-${m.serial_id}`}>
                <span className="font-mono">{m.serial_no ?? "—"}</span>
                {"　"}
                {m.machine ? (
                  <Link
                    href={maintenanceMachineHref(m.machine.id)}
                    className="text-primary-deep hover:underline"
                  >
                    {CARD_LABEL[m.machine.card_type] ?? "保養卡"}
                    {m.machine.model ? ` · ${m.machine.model}` : ""}
                  </Link>
                ) : (
                  <span className="text-text-muted">機台已不存在</span>
                )}
                <span className="text-text-muted ml-2 text-[12px]">
                  {m.created ? "（過帳時建立）" : "（連結既有機台）"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {derivedType && derived.length > 0 && (
        <section className="border-border mb-6 rounded-xl border bg-white p-4">
          <h3 className="text-ink mb-2 text-[15px] font-semibold">
            {derivedType === "S" ? "已轉銷貨單" : "銷退單"}
          </h3>
          <ul className="flex flex-col gap-1 text-[14px]">
            {derived.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3">
                <Link
                  href={`${SALES_BASE_PATH[derivedType]}/${d.id}`}
                  className="text-primary-deep font-mono hover:underline"
                >
                  {d.doc_no ?? "（草稿）"}
                </Link>
                <span className="text-text-muted">{rocDate(d.doc_date)}</span>
                <MoneyText
                  value={Number(d.total_amount)}
                  currency={d.currency}
                />
                <DocStatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
