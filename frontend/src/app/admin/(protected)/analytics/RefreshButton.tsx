"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAnalytics } from "./actions";

/** 失效快取後重新整理當前頁。 */
export function RefreshButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        start(async () => {
          await refreshAnalytics();
          router.refresh();
        })
      }
      disabled={pending}
      className="border-border text-text-muted hover:text-ink rounded-lg border bg-white px-3 py-1.5 text-[13px] disabled:opacity-50"
    >
      {pending ? "更新中…" : "重新整理"}
    </button>
  );
}
