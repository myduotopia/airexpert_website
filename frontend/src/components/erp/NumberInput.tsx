"use client";
// 受控數字輸入：value 為 number，輸入過程保留使用者文字（"1."、"-"、空字串）不被打回。
// 空白 / 無法解析時回報 0。
import { useState } from "react";
import { ERP_INPUT } from "./styles";

export function NumberInput({
  value,
  onChange,
  allowNegative = false,
  decimals = 4,
  className = "",
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  allowNegative?: boolean;
  /** 允許輸入的小數位數（0 = 只收整數）。 */
  decimals?: number;
  className?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // 外部改值（例：選品項帶入單價）時同步文字；自己打字造成的變更不覆寫。
  if (value !== lastValue) {
    setLastValue(value);
    if (parse(text) !== value) setText(String(value));
  }

  function parse(t: string): number {
    const n = Number(t);
    return t.trim() === "" || !Number.isFinite(n) ? 0 : n;
  }

  const pattern = new RegExp(
    `^${allowNegative ? "-?" : ""}\\d*${decimals > 0 ? `(\\.\\d{0,${decimals}})?` : ""}$`,
  );

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const t = e.target.value.replace(/,/g, "");
        if (!pattern.test(t)) return;
        setText(t);
        const n = parse(t);
        setLastValue(n);
        onChange(n);
      }}
      onBlur={() => setText(String(parse(text)))}
      className={`${ERP_INPUT} text-right tabular-nums ${className}`}
    />
  );
}
