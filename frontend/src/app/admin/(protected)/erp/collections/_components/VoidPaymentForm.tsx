"use client";
// 作廢收付款：原因必填 + 二次確認。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ERP_AREA } from "@/components/erp/styles";
import type { PaymentDirection } from "@/lib/erp/types";
import { voidPaymentAction } from "./actions";
import { DIRECTION_META, NETWORK_ERROR } from "./allocation";

export function VoidPaymentForm({
  paymentId,
  direction,
  docNo,
}: {
  paymentId: string;
  direction: PaymentDirection;
  docNo: string | null;
}) {
  const label = DIRECTION_META[direction].label;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-md px-3 text-[13px] font-medium text-red-600 hover:bg-red-50"
      >
        作廢{label}
      </button>
    );
  }

  function submit() {
    setError(null);
    if (!reason.trim()) {
      setError("請填寫作廢原因。");
      return;
    }
    if (
      !window.confirm(
        `確定作廢${label} ${docNo ?? ""}？沖銷會一併取消，此動作無法復原。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof voidPaymentAction>>;
      try {
        res = await voidPaymentAction(paymentId, direction, reason);
      } catch (err) {
        // 框架控制流程原樣丟回；網路錯誤保留作廢原因並顯示提示。
        unstable_rethrow(err);
        setError(NETWORK_ERROR);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/40 p-4">
      <label htmlFor="void-reason" className="text-ink text-[14px] font-medium">
        作廢原因（必填）
      </label>
      <textarea
        id="void-reason"
        rows={2}
        value={reason}
        disabled={pending}
        onChange={(e) => setReason(e.target.value)}
        className={ERP_AREA}
      />
      {error && (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold"
        >
          取消
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex h-9 items-center rounded-lg bg-red-600 px-3 text-[13px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "作廢中…" : "確認作廢"}
        </button>
      </div>
    </div>
  );
}
