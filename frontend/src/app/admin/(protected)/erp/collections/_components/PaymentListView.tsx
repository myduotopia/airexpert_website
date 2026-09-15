import Link from "next/link";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate } from "@/lib/admin/minguo";
import { listPayments } from "@/lib/erp/queries/ar-ap";
import { isIsoDate, PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type {
  CheckStatus,
  PaymentDirection,
  PaymentMethod,
} from "@/lib/erp/types";
import {
  CHECK_STATUS_LABEL,
  DIRECTION_META,
  PAYMENT_METHODS,
} from "./allocation";
import { PaymentListFilters } from "./PaymentListFilters";
import { PaymentTabs } from "./PaymentTabs";

export type PaymentSearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

// 收款 / 付款列表（server component）。收款頁與付款頁共用，以 direction 區分。
export async function PaymentListView({
  direction,
  searchParams,
}: {
  direction: PaymentDirection;
  searchParams: PaymentSearchParams;
}) {
  const meta = DIRECTION_META[direction];
  const q = one(searchParams.q);
  const from = isIsoDate(one(searchParams.from)) ? one(searchParams.from) : "";
  const to = isIsoDate(one(searchParams.to)) ? one(searchParams.to) : "";
  const methodRaw = one(searchParams.method);
  const method = PAYMENT_METHODS.includes(methodRaw as PaymentMethod)
    ? (methodRaw as PaymentMethod)
    : "";
  const checkRaw = one(searchParams.check);
  const check = Object.hasOwn(CHECK_STATUS_LABEL, checkRaw)
    ? (checkRaw as CheckStatus)
    : "";
  const page = Math.max(1, Number.parseInt(one(searchParams.page), 10) || 1);

  const res = await listPayments({
    direction,
    q,
    from: from || null,
    to: to || null,
    method: method || null,
    checkStatus: check || null,
    page,
  });

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (method) qs.set("method", method);
    if (check) qs.set("check", check);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${meta.basePath}?${s}` : meta.basePath;
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">收付款</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            {meta.label}登錄、沖銷
            {direction === "in" ? "銷貨 / 銷退" : "進貨 / 進退"}
            單據與支票票期管理。
          </p>
        </div>
        <Link
          href={`${meta.basePath}/new`}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          新增{meta.label}
        </Link>
      </div>
      <PaymentTabs active={direction} />
      <PaymentListFilters
        key={`${q}|${from}|${to}|${method}|${check}`}
        basePath={meta.basePath}
        initial={{ q, from, to, method, check }}
      />

      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : (
        <>
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-border text-text-muted border-b">
                  <th className="px-4 py-3 font-medium">單號</th>
                  <th className="px-4 py-3 font-medium">日期</th>
                  <th className="px-4 py-3 font-medium">{meta.partyLabel}</th>
                  <th className="px-4 py-3 font-medium">方式</th>
                  <th className="px-4 py-3 font-medium">票號 / 票期</th>
                  <th className="px-4 py-3 text-right font-medium">金額</th>
                  <th className="px-4 py-3 text-right font-medium">
                    未沖銷（{meta.unallocatedLabel}）
                  </th>
                  <th className="px-4 py-3 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {res.data.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-text-muted px-4 py-10 text-center"
                    >
                      沒有符合條件的{meta.label}。
                    </td>
                  </tr>
                ) : (
                  res.data.rows.map((r) => {
                    const voided = r.status === "voided";
                    return (
                      <tr
                        key={r.id}
                        className={`border-border border-b last:border-b-0 ${voided ? "text-text-muted line-through" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`${meta.basePath}/${r.id}`}
                            className="text-ink hover:text-primary-deep font-mono text-[13px] font-medium"
                          >
                            {r.doc_no ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {rocDate(r.pay_date)}
                        </td>
                        <td className="px-4 py-3">
                          {r.party_code && (
                            <span className="font-mono text-[12px]">
                              {r.party_code}{" "}
                            </span>
                          )}
                          {r.party_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {PAYMENT_METHOD_LABEL[r.method]}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                          {r.method === "check" ? (
                            <>
                              {r.check_no}
                              <br />
                              {rocDate(r.check_due_date)}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <MoneyText value={r.amount} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {voided ? (
                            "—"
                          ) : (
                            <MoneyText
                              value={r.unallocated}
                              className={
                                r.unallocated > 0 ? "font-semibold" : ""
                              }
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-[13px] whitespace-nowrap">
                          {voided ? (
                            <span className="no-underline">已作廢</span>
                          ) : r.check_status ? (
                            <span
                              className={
                                r.check_status === "bounced"
                                  ? "text-red-600"
                                  : ""
                              }
                            >
                              {CHECK_STATUS_LABEL[r.check_status]}
                            </span>
                          ) : (
                            "已過帳"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="text-text-muted mt-3 flex items-center justify-between text-[14px]">
            <span>
              共 {res.data.total} 筆，第 {res.data.page} /{" "}
              {Math.max(1, Math.ceil(res.data.total / res.data.pageSize))} 頁
            </span>
            <span className="flex gap-2">
              {res.data.page > 1 && (
                <Link
                  href={pageHref(res.data.page - 1)}
                  className="hover:text-ink"
                >
                  ← 上一頁
                </Link>
              )}
              {res.data.page * res.data.pageSize < res.data.total && (
                <Link
                  href={pageHref(res.data.page + 1)}
                  className="hover:text-ink"
                >
                  下一頁 →
                </Link>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
