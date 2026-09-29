"use client";
// 方案列表每列的刪除按鈕：先 confirm（訊息含套用機台數），再呼叫 deletePlanAction。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { deletePlanAction } from "../actions";
import { planDeleteConfirmText } from "./plan-form-state";

export function PlanDeleteButton({
  id,
  name,
  machineCount,
}: {
  id: string;
  name: string;
  machineCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (
      !window.confirm(
        planDeleteConfirmText({ name, machine_count: machineCount }),
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await deletePlanAction(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setError("刪除失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "刪除中…" : "刪除"}
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
