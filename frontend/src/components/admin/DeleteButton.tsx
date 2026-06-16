"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/crud";

// 刪除按鈕：確認後呼叫「已 bind 好的」server action（例如 deleteRow.bind(null, "products", id, tags)）。
// 在 client 事件處理器呼叫 server action 是允許的，避免 form/FormData 簽章限制。
export function DeleteButton({
  onDelete,
  label = "刪除",
  confirmText = "確定刪除？此動作無法復原。",
}: {
  onDelete: () => Promise<ActionResult>;
  label?: string;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          if (!window.confirm(confirmText)) return;
          startTransition(async () => {
            const res = await onDelete();
            if (!res.ok) setError(res.error);
          });
        }}
        className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? "刪除中…" : label}
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
