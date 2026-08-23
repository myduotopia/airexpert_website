"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RecordFields, type RecordValues } from "./RecordForm";
import {
  FilterRecordFields,
  type FilterColumn,
  type FilterRecordValues,
} from "./FilterRecordForm";
import type { ActionResult } from "@/lib/admin/crud";
import { updateRecordAction } from "@/app/admin/(protected)/maintenance/actions";

/**
 * 編輯維護紀錄的表單外殼。送出 / 錯誤 / 導回的行為兩種卡別完全相同，
 * 只有中間的欄位群不同，故以 children 帶入。
 */
function EditRecordShell({
  machineId,
  recordId,
  children,
}: {
  machineId: string;
  recordId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    let res: ActionResult;
    try {
      res = await updateRecordAction(recordId, machineId, fd);
    } catch (e) {
      // 送不出去（斷網、server action 本身失敗）時的保底。不接的話這個 rejection
      // 會冒到最近的 error boundary，而本專案沒有 error.tsx，結果就是整頁換成通用
      // 錯誤畫面、剛改的內容一起消失。
      setBusy(false);
      setError((e as Error)?.message || "儲存失敗，請確認網路後再試一次。");
      return;
    }
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/admin/maintenance/${machineId}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      {children}
      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-deep h-11 rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        <a
          href={`/admin/maintenance/${machineId}`}
          className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
        >
          取消
        </a>
      </div>
    </form>
  );
}

/** 空壓機卡：固定 9 欄 + 備註。 */
export function EditRecordForm({
  machineId,
  recordId,
  values,
}: {
  machineId: string;
  recordId: string;
  values: RecordValues;
}) {
  return (
    <EditRecordShell machineId={machineId} recordId={recordId}>
      <RecordFields values={values} />
    </EditRecordShell>
  );
}

/** 過濾（乾燥機）卡：日期 / 動態耗材欄 / 維護員 / 備註。 */
export function EditFilterRecordForm({
  machineId,
  recordId,
  columns,
  values,
}: {
  machineId: string;
  recordId: string;
  columns: FilterColumn[];
  values: FilterRecordValues;
}) {
  return (
    <EditRecordShell machineId={machineId} recordId={recordId}>
      <FilterRecordFields columns={columns} values={values} />
    </EditRecordShell>
  );
}
