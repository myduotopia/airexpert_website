"use client";

// 「帶入」按鈕：由進貨單建立進退單草稿，成功後導向草稿編輯頁；錯誤就地顯示。
import { useRouter, unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";

type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export function PickReceiptButton({
  action,
}: {
  action: () => Promise<SaveResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await action();
              if (!res.ok) setError(res.error);
              else router.push(`/admin/erp/purchase-returns/${res.id}/edit`);
            } catch (e) {
              unstable_rethrow(e);
              setError((e as Error)?.message || "操作失敗，請稍後再試。");
            }
          });
        }}
        className="bg-primary hover:bg-primary-deep inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap text-white disabled:opacity-60"
      >
        {pending ? "建立中…" : "帶入退貨"}
      </button>
      {error && (
        <span
          role="alert"
          className="max-w-[16rem] text-[12px] whitespace-normal text-red-600"
        >
          {error}
        </span>
      )}
    </span>
  );
}
