"use client";
// 維護紀錄一列的欄位群。可獨立提交（新增/編輯列），或被 ImportReview 逐列內嵌。
import type { ReactNode } from "react";
import { MinguoDateInput } from "./MinguoDateInput";

export interface RecordValues {
  service_date?: string;
  hours?: string;
  oil?: string;
  oil_filter?: string;
  air_filter?: string;
  oil_separator?: string;
  inverter?: string;
  filter_system?: string;
  technician?: string;
  note?: string;
}

// service_date 改用民國日期輸入（roc）；其餘為一般文字欄。
const FIELDS: { name: keyof RecordValues; label: string; roc?: boolean }[] = [
  { name: "service_date", label: "日期", roc: true },
  { name: "hours", label: "時數" },
  { name: "oil", label: "專用油" },
  { name: "oil_filter", label: "機油濾清器" },
  { name: "air_filter", label: "空氣濾清器" },
  { name: "oil_separator", label: "油氣分離器" },
  { name: "inverter", label: "變頻器" },
  { name: "filter_system", label: "過濾系統" },
  { name: "technician", label: "維護員" },
  { name: "note", label: "備註" },
];

export function RecordFields({ values }: { values?: RecordValues }): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
          </label>
          {f.roc ? (
            <MinguoDateInput name={f.name} defaultIso={values?.[f.name]} />
          ) : (
            <input
              id={f.name}
              name={f.name}
              type="text"
              defaultValue={values?.[f.name] ?? ""}
              className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
            />
          )}
        </div>
      ))}
    </div>
  );
}
