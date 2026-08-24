"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/crud";

// 列表列上的單一動作按鈕：呼叫「已 bind 好的」server action，並把失敗訊息就地顯示在
// 按鈕旁邊。在 client 事件處理器呼叫 server action 是允許的，避免 form/FormData 簽章限制。
//
// 為什麼要接住錯誤而不是讓 action throw：Next.js 在 production 會把 server action
// 丟出的 Error 訊息抹成 digest，加上本專案沒有 error.tsx，員工只會看到通用錯誤頁，
// 看不到「該怎麼處理」（#167 / #168）。
//
// 錯誤狀態掛在每個按鈕自己的 state 上，同一張表的不同列不會互相汙染。
const VARIANT_CLASS = {
  danger:
    "h-9 rounded-md px-3 text-[13px] font-medium text-red-600 hover:bg-red-50",
  primary:
    "bg-primary hover:bg-primary-deep h-10 justify-center rounded-lg px-4 text-[14px] font-semibold text-white",
} as const;

export function ActionButton({
  action,
  label,
  pendingLabel,
  confirmText,
  variant = "primary",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  /** 有給才會先跳確認視窗；不給就直接執行。 */
  confirmText?: string;
  variant?: keyof typeof VARIANT_CLASS;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          // 每次送出先清掉上一次的錯誤，避免舊訊息殘留讓人誤判這次也失敗。
          setError(null);
          if (confirmText && !window.confirm(confirmText)) return;
          startTransition(async () => {
            try {
              const res = await action();
              if (!res.ok) setError(res.error);
            } catch (e) {
              // 送不出去（斷網、server action 本身失敗）時的保底。不接的話這個
              // rejection 會冒到最近的 error boundary，而本專案沒有 error.tsx，
              // 結果就是整頁換成通用錯誤畫面。
              setError(
                (e as Error)?.message || "操作失敗，請確認網路後再試一次。",
              );
            }
          });
        }}
        className={`inline-flex items-center transition-colors disabled:opacity-60 ${VARIANT_CLASS[variant]}`}
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        // 列表列常帶 whitespace-nowrap，訊息要能折行才不會把整張表撐出橫向捲軸。
        <span
          role="alert"
          className="max-w-[22rem] text-left text-[12px] whitespace-normal text-red-600"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
