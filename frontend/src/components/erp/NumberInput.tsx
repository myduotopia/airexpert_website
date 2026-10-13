"use client";
// 受控數字輸入：value 為 number，輸入過程保留使用者文字（"1."、"-"、空字串）不被打回。
// 空白 / 無法解析時回報 0。
// #247：值為 0 時顯示空白（placeholder「0」）；聚焦（滑鼠或 Tab）時全選，直接輸入即取代原值。
// 純邏輯見 @/lib/erp/number-input。
import { useRef, useState, type SyntheticEvent } from "react";
import {
  focusSelectEvent,
  formatNumberText,
  parseNumberText,
  sanitizeNumberInput,
  type FocusSelectEventName,
  type FocusSelectState,
} from "@/lib/erp/number-input";
import { ERP_INPUT } from "./styles";

export function NumberInput({
  value,
  onChange,
  allowNegative = false,
  decimals = 4,
  blankZero = true,
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
  /**
   * 值為 0 時顯示空白並以 placeholder 顯示「0」（預設 true）。
   * 0 本身有意義、要明確顯示的欄位（例：稅率 0%）設為 false。
   */
  blankZero?: boolean;
  className?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  /** 覆寫 placeholder；未給時 blankZero 欄位顯示「0」。 */
  placeholder?: string;
}) {
  const format = (n: number) => formatNumberText(n, { blankZero });
  const [text, setText] = useState(() => format(value));
  const [lastValue, setLastValue] = useState(value);
  const focusSelect = useRef<FocusSelectState>({ armed: false });

  // 外部改值（例：選品項帶入單價）時同步文字；自己打字造成的變更不覆寫。
  if (value !== lastValue) {
    setLastValue(value);
    if (parseNumberText(text) !== value) setText(format(value));
  }

  function handle(
    event: FocusSelectEventName,
    e: SyntheticEvent<HTMLInputElement>,
    focused?: boolean,
  ) {
    const r = focusSelectEvent(event, focusSelect.current, { focused });
    focusSelect.current = r.state;
    if (r.preventDefault) e.preventDefault();
    if (r.select) e.currentTarget.select();
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder ?? (blankZero ? "0" : undefined)}
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const t = sanitizeNumberInput(e.target.value, {
          allowNegative,
          decimals,
        });
        if (t === null) return;
        setText(t);
        const n = parseNumberText(t);
        setLastValue(n);
        onChange(n);
      }}
      onMouseDown={(e) =>
        handle(
          "mousedown",
          e,
          typeof document !== "undefined" &&
            document.activeElement === e.currentTarget,
        )
      }
      onFocus={(e) => handle("focus", e)}
      onMouseUp={(e) => handle("mouseup", e)}
      onBlur={(e) => {
        handle("blur", e);
        setText(format(parseNumberText(text)));
      }}
      className={`${ERP_INPUT} text-right tabular-nums ${className}`}
    />
  );
}
