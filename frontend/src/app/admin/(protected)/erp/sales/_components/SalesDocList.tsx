// 銷售單據列表（server component）：篩選、表格、分頁（每頁 50）。報價 / 銷貨 / 銷退三頁共用。
import Link from "next/link";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { MoneyText } from "@/components/erp/MoneyText";
import { listDocuments } from "@/lib/erp/documents";
import type { SalesDocType } from "@/lib/erp/queries/sales";
import { DOC_STATUSES, type DocStatus } from "@/lib/erp/types";
import { rocDate } from "@/lib/admin/minguo";
import { DocListFilters } from "./DocListFilters";
import { SalesTabs } from "./SalesTabs";
import { SALES_BASE_PATH, SALES_DOC_LABEL } from "./sales-config";

export type ListSearchParams = Record<string, string | string[] | undefined>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function parseListParams(sp: ListSearchParams) {
  const status = first(sp.status);
  const from = first(sp.from);
  const to = first(sp.to);
  const page = Number.parseInt(first(sp.page), 10);
  return {
    q: first(sp.q).slice(0, 100),
    status: (DOC_STATUSES as readonly string[]).includes(status)
      ? (status as DocStatus)
      : ("" as const),
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function pageHref(
  basePath: string,
  p: ReturnType<typeof parseListParams>,
  page: number,
): string {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.status) params.set("status", p.status);
  if (p.from) params.set("from", p.from);
  if (p.to) params.set("to", p.to);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export async function SalesDocList({
  docType,
  searchParams,
  description,
  newHref,
  newLabel,
}: {
  docType: SalesDocType;
  searchParams: ListSearchParams;
  description: string;
  newHref: string;
  newLabel: string;
}) {
  const basePath = SALES_BASE_PATH[docType];
  const p = parseListParams(searchParams);
  const res = await listDocuments({
    docType,
    status: p.status || null,
    q: p.q,
    from: p.from || null,
    to: p.to || null,
    page: p.page,
  });

  const rows = res.ok ? res.data.rows : [];
  const total = res.ok ? res.data.total : 0;
  const pageSize = res.ok ? res.data.pageSize : 50;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-[24px] font-bold">銷售</h1>
          <p className="text-text-muted mt-1 text-[14px]">{description}</p>
        </div>
        <Link
          href={newHref}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          {newLabel}
        </Link>
      </div>
      <SalesTabs active={docType} />
      <DocListFilters
        key={`${p.q}|${p.status}|${p.from}|${p.to}`}
        basePath={basePath}
        initial={{ q: p.q, status: p.status, from: p.from, to: p.to }}
      />

      {!res.ok && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700">
          {res.error}
        </p>
      )}

      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className="px-3 py-2 font-medium">單號</th>
              <th className="px-3 py-2 font-medium">日期</th>
              <th className="px-3 py-2 font-medium">客戶</th>
              <th className="px-3 py-2 text-right font-medium">總計</th>
              <th className="px-3 py-2 font-medium">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  沒有符合條件的{SALES_DOC_LABEL[docType]}。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-border border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`${basePath}/${r.id}`}
                    className="text-ink hover:text-primary-deep font-mono font-medium"
                  >
                    {r.doc_no ?? "（草稿）"}
                  </Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {rocDate(r.doc_date)}
                </td>
                <td className="px-3 py-2">{r.party_name ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <MoneyText
                    value={Number(r.total_amount)}
                    currency={r.currency}
                    negativeRed
                  />
                </td>
                <td className="px-3 py-2">
                  <DocStatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-text-muted mt-3 flex items-center justify-between text-[13px]">
        <span>
          共 {total} 筆，第 {Math.min(p.page, pageCount)} / {pageCount} 頁
        </span>
        <div className="flex gap-2">
          {p.page > 1 && (
            <Link
              href={pageHref(basePath, p, p.page - 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              上一頁
            </Link>
          )}
          {p.page < pageCount && (
            <Link
              href={pageHref(basePath, p, p.page + 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              下一頁
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
