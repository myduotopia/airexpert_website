import Link from "next/link";
import { notFound } from "next/navigation";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import {
  getPaymentDetail,
  listOutstandingDocuments,
  type RefundLinkDetail,
} from "@/lib/erp/queries/ar-ap";
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type { PaymentDirection } from "@/lib/erp/types";
import { AllocateMorePanel } from "./AllocateMorePanel";
import { canAllocateMore, DIRECTION_META, isOffsetAmount } from "./allocation";
import { CheckStatusControl } from "./CheckStatusControl";
import { PaymentTabs } from "./PaymentTabs";
import { VoidPaymentForm } from "./VoidPaymentForm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 退款來源／被退款明細表（#249）。 */
function RefundLinkTable({
  links,
  basePath,
  emptyText,
  docLabel,
}: {
  links: RefundLinkDetail[];
  basePath: string;
  emptyText: string;
  docLabel: string;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-xl border bg-white">
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-border text-text-muted border-b">
            <th className="px-4 py-3 font-medium">{docLabel}</th>
            <th className="px-4 py-3 font-medium">日期</th>
            <th className="px-4 py-3 font-medium">建立時間</th>
            <th className="px-4 py-3 text-right font-medium">金額</th>
          </tr>
        </thead>
        <tbody>
          {links.length === 0 ? (
            <tr>
              <td colSpan={4} className="text-text-muted px-4 py-8 text-center">
                {emptyText}
              </td>
            </tr>
          ) : (
            links.map((l) => (
              <tr key={l.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3">
                  {l.payment_id ? (
                    <Link
                      href={`${basePath}/${l.payment_id}`}
                      className="text-ink hover:text-primary-deep font-mono text-[13px]"
                    >
                      {l.doc_no ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {l.offset && (
                    <span className="text-text-muted ml-2 text-[12px]">
                      沖抵單
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{rocDate(l.pay_date)}</td>
                <td className="px-4 py-3">{rocDateTime(l.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <MoneyText value={l.amount} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// 收付款詳情（server component）：基本資料、沖銷明細、補沖銷、支票狀態、作廢。
// 退款單（#249）：改列「退款來源」（扣減哪些收付款的預收／預付），不可沖銷。
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
  const refund = p.kind === "refund";
  const offset = !refund && isOffsetAmount(p.amount);
  const title = refund ? meta.refundLabel : offset ? "沖抵單" : meta.label;
  // 預收／預付為 0 時不顯示補沖銷（#241 A-8），也不必查未沖銷單據。
  const showAllocateMore = canAllocateMore(p);
  const partyId = direction === "in" ? p.customer_id : p.vendor_id;
  const outstanding =
    showAllocateMore && partyId
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
            {title} <span className="font-mono">{p.doc_no}</span>
          </h1>
          {offset && (
            <p className="text-text-muted mt-1 text-[13px]">
              0 元沖抵單：以{meta.creditLabel}單沖抵{meta.debitLabel}
              單；沖銷合計為負時，多出的貸項轉為{meta.unallocatedLabel}。
            </p>
          )}
          {refund && (
            <p className="text-text-muted mt-1 text-[13px]">
              {direction === "in" ? "從客戶預收退款給客戶" : "廠商退還預付款"}
              ；依日期先後扣減下列來源的{meta.unallocatedLabel}。
            </p>
          )}
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
          {field("方式", offset ? "沖抵" : PAYMENT_METHOD_LABEL[p.method])}
          {field("銀行", p.bank ?? "—")}
          {field(
            refund ? "退款金額" : "金額",
            <MoneyText value={p.amount} className="font-semibold" />,
          )}
          {!refund &&
            field("已沖銷", <MoneyText value={p.allocated} negativeRed />)}
          {!refund &&
            p.refunded > 0 &&
            field("已退款", <MoneyText value={p.refunded} />)}
          {!refund &&
            field(
              `未沖銷（${meta.unallocatedLabel}）`,
              posted ? (
                <MoneyText value={p.unallocated} className="font-semibold" />
              ) : (
                "—"
              ),
            )}
          {field("建立時間", rocDateTime(p.created_at))}
          {p.method === "check" && field("票號", p.check_no ?? "—")}
          {p.method === "check" &&
            field("到期日（票期）", rocDate(p.check_due_date))}
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
              refund={refund}
            />
          </div>
        )}
      </section>

      {refund && (
        <section className="mt-6">
          <h2 className="text-ink mb-3 text-[16px] font-bold">
            退款來源（扣減的{meta.unallocatedLabel}）
          </h2>
          <RefundLinkTable
            links={p.refundSources}
            basePath={meta.basePath}
            docLabel="來源單號"
            emptyText={
              posted
                ? "沒有來源。"
                : `作廢時已一併還原${meta.unallocatedLabel}。`
            }
          />
        </section>
      )}

      {!refund && p.refundedBy.length > 0 && (
        <section className="mt-6">
          <h2 className="text-ink mb-3 text-[16px] font-bold">
            {meta.unallocatedLabel}已退款
          </h2>
          <RefundLinkTable
            links={p.refundedBy}
            basePath={meta.basePath}
            docLabel="退款單號"
            emptyText=""
          />
        </section>
      )}

      {!refund && (
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
      )}

      {showAllocateMore && (
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
            refund={refund}
          />
        </section>
      )}
    </div>
  );
}
