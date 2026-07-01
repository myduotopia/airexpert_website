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
 * 變頻空壓機專用規格表：第一列「馬力數」為下拉選單，選取後第二列「造氣量」連動；
 * 其後接扁平 spec 的其餘項目（壓力範圍 / 冷卻方式 / 潤滑方式）。沿用 SpecTable 視覺。
 * variants 依 hp 數值升冪排序，預設選最小馬力數。無 variants 時回傳 null。
 */
export function CompressorSpecTable({
  spec,
  variants,
}: CompressorSpecTableProps) {
  const sorted = useMemo(() => sortHpOutput(variants), [variants]);
  const [selected, setSelected] = useState(0);

  const specRows = Object.entries(spec ?? {}).filter(
    ([key]) => key.trim() !== "",
  );

  if (sorted.length === 0) return null;

  const current = sorted[selected] ?? sorted[0];

  return (
    <div className="border-border overflow-x-auto rounded-[12px] border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-primary-deep text-white">
            <th scope="col" className={thHeadCls}>
              項目
            </th>
            <th scope="col" className={`${thHeadCls} font-mono`}>
              規格
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 馬力數：下拉選單 */}
          <tr className="border-border bg-surface border-t">
            <th scope="row" className={rowLabelCls}>
              馬力數
            </th>
            <td className="px-5 py-3">
              <select
                aria-label="選擇馬力數"
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="border-border focus:border-primary rounded-lg border px-3 py-1.5 font-mono text-[15px] outline-none"
              >
                {sorted.map((row, i) => (
                  <option key={`${row.hp}-${i}`} value={i}>
                    {row.hp} HP
                  </option>
                ))}
              </select>
            </td>
          </tr>
          {/* 造氣量：隨馬力數連動 */}
          <tr className="border-border bg-surface-muted border-t">
            <th scope="row" className={rowLabelCls}>
              造氣量
            </th>
            <td className={rowValueCls}>
              {current ? `${current.output} m³/min` : "—"}
            </td>
          </tr>
          {/* 其餘固定項（壓力範圍 / 冷卻方式 / 潤滑方式…） */}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
