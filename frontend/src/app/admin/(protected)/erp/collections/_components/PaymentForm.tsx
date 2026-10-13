"use client";
// 新增收款 / 付款表單（受控；錯誤時保留輸入）。選完對象後載入其未沖銷單據供勾選沖銷。
// 送出：前端檢核一次列出所有錯誤 → 頁內確認框（對象、金額、方式、沖銷、預收／預付餘額，#240）→ 過帳。
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
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type {
  CustomerOption,
  PaymentDirection,
  PaymentMethod,
  VendorOption,
} from "@/lib/erp/types";
import { createPaymentAction, loadOutstandingAction } from "./actions";
import { AllocationTable } from "./AllocationTable";
import {
  DIRECTION_META,
  NETWORK_ERROR,
  PAYMENT_METHODS,
  collectPaymentSubmitErrors,
  toAllocationInputs,
  type AllocationRow,
  type OutstandingDoc,
} from "./allocation";
import {
  paymentConfirmSummary,
  type PaymentConfirmSummary,
} from "./payment-confirm";

/** 確認框內容：金額放大置頂（#238 N-1 多打一個 0 時要看得出來），其下為明細、沖銷與預收／預付餘額。 */
function paymentConfirmOptions(s: PaymentConfirmSummary): ConfirmOptions {
  return {
    title: s.title,
    confirmLabel: s.confirmLabel,
    message: (
      <div className="text-ink space-y-3">
        <div className="bg-primary/5 border-primary/30 rounded-lg border px-4 py-3">
          <p className="text-text-muted text-[12px]">{s.amountLabel}</p>
          <p className="text-[28px] leading-tight font-bold tabular-nums">
            {s.amountText}
          </p>
          {s.amountHint && (
            <p className="text-primary-deep text-[13px] font-semibold">
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
        <div className="border-border border-t pt-2 text-[13px]">
          <p>
            沖銷 <span className="font-semibold">{s.allocationCount}</span>{" "}
            筆，合計{" "}
            <span className="font-semibold tabular-nums">
              {s.allocationTotalText}
            </span>
          </p>
          {s.allocations.length > 0 && (
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
              {s.allocations.map((a, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="font-mono">{a.docNo}</span>
                  <span className="tabular-nums">{a.amountText}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1">
            {s.remainingLabel}餘額{" "}
            <span className="font-semibold tabular-nums">
              {s.remainingText}
            </span>
          </p>
        </div>
        <p className="text-text-muted text-[12px]">
          過帳後不可修改，如有錯誤需作廢重開。
        </p>
      </div>
    ),
  };
}

export function PaymentForm({
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
  const [loadingDocs, startLoading] = useTransition();

  const [partyId, setPartyId] = useState<string | null>(null);
  /** 對象顯示名稱（編號 + 名稱），供確認框列出。 */
  const [partyLabel, setPartyLabel] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [amount, setAmount] = useState(0);
  const [checkNo, setCheckNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [bank, setBank] = useState("");
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState<OutstandingDoc[]>([]);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const setError = (msg: string) => setErrors([msg]);
  const [askConfirm, confirmDialog] = useConfirm();

  function selectParty(
    id: string | null,
    party: { code?: string | null; name?: string | null } | null,
  ) {
    setPartyId(id);
    setPartyLabel(
      party ? [party.code, party.name].filter(Boolean).join(" ") : null,
    );
    setDocs([]);
    setRows([]);
    setErrors([]);
    if (!id) return;
    startLoading(async () => {
      let res: Awaited<ReturnType<typeof loadOutstandingAction>>;
      try {
        res = await loadOutstandingAction(direction, id);
      } catch (err) {
        unstable_rethrow(err);
        setError(NETWORK_ERROR);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocs(res.data);
      setRows(
        res.data.map((d) => ({
          document_id: d.document_id,
          selected: false,
          amount: 0,
        })),
      );
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const allocations = toAllocationInputs(rows);
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
      allocations,
    };
    const bad = collectPaymentSubmitErrors(input, rows, docs);
    if (bad.length > 0) {
      setErrors(bad);
      return;
    }
    const ok = await askConfirm(
      paymentConfirmOptions(
        paymentConfirmSummary({
          direction,
          partyLabel,
          payDate,
          amount,
          method,
          checkNo,
          checkDueDate: dueDate,
          bank,
          rows,
          docs,
        }),
      ),
    );
    if (!ok) return;
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof createPaymentAction>>;
      try {
        res = await createPaymentAction(input);
      } catch (err) {
        // redirect / notFound 等框架控制流程要原樣丟回；其餘（斷網、server 失敗）
        // 不接的話會冒到 error boundary，整張填到一半的表單就沒了。
        unstable_rethrow(err);
        setError(NETWORK_ERROR);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${meta.basePath}/${res.data.id}`);
    });
  }

  const busy = pending || loadingDocs;

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
              allowCreate
            />
          ) : (
            <VendorPicker
              options={vendors}
              value={partyId}
              onChange={(id, party) => selectParty(id, party)}
              disabled={pending}
              required
              allowCreate
            />
          )}
        </div>
        <div className="space-y-1.5">
          <span className={ERP_LABEL}>{meta.label}日期</span>
          <RocDateInput
            value={payDate}
            onChange={setPayDate}
            disabled={pending}
            aria-label={`${meta.label}日期`}
          />
        </div>
        {/* 方式改為並列選項（原為下拉選單）：#217 實測時預設「匯款」，看不出有「支票」可選，
            也找不到到期日——支票的票號／到期日欄位要選了「支票」才會出現（#222）。 */}
        <fieldset className="space-y-1.5">
          <legend className={`${ERP_LABEL} mb-1.5`}>方式</legend>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
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
                  name="pay-method"
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
          <p className="text-text-muted text-[12px]">
            {method === "check"
              ? "支票需填寫銀行、票號與到期日（票期）；過帳後可在詳情頁更新兌現／退票。"
              : `${direction === "in" ? "收" : "開"}支票請選「支票」，再填寫票號與到期日。`}
          </p>
        </fieldset>
        <div className="space-y-1.5">
          <label htmlFor="pay-amount" className={ERP_LABEL}>
            金額（TWD）
          </label>
          <NumberInput
            id="pay-amount"
            value={amount}
            decimals={2}
            disabled={pending}
            onChange={setAmount}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pay-bank" className={ERP_LABEL}>
            銀行{method === "check" ? "（必填）" : ""}
          </label>
          <input
            id="pay-bank"
            value={bank}
            disabled={pending}
            onChange={(e) => setBank(e.target.value)}
            className={ERP_INPUT}
          />
        </div>
        {method === "check" && (
          <>
            <div className="space-y-1.5">
              <label htmlFor="pay-check-no" className={ERP_LABEL}>
                票號（必填）
              </label>
              <input
                id="pay-check-no"
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
          <label htmlFor="pay-note" className={ERP_LABEL}>
            備註
          </label>
          <textarea
            id="pay-note"
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
          <h2 className="text-ink text-[16px] font-bold">沖銷單據</h2>
          <span className="text-text-muted text-[13px]">
            未沖完的金額成為{meta.unallocatedLabel}，之後可在詳情頁補沖銷。
          </span>
        </div>
        {!partyId ? (
          <p className="text-text-muted rounded-lg border border-dashed px-4 py-6 text-center text-[14px]">
            請先選擇{meta.partyLabel}。
          </p>
        ) : loadingDocs ? (
          <p className="text-text-muted px-4 py-6 text-center text-[14px]">
            讀取未沖銷單據中…
          </p>
        ) : (
          <AllocationTable
            docs={docs}
            rows={rows}
            onChange={setRows}
            capacity={amount}
            disabled={pending}
            remainingLabel={meta.unallocatedLabel}
          />
        )}
      </section>

      <ErrorList errors={errors} />
      <div className="flex items-center justify-end gap-3">
        <span className="text-text-muted text-[14px]">
          {meta.label}金額 <MoneyText value={amount} />
        </span>
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "過帳中…" : `過帳${meta.label}`}
        </button>
      </div>
      {confirmDialog}
    </form>
  );
}
