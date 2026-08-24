"use client";
// 新增保養卡的表單外殼。改成 client 元件是為了把 createMachineAction 的錯誤顯示在
// 表單上 —— server action 直接 throw 的話，Next.js 在 production 會把訊息抹成
// digest，加上本專案沒有 error.tsx，員工只會看到通用錯誤頁而且輸入全部消失。
import { useState } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { CardBasicFields } from "./CardBasicForm";
import { ColumnsEditor } from "./ColumnsEditor";
import type { MxCardType } from "@/lib/admin/maintenance-normalize";
import {
  createMachineAction,
  type CreateMachineResult,
} from "@/app/admin/(protected)/maintenance/actions";

export function NewMachineForm({
  cardType = "compressor",
}: {
  cardType?: MxCardType;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    let res: CreateMachineResult;
    try {
      res = await createMachineAction(fd);
    } catch (e) {
      // session 過期時 action 內的 requireRole 會 redirect，Next.js 會把這個 action
      // promise 以 NEXT_REDIRECT 錯誤 reject（導頁另由 router reducer 執行）。框架的
      // 控制流程錯誤要原樣丟回去，否則下面會把「NEXT_REDIRECT」當錯誤訊息秀出來。
      unstable_rethrow(e);
      // 送不出去（斷網、server action 本身失敗）時的保底。不接的話這個 rejection
      // 會冒到最近的 error boundary，而本專案沒有 error.tsx，結果就是整頁換成通用
      // 錯誤畫面、剛打的整張表單一起消失 —— 正是這支元件要避免的事。
      setBusy(false);
      setError((e as Error)?.message || "建立失敗，請確認網路後再試一次。");
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // 成功後不解除 busy，避免導頁途中被再按一次而重複建卡。
    router.push(`/admin/maintenance/${res.machineId}`);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      <CardBasicFields cardType={cardType} />
      {cardType === "filter" && <ColumnsEditor />}
      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "建立中…" : "建立"}
      </button>
    </form>
  );
}
