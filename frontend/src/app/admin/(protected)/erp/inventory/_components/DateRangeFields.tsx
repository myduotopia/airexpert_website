"use client";
// GET 篩選表單用的民國日期區間（輸出 hidden input from / to，西元 ISO）。
import { useState } from "react";
import { RocDateInput } from "@/components/erp/RocDateInput";

export function DateRangeFields({ from, to }: { from: string; to: string }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-text-muted text-[12px]">起日</span>
        <RocDateInput value={f} onChange={setF} name="from" aria-label="起日" />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-text-muted text-[12px]">迄日</span>
        <RocDateInput value={t} onChange={setT} name="to" aria-label="迄日" />
      </div>
    </>
  );
}
