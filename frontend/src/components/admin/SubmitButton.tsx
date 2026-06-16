"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// 表單送出按鈕：自動依 useFormStatus 顯示 pending 狀態。須置於 <form> 內。
export function SubmitButton({
  children,
  pendingText = "處理中…",
  variant = "primary",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const color =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-primary hover:bg-primary-deep";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors disabled:opacity-60 ${color}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
