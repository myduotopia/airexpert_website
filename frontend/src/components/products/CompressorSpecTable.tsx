"use client";

import { useMemo, useState } from "react";
import { sortHpOutput } from "@/lib/products/hp-output";
import type { HpOutputRow, ProductSpec } from "@/lib/types";

type CompressorSpecTableProps = {
  spec: ProductSpec;
  variants: HpOutputRow[];
};

const thHeadCls = "px-5 py-3 text-[15px] font-bold whitespace-nowrap";
const rowLabelCls =
  "text-ink px-5 py-3 text-[15px] font-semibold whitespace-nowrap";
const rowValueCls = "text-text-muted px-5 py-3 font-mono text-[15px]";

/**
 * 變頻空壓機專用規格表。「馬力數」為下拉選單、「造氣量」隨之連動；其後接扁平 spec
 * 的其餘固定項（壓力範圍 / 冷卻方式 / 潤滑方式…）。沿用 SpecTable 視覺。
 *
 * 桌面（md+）在有 2 組以上馬力數時，多出第二個「規格」欄，可各自選不同馬力數並排
 * 對照（項目｜規格｜規格，等寬）；手機僅顯示單一規格欄。table-fixed 固定欄寬，
 * 切換馬力數不會橫移。variants 依 hp 數值升冪排序；無 variants 時回傳 null。
 */
export function CompressorSpecTable({
  spec,
  variants,
}: CompressorSpecTableProps) {
  const sorted = useMemo(() => sortHpOutput(variants), [variants]);
  const [selA, setSelA] = useState(0);
  // 第二欄預設選最大馬力數，開箱即為一組有意義的對照。
  const [selB, setSelB] = useState(() =>
    sorted.length > 1 ? sorted.length - 1 : 0,
  );

  const specRows = Object.entries(spec ?? {}).filter(
    ([key]) => key.trim() !== "",
  );

  if (sorted.length === 0) return null;

  const hasCompare = sorted.length >= 2;
  const curA = sorted[selA] ?? sorted[0];
  const curB = sorted[selB] ?? sorted[0];

  const hpSelect = (
    value: number,
    onChange: (v: number) => void,
    label: string,
  ) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="border-border focus:border-primary w-full max-w-[180px] rounded-lg border px-3 py-1.5 font-mono text-[15px] outline-none"
    >
      {sorted.map((row, i) => (
        <option key={`${row.hp}-${i}`} value={i}>
          {row.hp} HP
        </option>
      ))}
    </select>
  );

  // 值欄的隱藏/寬度：桌面等寬兩欄，手機只留第一欄。
  const colBHidden = "hidden md:table-cell";

  return (
    <div className="border-border overflow-x-auto rounded-[12px] border">
      <table className="w-full min-w-[420px] table-fixed border-collapse text-left">
        <thead>
          <tr className="bg-primary-deep text-white">
            <th scope="col" className={`${thHeadCls} w-[38%] md:w-[26%]`}>
              項目
            </th>
            <th
              scope="col"
              className={`${thHeadCls} font-mono ${hasCompare ? "w-[62%] md:w-[37%]" : ""}`}
            >
              規格
            </th>
            {hasCompare ? (
              <th
                scope="col"
                className={`${thHeadCls} ${colBHidden} font-mono md:w-[37%]`}
              >
                規格
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {/* 馬力數：下拉選單（可對照兩組） */}
          <tr className="border-border bg-surface border-t">
            <th scope="row" className={rowLabelCls}>
              馬力數
            </th>
            <td className="px-5 py-3">
              {hpSelect(selA, setSelA, "選擇馬力數")}
            </td>
            {hasCompare ? (
              <td className={`${colBHidden} px-5 py-3`}>
                {hpSelect(selB, setSelB, "選擇對照馬力數")}
              </td>
            ) : null}
          </tr>
          {/* 造氣量：隨各欄馬力數連動 */}
          <tr className="border-border bg-surface-muted border-t">
            <th scope="row" className={rowLabelCls}>
              造氣量
            </th>
            <td className={rowValueCls}>
              {curA ? `${curA.output} m³/min` : "—"}
            </td>
            {hasCompare ? (
              <td className={`${rowValueCls} ${colBHidden}`}>
                {curB ? `${curB.output} m³/min` : "—"}
              </td>
            ) : null}
          </tr>
          {/* 其餘固定項（與馬力數無關，兩欄相同） */}
          {specRows.map(([key, value], index) => {
            const display =
              value === null || value === "" ? "—" : String(value);
            return (
              <tr
                key={key}
                className={`border-border border-t ${
                  index % 2 === 0 ? "bg-surface" : "bg-surface-muted"
                }`}
              >
                <th scope="row" className={rowLabelCls}>
                  {key}
                </th>
                <td className={rowValueCls}>{display}</td>
                {hasCompare ? (
                  <td className={`${rowValueCls} ${colBHidden}`}>{display}</td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
