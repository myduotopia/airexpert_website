"use client";
// 新增收款 / 付款表單（受控；錯誤時保留輸入）。選完對象後載入其未沖銷單據供勾選沖銷。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { MoneyText } from "@/components/erp/MoneyText";
import { NumberInput } from "@/components/erp/NumberInput";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { VendorPicker } from "@/components/erp/VendorPicker";
import {
  ERP_AREA,
  ERP_INPUT,
  ERP_LABEL,
  ERP_SELECT,
} from "@/components/erp/styles";
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
  PAYMENT_METHODS,
  toAllocationInputs,
  validateAllocations,
  validatePaymentForm,
  type AllocationRow,
  type OutstandingDoc,
} from "./allocation";

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
  const [payDate, setPayDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [amount, setAmount] = useState(0);
  const [checkNo, setCheckNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [bank, setBank] = useState("");
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState<OutstandingDoc[]>([]);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  function selectParty(id: string | null) {
    setPartyId(id);
    setDocs([]);
    setRows([]);
    setError(null);
    if (!id) return;
    startLoading(async () => {
      const res = await loadOutstandingAction(direction, id);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
    const bad =
      validatePaymentForm(input) ?? validateAllocations(amount, rows, docs);
    if (bad) {
      setError(bad);
      return;
    }
    startTransition(async () => {
      const res = await createPaymentAction(input);
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
              onChange={(id) => selectParty(id)}
              disabled={pending}
              required
            />
          ) : (
            <VendorPicker
              options={vendors}
              value={partyId}
              onChange={(id) => selectParty(id)}
              disabled={pending}
              required
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
        <div className="space-y-1.5">
          <label htmlFor="pay-method" className={ERP_LABEL}>
            方式
          </label>
          <select
            id="pay-method"
            value={method}
            disabled={pending}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className={ERP_SELECT}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
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
              <span className={ERP_LABEL}>票期（必填）</span>
              <RocDateInput
                value={dueDate}
                onChange={setDueDate}
                disabled={pending}
                aria-label="票期"
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

      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}
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
    </form>
  );
}
