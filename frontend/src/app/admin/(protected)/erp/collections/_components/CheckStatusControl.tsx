"use client";
// 支票狀態更新：未兌現 / 已兌現 / 退票。退票不會自動沖回，提示使用者作廢此收付款。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ERP_BUTTON_SECONDARY } from "@/components/erp/styles";
import type { CheckStatus, PaymentDirection } from "@/lib/erp/types";
import { updateCheckStatusAction } from "./actions";
import { CHECK_STATUS_LABEL, DIRECTION_META } from "./allocation";

const ORDER: CheckStatus[] = ["pending", "cleared", "bounced"];

export function CheckStatusControl({
  paymentId,
  direction,
  status,
  disabled,
}: {
  paymentId: string;
  direction: PaymentDirection;
  status: CheckStatus | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: CheckStatus) {
    setError(null);
    if (
      next === "bounced" &&
      !window.confirm("確定標記為退票？退票不會自動沖回沖銷。")
    ) {
      return;
    }
    startTransition(async () => {
      const res = await updateCheckStatusAction(paymentId, direction, next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-text-muted text-[14px]">支票狀態：</span>
        <strong
          className={`text-[14px] ${status === "bounced" ? "text-red-600" : status === "cleared" ? "text-primary-deep" : "text-ink"}`}
        >
          {status ? CHECK_STATUS_LABEL[status] : "—"}
        </strong>
        {!disabled &&
          ORDER.filter((s) => s !== status).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => change(s)}
              className={ERP_BUTTON_SECONDARY}
            >
              改為{CHECK_STATUS_LABEL[s]}
            </button>
          ))}
      </div>
      {status === "bounced" && !disabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          此支票已退票。系統不會自動沖回，請作廢此
          {DIRECTION_META[direction].label}
          ，沖銷會一併取消，相關單據恢復未沖餘額。
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
