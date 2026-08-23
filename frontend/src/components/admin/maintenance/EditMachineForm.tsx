"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CardBasicFields, type CardBasicValues } from "./CardBasicForm";
import { ColumnsEditor, type ColumnItem } from "./ColumnsEditor";
import type { MxCardType } from "@/lib/admin/maintenance-normalize";
import { updateMachineAction } from "@/app/admin/(protected)/maintenance/actions";

export function EditMachineForm({
  machineId,
  values,
  cardType = "compressor",
  columns,
}: {
  machineId: string;
  values: CardBasicValues;
  cardType?: MxCardType;
  /** 過濾卡的既有耗材欄定義（依 sort_order）。空壓機卡不需傳。 */
  columns?: ColumnItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await updateMachineAction(machineId, fd);
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
      <CardBasicFields values={values} cardType={cardType} />
      {cardType === "filter" && <ColumnsEditor initial={columns} />}
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
