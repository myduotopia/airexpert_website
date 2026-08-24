"use client";
// 保養卡後台表單的共用「受控」輸入元件。
//
// 這幾個元件刻意把值放在 useState（受控）而不是用 defaultValue：
// React 19 的 <form action={fn}> 會在 action 結束後自動 reset 表單
// （react-dom 的 startHostTransition → requestFormReset，且是在 action 執行前就
// 無條件排入），非受控欄位會被打回 defaultValue：
//   * 新增類表單的 defaultValue 是空的 → 存檔失敗時整排輸入被清空（#167 的建卡、
//     #168 的新增維護紀錄）；
//   * 編輯類表單的 defaultValue 是該列的已存值 → 存檔失敗時使用者剛改的內容被
//     悄悄換回舊值，畫面上卻還留著紅字「儲存失敗…」（#168）。
// 受控欄位不受 reset 影響（updateInput 會同步 element.defaultValue）。
// 同 app/admin/(protected)/home/sections/primitives.tsx 的作法。
import { useState, type ReactNode } from "react";

export const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";
export const AREA_CLASS =
  "border-border focus:border-primary rounded-lg border px-3 py-2 text-[15px] outline-none";
export const SELECT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border bg-white px-3 text-[15px] outline-none";

/** 一般單行文字欄（受控）。id 一律等同 name，label 的 htmlFor 直接帶 name 即可。 */
export function PlainInput({
  name,
  type,
  required,
  initial,
}: {
  name: string;
  type?: string;
  required?: boolean;
  initial: string;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return (
    <input
      id={name}
      name={name}
      type={type ?? "text"}
      required={required}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={INPUT_CLASS}
    />
  );
}

/** 多行規格 / 備註欄（受控）。 */
export function SpecTextarea({
  name,
  rows = 3,
  initial,
}: {
  name: string;
  rows?: number;
  initial: string;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      id={name}
      name={name}
      rows={rows}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={AREA_CLASS}
    />
  );
}

/** 下拉選單（受控）。選項由 children 帶入。 */
export function PlainSelect({
  name,
  initial,
  children,
}: {
  name: string;
  initial: string;
  children: ReactNode;
}): ReactNode {
  const [value, setValue] = useState(initial);
  return (
    <select
      id={name}
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      className={SELECT_CLASS}
    >
      {children}
    </select>
  );
}
