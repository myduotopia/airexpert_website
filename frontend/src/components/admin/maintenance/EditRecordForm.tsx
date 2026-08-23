"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RecordFields, type RecordValues } from "./RecordForm";
import {
  FilterRecordFields,
  type FilterColumn,
  type FilterRecordValues,
} from "./FilterRecordForm";
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
    const res = await updateRecordAction(recordId, machineId, fd);
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
