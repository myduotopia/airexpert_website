"use client";
// 退款給客戶（RF）／廠商退款（VR）表單（#249）。選完對象後讀出目前預收（預付）與來源；
// 送出：前端檢核一次列出所有錯誤 → 頁內確認框（對象、金額、方式、退款前後餘額）→ 過帳。
// 來源由 DB 依日期先後自動扣減（erp_post_refund），這裡只列出供參考。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  useConfirm,
  type ConfirmOptions,
} from "@/components/erp/ConfirmDialog";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { ErrorList } from "@/components/erp/ErrorList";
import { MoneyText } from "@/components/erp/MoneyText";
import { NumberInput } from "@/components/erp/NumberInput";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { VendorPicker } from "@/components/erp/VendorPicker";
import { ERP_AREA, ERP_INPUT, ERP_LABEL } from "@/components/erp/styles";
import { rocDate } from "@/lib/admin/minguo";
import type { PrepaidSummary } from "@/lib/erp/queries/ar-ap";
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type {
  CustomerOption,
  PaymentDirection,
  PaymentMethod,
  VendorOption,
} from "@/lib/erp/types";
import { createRefundAction, loadPrepaidAction } from "./actions";
import { DIRECTION_META, NETWORK_ERROR } from "./allocation";
import {
  collectRefundErrors,
  refundConfirmSummary,
  refundVerb,
  REFUND_METHODS,
  type RefundConfirmSummary,
} from "./refund";

function refundConfirmOptions(s: RefundConfirmSummary): ConfirmOptions {
  return {
    title: s.title,
    confirmLabel: s.confirmLabel,
    message: (
      <div className="text-ink space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-text-muted text-[12px]">{s.amountLabel}</p>
          <p className="text-[28px] leading-tight font-bold tabular-nums">
            {s.amountText}
          </p>
          {s.amountHint && (
            <p className="text-[13px] font-semibold text-amber-800">
              {s.amountHint}
            </p>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          {s.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-text-muted">{d.label}</dt>
              <dd className="min-w-0 break-words">{d.value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-border border-t pt-2 text-[13px]">
          {s.prepaidLabel}餘額{" "}
          <span className="font-semibold tabular-nums">
            {s.prepaidBeforeText}
          </span>{" "}
          →{" "}
          <span className="font-semibold tabular-nums">
            {s.prepaidAfterText}
          </span>
        </p>
        <p className="text-text-muted text-[12px]">
          過帳後不可修改，如有錯誤需作廢重開（作廢後{s.prepaidLabel}還原）。
        </p>
      </div>
    ),
  };
}

export function RefundForm({
  direction,
  customers = [],
  vendors = [],
  today,
}: {
  direction: PaymentDirection;
  customers?: CustomerOption[];
  vendors?: VendorOption[];
  today: string;
}) {
  const meta = DIRECTION_META[direction];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();

  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyLabel, setPartyLabel] = useState<string | null>(null);
  const [prepaid, setPrepaid] = useState<PrepaidSummary | null>(null);
  const [payDate, setPayDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [amount, setAmount] = useState(0);
  const [checkNo, setCheckNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [bank, setBank] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [askConfirm, confirmDialog] = useConfirm();

  function selectParty(
    id: string | null,
    party: { code?: string | null; name?: string | null } | null,
  ) {
    setPartyId(id);
    setPartyLabel(
      party ? [party.code, party.name].filter(Boolean).join(" ") : null,
    );
    setPrepaid(null);
    setAmount(0);
    setErrors([]);
    if (!id) return;
    startLoading(async () => {
      let res: Awaited<ReturnType<typeof loadPrepaidAction>>;
      try {
        res = await loadPrepaidAction(direction, id);
      } catch (err) {
        unstable_rethrow(err);
        setErrors([NETWORK_ERROR]);
        return;
      }
      if (!res.ok) {
        setErrors([res.error]);
        return;
      }
      setPrepaid(res.data);
      // 預設全額退款（可改小）
      setAmount(res.data.total);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const input = {
      direction,
      pay_date: payDate,
      party_id: partyId,
      method,
      amount,
      check_no: checkNo,
      check_due_date: dueDate,
      bank,
      note,
    };
    const bad = collectRefundErrors(input, prepaid?.total ?? 0);
    if (bad.length > 0) {
      setErrors(bad);
      return;
    }
    const ok = await askConfirm(
      refundConfirmOptions(
        refundConfirmSummary({
          direction,
          partyLabel,
          payDate,
          amount,
          method,
          checkNo,
          checkDueDate: dueDate,
          bank,
          prepaid: prepaid?.total ?? 0,
        }),
      ),
    );
    if (!ok) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof createRefundAction>>;
      try {
        res = await createRefundAction(input);
      } catch (err) {
        unstable_rethrow(err);
        setErrors([NETWORK_ERROR]);
        return;
      }
      if (!res.ok) {
        setErrors([res.error]);
        return;
      }
      router.push(`${meta.basePath}/${res.data.id}`);
    });
  }

  const busy = pending || loading;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="border-border grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <label className={ERP_LABEL}>{meta.partyLabel}</label>
          {direction === "in" ? (
            <CustomerPicker
              options={customers}
              value={partyId}
              onChange={(id, party) => selectParty(id, party)}
              disabled={pending}
              required
            />
          ) : (
            <VendorPicker
              options={vendors}
              value={partyId}
              onChange={(id, party) => selectParty(id, party)}
              disabled={pending}
              required
            />
          )}
        </div>
        <div className="space-y-1.5">
          <span className={ERP_LABEL}>退款日期</span>
          <RocDateInput
            value={payDate}
            onChange={setPayDate}
            disabled={pending}
            aria-label="退款日期"
          />
        </div>
        <fieldset className="space-y-1.5">
          <legend className={`${ERP_LABEL} mb-1.5`}>方式</legend>
          <div className="flex flex-wrap gap-2">
            {REFUND_METHODS.map((m) => (
              <label
                key={m}
                className={`has-[:focus-visible]:ring-primary inline-flex h-10 cursor-pointer items-center rounded-lg border px-4 text-[14px] font-medium has-[:focus-visible]:ring-2 ${
                  method === m
                    ? "border-primary bg-primary/10 text-primary-deep"
                    : "border-border text-ink hover:bg-surface-muted bg-white"
                } ${pending ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="refund-method"
                  value={m}
                  checked={method === m}
                  disabled={pending}
                  onChange={() => setMethod(m)}
                  className="sr-only"
                />
                {PAYMENT_METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="refund-amount" className={ERP_LABEL}>
            {refundVerb(direction)}金額（TWD）
          </label>
          <NumberInput
            id="refund-amount"
            value={amount}
            decimals={2}
            disabled={pending}
            onChange={setAmount}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="refund-bank" className={ERP_LABEL}>
            銀行{method === "check" ? "（必填）" : ""}
          </label>
          <input
            id="refund-bank"
            value={bank}
            disabled={pending}
            onChange={(e) => setBank(e.target.value)}
            className={ERP_INPUT}
          />
        </div>
        {method === "check" && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="refund-check-no" className={ERP_LABEL}>
                票號（必填）
              </label>
              <input
                id="refund-check-no"
                value={checkNo}
                disabled={pending}
                onChange={(e) => setCheckNo(e.target.value)}
                className={ERP_INPUT}
              />
            </div>
            <div className="space-y-1.5">
              <span className={ERP_LABEL}>到期日（票期，必填）</span>
              <RocDateInput
                value={dueDate}
                onChange={setDueDate}
                disabled={pending}
                aria-label="支票到期日"
              />
            </div>
          </>
        )}
        <div className="space-y-1.5 md:col-span-2">
          <label htmlFor="refund-note" className={ERP_LABEL}>
            備註
          </label>
          <textarea
            id="refund-note"
            rows={2}
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
            className={ERP_AREA}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-ink text-[16px] font-bold">
            {meta.unallocatedLabel}來源
          </h2>
          <span className="text-text-muted text-[13px]">
            依日期先後扣減；{meta.creditLabel}
            的負數餘額請先以 0 元沖抵單轉為{meta.unallocatedLabel}。
          </span>
        </div>
        {!partyId ? (
          <p className="text-text-muted rounded-lg border border-dashed px-4 py-6 text-center text-[14px]">
            請先選擇{meta.partyLabel}。
          </p>
        ) : loading || !prepaid ? (
          <p className="text-text-muted px-4 py-6 text-center text-[14px]">
            讀取{meta.unallocatedLabel}中…
          </p>
        ) : prepaid.sources.length === 0 ? (
          <p className="text-text-muted rounded-lg border border-dashed px-4 py-6 text-center text-[14px]">
            此{meta.partyLabel}沒有{meta.unallocatedLabel}餘額可退款。
          </p>
        ) : (
          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-border text-text-muted border-b">
                  <th className="px-3 py-3 font-medium">單號</th>
                  <th className="px-3 py-3 font-medium">日期</th>
                  <th className="px-3 py-3 text-right font-medium">金額</th>
                  <th className="px-3 py-3 text-right font-medium">
                    可退{meta.unallocatedLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {prepaid.sources.map((src) => (
                  <tr
                    key={src.id}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-[13px]">
                        {src.doc_no ?? "—"}
                      </span>
                      {src.amount === 0 && (
                        <span className="text-text-muted ml-2 text-[12px]">
                          沖抵單
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{rocDate(src.pay_date)}</td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText value={src.amount} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyText value={src.available} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {prepaid && (
          <p className="text-right text-[14px]">
            目前{meta.unallocatedLabel}{" "}
            <MoneyText value={prepaid.total} className="font-semibold" />
          </p>
        )}
      </section>

      <ErrorList errors={errors} />
      <div className="flex items-center justify-end gap-3">
        <span className="text-text-muted text-[14px]">
          {refundVerb(direction)}金額 <MoneyText value={amount} />
        </span>
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "過帳中…" : `過帳${meta.refundLabel}`}
        </button>
      </div>
      {confirmDialog}
    </form>
  );
}
