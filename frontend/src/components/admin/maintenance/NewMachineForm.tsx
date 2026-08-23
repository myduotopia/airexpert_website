"use client";
// 新增保養卡的表單外殼。改成 client 元件是為了把 createMachineAction 的錯誤
// （尤其是機號衝突的引導訊息）顯示在表單上 —— server action 直接 throw 的話，
// Next.js 在 production 會把訊息抹掉，員工只會看到通用錯誤頁且輸入全部消失。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CardBasicFields } from "./CardBasicForm";
import { createMachineAction } from "@/app/admin/(protected)/maintenance/actions";

export function NewMachineForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    const res = await createMachineAction(fd);
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
      <CardBasicFields />
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
