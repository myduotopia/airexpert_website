"use client";
// 民國日期輸入（受控版）：年 / 月 / 日三欄，value / onChange 皆為西元 ISO（YYYY-MM-DD）。
// 任一欄未填或不合法 → onChange("")。傳 name 時另輸出 hidden input 供 <form> 送出。
// 保養卡的 MinguoDateInput 為非受控（defaultIso）；ERP 表單需受控，故另建於 minguo.ts 之上。
import { useState } from "react";
import { isoToRocParts, rocPartsToIso } from "@/lib/admin/minguo";

const BOX =
  "border-border focus:border-primary h-10 rounded-lg border bg-white px-2 text-center text-[14px] outline-none disabled:bg-surface-muted disabled:text-text-muted";

export function RocDateInput({
  value,
  onChange,
  name,
  id,
  disabled,
  "aria-label": ariaLabel = "日期",
}: {
  value: string;
  onChange: (iso: string) => void;
  name?: string;
  /** 套在「年」欄，供 label htmlFor。 */
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [parts, setParts] = useState(() => isoToRocParts(value));
  const [lastValue, setLastValue] = useState(value);

  // 外部改值時同步三欄；自己輸入到一半（iso 為空）造成的變更不覆寫。
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== rocPartsToIso(parts.year, parts.month, parts.day)) {
      setParts(isoToRocParts(value));
    }
  }

  const onlyDigits = (v: string) => v.replace(/\D/g, "");

  function update(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const iso = rocPartsToIso(next.year, next.month, next.day);
    setLastValue(iso);
    if (iso !== value) onChange(iso);
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex items-center gap-1.5"
    >
      <span className="text-text-muted shrink-0 text-[13px]">民國</span>
      <input
        id={id}
        aria-label="民國年"
        inputMode="numeric"
        value={parts.year}
        disabled={disabled}
        onChange={(e) =>
          update({ year: onlyDigits(e.target.value).slice(0, 3) })
        }
        placeholder="年"
        className={`${BOX} w-14`}
      />
      <span className="text-text-muted">/</span>
      <input
        aria-label="月"
        inputMode="numeric"
        value={parts.month}
        disabled={disabled}
        onChange={(e) =>
          update({ month: onlyDigits(e.target.value).slice(0, 2) })
        }
        placeholder="月"
        className={`${BOX} w-11`}
      />
      <span className="text-text-muted">/</span>
      <input
        aria-label="日"
        inputMode="numeric"
        value={parts.day}
        disabled={disabled}
        onChange={(e) =>
          update({ day: onlyDigits(e.target.value).slice(0, 2) })
        }
        placeholder="日"
        className={`${BOX} w-11`}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
