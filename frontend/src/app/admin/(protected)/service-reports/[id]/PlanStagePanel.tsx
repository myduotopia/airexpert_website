"use client";
// 詳情頁的「本單對應保養階段」面板（spec §6.2）：顯示「4000 小時 基礎保養」，
// 可清除（清除後該階段視為未開過，會重新出現在提醒與開單提示中）。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { clearReportStageAction } from "../stage-actions";

const SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[14px] font-semibold disabled:opacity-60";

const CONFIRM = "清除後這個階段會視為未開過（重新出現在到期提醒）。確定清除？";

export function PlanStagePanel({
  id,
  stageText,
  canClear,
}: {
  id: string;
  /** 已組好的顯示文字，如「4000 小時 基礎保養」。 */
  stageText: string;
  /** 作廢的報告單不可清除。 */
  canClear: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function clear() {
    setError(null);
    if (!window.confirm(CONFIRM)) return;
    startTransition(async () => {
      try {
        const res = await clearReportStageAction(id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setError("清除失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  return (
    <section className="border-border rounded-xl border bg-white p-4">
      <h2 className="text-ink mb-2 text-[15px] font-semibold">保養階段</h2>
      <p className="text-ink text-[14px]">
        本單對應：<span className="font-semibold">{stageText}</span>
      </p>
      {canClear && (
        <button
          type="button"
          className={`${SECONDARY} mt-3`}
          disabled={pending}
          onClick={clear}
        >
          {pending ? "清除中…" : "清除"}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
