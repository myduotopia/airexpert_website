"use client";
// 二次確認後呼叫刪除 action；失敗時顯示中文錯誤（例：有庫存只能停用），成功導回列表。
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ConfirmDeleteButton({
  id,
  action,
  confirmText,
  redirectTo,
  label = "刪除",
}: {
  id: string;
  action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  confirmText: string;
  redirectTo: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await action(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(redirectTo);
        router.refresh();
      } catch (e) {
        setError((e as Error)?.message || "刪除失敗，請稍後再試。");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "刪除中…" : label}
      </button>
      {error && <p className="text-[14px] text-red-600">{error}</p>}
    </div>
  );
}
