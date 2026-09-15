"use client";
// 詳情頁「補沖銷」：把未沖銷餘額（預收 / 預付）沖到該對象的未沖銷單據。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import type { PaymentDirection } from "@/lib/erp/types";
import { allocatePaymentAction } from "./actions";
import { AllocationTable } from "./AllocationTable";
import {
  NETWORK_ERROR,
  toAllocationInputs,
  validateAllocations,
  type AllocationRow,
  type OutstandingDoc,
} from "./allocation";

export function AllocateMorePanel({
  paymentId,
  direction,
  docs,
  capacity,
  remainingLabel,
}: {
  paymentId: string;
  direction: PaymentDirection;
  docs: OutstandingDoc[];
  capacity: number;
  remainingLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AllocationRow[]>(() =>
    docs.map((d) => ({
      document_id: d.document_id,
      selected: false,
      amount: 0,
    })),
  );

  // server 重新給 docs（沖銷成功後 refresh）時重置勾選。
  const signature = docs
    .map((d) => `${d.document_id}:${d.outstanding}`)
    .join("|");
  const [syncedSig, setSyncedSig] = useState(signature);
  if (syncedSig !== signature) {
    setSyncedSig(signature);
    setRows(
      docs.map((d) => ({
        document_id: d.document_id,
        selected: false,
        amount: 0,
      })),
    );
  }

  function submit() {
    setError(null);
    const allocations = toAllocationInputs(rows);
    if (allocations.length === 0) {
      setError("請勾選要沖銷的單據。");
      return;
    }
    const bad = validateAllocations(capacity, rows, docs);
    if (bad) {
      setError(bad);
      return;
    }
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof allocatePaymentAction>>;
      try {
        res = await allocatePaymentAction(paymentId, direction, allocations);
      } catch (err) {
        // redirect 等框架控制流程原樣丟回；網路錯誤留在原地顯示，保留勾選與金額。
        unstable_rethrow(err);
        setError(NETWORK_ERROR);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <AllocationTable
        docs={docs}
        rows={rows}
        onChange={setRows}
        capacity={capacity}
        disabled={pending}
        remainingLabel={remainingLabel}
      />
      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}
      {docs.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "沖銷中…" : "確認補沖銷"}
          </button>
        </div>
      )}
    </div>
  );
}
