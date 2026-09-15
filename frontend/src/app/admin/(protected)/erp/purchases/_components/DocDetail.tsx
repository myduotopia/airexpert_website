import Link from "next/link";
import type { ReactNode } from "react";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import { formatQty } from "@/lib/erp/format";
import type { RelatedDocument } from "@/lib/erp/queries/purchasing";
import type {
  DocType,
  ErpDocumentWithLines,
  ItemOption,
  TaxType,
  WarehouseOption,
} from "@/lib/erp/types";

// 採購區單據明細頁的表頭摘要 + 明細表（server component）。

const TAX_LABEL: Record<TaxType, string> = {
  excluded: "外加",
  included: "內含",
  exempt: "免稅",
};

const DOC_PATH: Partial<Record<DocType, string>> = {
  P: "/admin/erp/purchases",
  I: "/admin/erp/receipts",
  PR: "/admin/erp/purchase-returns",
};

export function docLink(d: RelatedDocument): ReactNode {
  const base = DOC_PATH[d.doc_type as DocType];
  const label = `${DOC_TYPE_LABEL[d.doc_type as DocType] ?? d.doc_type} ${
    d.doc_no ?? "（草稿）"
  }`;
  return base ? (
    <Link
      href={`${base}/${d.id}`}
      className="text-primary-deep font-mono hover:underline"
    >
      {label}
    </Link>
  ) : (
    label
  );
}

export function DocHeaderSummary({
  doc,
  warehouses,
  source,
  extra,
}: {
  doc: ErpDocumentWithLines;
  warehouses: WarehouseOption[];
  source?: RelatedDocument | null;
  extra?: { label: string; value: ReactNode }[];
}) {
  const wh = warehouses.find((w) => w.id === doc.warehouse_id);
  const fields: { label: string; value: ReactNode }[] = [
    { label: "廠商", value: doc.party_name ?? "—" },
    { label: "聯絡人", value: doc.party_contact ?? "—" },
    { label: "電話", value: doc.party_phone ?? "—" },
    { label: "地址", value: doc.party_address ?? "—" },
    {
      label: doc.doc_type === "P" ? "採購日期" : "單據日期",
      value: rocDate(doc.doc_date),
    },
  ];
  if (doc.doc_type === "P") {
    fields.push({ label: "交貨日期", value: rocDate(doc.expected_date) });
  } else {
    fields.push({
      label: doc.doc_type === "I" ? "入庫倉" : "出庫倉",
      value: wh ? `${wh.code} ${wh.name}` : "—",
    });
    fields.push({ label: "發票號碼", value: doc.invoice_no ?? "—" });
  }
  fields.push(
    {
      label: "幣別 / 匯率",
      value: `${doc.currency} / ${Number(doc.exchange_rate)}`,
    },
    {
      label: "稅別",
      value:
        doc.tax_type === "exempt"
          ? TAX_LABEL.exempt
          : `${TAX_LABEL[doc.tax_type]} ${Math.round(Number(doc.tax_rate) * 10000) / 100}%`,
    },
  );
  if (source) fields.push({ label: "來源單據", value: docLink(source) });
  if (extra) fields.push(...extra);
  if (doc.posted_at) {
    fields.push({ label: "過帳時間", value: rocDateTime(doc.posted_at) });
  }
  if (doc.status === "voided") {
    fields.push(
      { label: "作廢時間", value: rocDateTime(doc.voided_at) },
      { label: "作廢原因", value: doc.void_reason ?? "—" },
    );
  }

  return (
    <section className="border-border rounded-xl border bg-white p-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-text-muted text-[12px]">{f.label}</dt>
            <dd className="text-ink break-words">{f.value}</dd>
          </div>
        ))}
        <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2 lg:col-span-3">
          <dt className="text-text-muted text-[12px]">備註</dt>
          <dd className="text-ink whitespace-pre-wrap">{doc.note ?? "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

export function DocTitle({ doc }: { doc: ErpDocumentWithLines }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-ink text-[24px] font-bold">
        {DOC_TYPE_LABEL[doc.doc_type]}{" "}
        <span className="font-mono">{doc.doc_no ?? "（草稿）"}</span>
      </h1>
      <DocStatusBadge status={doc.status} />
    </div>
  );
}

export interface LineProgress {
  received: number;
  remaining: number;
}

export function DocLinesTable({
  doc,
  items,
  progress,
  progressLabels = ["已到貨", "未到貨"],
}: {
  doc: ErpDocumentWithLines;
  items: ItemOption[];
  /** 依 line id 的進度（採購單：已到貨 / 未到貨）。 */
  progress?: Map<string, LineProgress> | null;
  progressLabels?: [string, string];
}) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const showProgress = !!progress;
  const cur = doc.currency;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-[16px] font-semibold">明細</h2>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b text-[13px]">
              <th className="w-10 px-3 py-2 text-center font-medium">#</th>
              <th className="px-3 py-2 font-medium">產品編號</th>
              <th className="px-3 py-2 font-medium">品名規格</th>
              <th className="px-3 py-2 text-right font-medium">數量</th>
              {showProgress && (
                <>
                  <th className="px-3 py-2 text-right font-medium">
                    {progressLabels[0]}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {progressLabels[1]}
                  </th>
                </>
              )}
              <th className="px-3 py-2 text-right font-medium">單價</th>
              <th className="px-3 py-2 text-right font-medium">金額</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length === 0 && (
              <tr>
                <td
                  colSpan={showProgress ? 8 : 6}
                  className="text-text-muted px-3 py-6 text-center"
                >
                  尚無明細
                </td>
              </tr>
            )}
            {doc.lines.map((l) => {
              const item = l.item_id ? itemById.get(l.item_id) : null;
              const serialNos = l.serials.length
                ? l.serials.map((s) => s.serial_no)
                : (l.serial_nos ?? []);
              const p = progress?.get(l.id);
              return (
                <tr
                  key={l.id}
                  className="border-border border-b align-top last:border-0"
                >
                  <td className="text-text-muted px-3 py-2 text-center tabular-nums">
                    {l.line_no}
                  </td>
                  <td className="px-3 py-2 font-mono text-[13px]">
                    {l.line_type === "item"
                      ? (item?.code ?? "—")
                      : l.line_type === "discount"
                        ? "折扣"
                        : ""}
                  </td>
                  <td className="px-3 py-2">
                    {l.description ?? ""}
                    {serialNos.length > 0 && (
                      <ul className="text-text-muted mt-1 font-mono text-[12px]">
                        {serialNos.map((s) => (
                          <li key={s}>機號*{s}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.line_type === "item"
                      ? `${formatQty(Number(l.qty))} ${item?.unit ?? ""}`
                      : ""}
                  </td>
                  {showProgress && (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p ? formatQty(p.received) : ""}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          p && p.remaining > 0 ? "text-amber-700" : ""
                        }`}
                      >
                        {p ? formatQty(p.remaining) : ""}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    {l.line_type === "item" ? (
                      <MoneyText value={Number(l.unit_price)} decimals={2} />
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {l.line_type === "note" ? (
                      ""
                    ) : (
                      <MoneyText
                        value={Number(l.amount)}
                        decimals={2}
                        negativeRed
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-full max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[14px]">
        <dt className="text-text-muted">合計金額</dt>
        <dd className="text-right">
          <MoneyText value={Number(doc.amount_untaxed)} currency={cur} />
        </dd>
        <dt className="text-text-muted">營業稅</dt>
        <dd className="text-right">
          <MoneyText value={Number(doc.tax_amount)} currency={cur} />
        </dd>
        <dt className="text-ink font-semibold">總計金額</dt>
        <dd className="text-ink text-right font-semibold">
          <MoneyText
            value={Number(doc.total_amount)}
            currency={cur}
            showCurrency={cur !== "TWD"}
          />
        </dd>
        {cur !== "TWD" && (
          <>
            <dt className="text-text-muted">折合台幣</dt>
            <dd className="text-right">
              <MoneyText value={Number(doc.total_twd)} currency="TWD" />
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

export function RelatedDocsList({
  title,
  docs,
}: {
  title: string;
  docs: RelatedDocument[];
}) {
  if (docs.length === 0) return null;
  return (
    <section className="border-border rounded-xl border bg-white p-4">
      <h2 className="text-ink mb-2 text-[15px] font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1 text-[14px]">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3">
            {docLink(d)}
            <span className="text-text-muted">{rocDate(d.doc_date)}</span>
            <DocStatusBadge
              status={d.status as ErpDocumentWithLines["status"]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
