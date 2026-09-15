import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import {
  getPaymentDetail,
  listOutstandingDocuments,
} from "@/lib/erp/queries/ar-ap";
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type { PaymentDirection } from "@/lib/erp/types";
import { AllocateMorePanel } from "./AllocateMorePanel";
import { DIRECTION_META } from "./allocation";
import { CheckStatusControl } from "./CheckStatusControl";
import { PaymentTabs } from "./PaymentTabs";
import { VoidPaymentForm } from "./VoidPaymentForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 收付款詳情（server component）：基本資料、沖銷明細、補沖銷、支票狀態、作廢。
export async function PaymentDetailView({
  direction,
  id,
}: {
  direction: PaymentDirection;
  id: string;
}) {
  if (!UUID.test(id)) notFound();
  const meta = DIRECTION_META[direction];
  const res = await getPaymentDetail(id);
  if (!res.ok) {
    return (
      <p role="alert" className="text-[14px] text-red-600">
        {res.error}
      </p>
    );
  }
  const p = res.data;
  if (!p || p.direction !== direction) notFound();

  const posted = p.status === "posted";
  const partyId = direction === "in" ? p.customer_id : p.vendor_id;
  const outstanding =
    posted && partyId
      ? await listOutstandingDocuments(direction, partyId)
      : null;

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-text-muted text-[12px]">{label}</dt>
      <dd className="text-ink mt-0.5 text-[14px]">{value}</dd>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1040px]">
      <PaymentTabs active={direction} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={meta.basePath}
            className="text-text-muted hover:text-ink text-[13px]"
          >
            ← {meta.label}列表
          </Link>
          <h1
            className={`text-ink mt-1 text-[24px] font-bold ${posted ? "" : "line-through"}`}
          >
            {meta.label} <span className="font-mono">{p.doc_no}</span>
          </h1>
        </div>
        {!posted && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-[13px] font-semibold text-red-600">
            已作廢
          </span>
        )}
      </div>

      {!posted && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700">
          作廢於 {rocDateTime(p.voided_at)}；原因：{p.void_reason ?? "—"}
        </p>
      )}

      <section className="border-border rounded-xl border bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          {field(
            meta.partyLabel,
            <>
              {p.party_code && (
                <span className="font-mono text-[13px]">{p.party_code} </span>
              )}
              {p.party_name ?? "—"}
            </>,
          )}
          {field("日期", rocDate(p.pay_date))}
          {field("方式", PAYMENT_METHOD_LABEL[p.method])}
          {field("銀行", p.bank ?? "—")}
          {field(
            "金額",
            <MoneyText value={p.amount} className="font-semibold" />,
          )}
          {field("已沖銷", <MoneyText value={p.allocated} />)}
          {field(
            `未沖銷（${meta.unallocatedLabel}）`,
            posted ? (
              <MoneyText value={p.unallocated} className="font-semibold" />
            ) : (
              "—"
            ),
          )}
          {field("建立時間", rocDateTime(p.created_at))}
          {p.method === "check" && field("票號", p.check_no ?? "—")}
          {p.method === "check" && field("票期", rocDate(p.check_due_date))}
          {p.note && (
            <div className="sm:col-span-2 md:col-span-4">
              <dt className="text-text-muted text-[12px]">備註</dt>
              <dd className="text-ink mt-0.5 text-[14px] whitespace-pre-wrap">
                {p.note}
              </dd>
            </div>
          )}
        </dl>
        {p.method === "check" && (
          <div className="border-border mt-4 border-t pt-4">
            <CheckStatusControl
              paymentId={p.id}
              direction={direction}
              status={p.check_status}
              disabled={!posted}
            />
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-ink mb-3 text-[16px] font-bold">沖銷明細</h2>
        <div className="border-border overflow-x-auto rounded-xl border bg-white">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-border text-text-muted border-b">
                <th className="px-4 py-3 font-medium">單號</th>
                <th className="px-4 py-3 font-medium">單別</th>
                <th className="px-4 py-3 font-medium">單據日期</th>
                <th className="px-4 py-3 font-medium">沖銷時間</th>
                <th className="px-4 py-3 text-right font-medium">沖銷金額</th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-text-muted px-4 py-8 text-center"
                  >
                    {posted ? "尚未沖銷任何單據。" : "作廢時沖銷已一併取消。"}
                  </td>
                </tr>
              ) : (
                p.allocations.map((a) => (
                  <tr
                    key={a.id}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-4 py-3 font-mono text-[13px]">
                      {a.doc_no ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {a.doc_type ? DOC_TYPE_LABEL[a.doc_type] : "—"}
                    </td>
                    <td className="px-4 py-3">{rocDate(a.doc_date)}</td>
                    <td className="px-4 py-3">{rocDateTime(a.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <MoneyText value={a.amount} negativeRed />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {posted && (
        <section className="mt-6">
          <h2 className="text-ink mb-1 text-[16px] font-bold">補沖銷</h2>
          <p className="text-text-muted mb-3 text-[13px]">
            將未沖銷的{meta.unallocatedLabel}{" "}
            <MoneyText value={p.unallocated} /> 沖到{meta.partyLabel}
            的未沖銷單據。
          </p>
          {outstanding && !outstanding.ok ? (
            <p role="alert" className="text-[14px] text-red-600">
              {outstanding.error}
            </p>
          ) : (
            <AllocateMorePanel
              paymentId={p.id}
              direction={direction}
              docs={outstanding?.ok ? outstanding.data : []}
              capacity={p.unallocated}
              remainingLabel={meta.unallocatedLabel}
            />
          )}
        </section>
      )}

      {posted && (
        <section className="mt-8 flex justify-end">
          <VoidPaymentForm
            paymentId={p.id}
            direction={direction}
            docNo={p.doc_no}
          />
        </section>
      )}
    </div>
  );
}
