"use client";
// 新增維護紀錄的表單外殼。改成 client 元件是為了把 addRecordAction 的錯誤顯示在
// 表單上 —— server action 直接 throw 的話，Next.js 在 production 會把訊息抹成
// digest，加上本專案沒有 error.tsx，員工只會看到通用錯誤頁而且剛打的整列消失。
// 與 NewMachineForm 同一套作法（#167 / #168）。
import { useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { RecordFields } from "./RecordForm";
import { FilterRecordFields, type FilterColumn } from "./FilterRecordForm";
import type { MxCardType } from "@/lib/admin/maintenance-normalize";
import {
  addRecordAction,
  type AddRecordResult,
} from "@/app/admin/(protected)/maintenance/actions";

export function NewRecordForm({
  machineId,
  cardType,
  columns,
}: {
  machineId: string;
  cardType: MxCardType;
  /** 過濾卡的動態耗材欄定義；空壓機卡不需要。 */
  columns: FilterColumn[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailHref = `/admin/maintenance/${machineId}`;

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    let res: AddRecordResult;
    try {
      res = await addRecordAction(machineId, fd);
    } catch (e) {
      // session 過期時 action 內的 requireRole 會 redirect，Next.js 會把這個 action
      // promise 以 NEXT_REDIRECT 錯誤 reject（導頁另由 router reducer 執行）。框架的
      // 控制流程錯誤要原樣丟回去，否則下面會把「NEXT_REDIRECT」當錯誤訊息秀出來。
      unstable_rethrow(e);
      // 送不出去（斷網、server action 本身失敗）時的保底。不接的話這個 rejection
      // 會冒到最近的 error boundary，而本專案沒有 error.tsx，結果就是整頁換成通用
      // 錯誤畫面、剛打的整列一起消失 —— 正是這支元件要避免的事。
      setBusy(false);
      setError((e as Error)?.message || "儲存失敗，請確認網路後再試一次。");
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // 成功後不解除 busy，避免導頁途中被再按一次而重複新增一列。
    router.push(detailHref);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      {cardType === "filter" ? (
        <FilterRecordFields columns={columns} />
      ) : (
        <RecordFields />
      )}
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
          href={detailHref}
          className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
        >
          取消
        </a>
      </div>
    </form>
  );
}
