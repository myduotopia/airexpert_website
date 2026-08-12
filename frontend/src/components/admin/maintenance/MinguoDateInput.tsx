"use client";
// 民國日期輸入：年 / 月 / 日三欄。以隱藏欄位送出西元 ISO(YYYY-MM-DD)，欄位名 = name，
// 故 server action / DB 維持西元、無需改動。任一欄未填 → 送出空字串（後端 cleanText → null）。
import { useState } from "react";
import { isoToRocParts, rocPartsToIso } from "@/lib/admin/minguo";

const BOX =
  "border-border focus:border-primary h-11 rounded-lg border px-2 text-center text-[15px] outline-none";

export function MinguoDateInput({
  name,
  defaultIso,
}: {
  name: string;
  defaultIso?: string;
}) {
  const init = isoToRocParts(defaultIso);
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [day, setDay] = useState(init.day);

  const iso = rocPartsToIso(year, month, day);
  const onlyDigits = (v: string) => v.replace(/\D/g, "");

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted shrink-0 text-[13px]">民國</span>
      <input
        aria-label="民國年"
        inputMode="numeric"
        value={year}
        onChange={(e) => setYear(onlyDigits(e.target.value).slice(0, 3))}
        placeholder="年"
        className={`${BOX} w-16`}
      />
      <span className="text-text-muted">/</span>
      <input
        aria-label="月"
        inputMode="numeric"
        value={month}
        onChange={(e) => setMonth(onlyDigits(e.target.value).slice(0, 2))}
        placeholder="月"
        className={`${BOX} w-12`}
      />
      <span className="text-text-muted">/</span>
      <input
        aria-label="日"
        inputMode="numeric"
        value={day}
        onChange={(e) => setDay(onlyDigits(e.target.value).slice(0, 2))}
        placeholder="日"
        className={`${BOX} w-12`}
      />
      <input type="hidden" name={name} value={iso} />
    </div>
  );
}
