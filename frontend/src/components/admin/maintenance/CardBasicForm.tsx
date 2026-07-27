"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
import type { ReactNode } from "react";

export interface CardBasicValues {
  customer_name?: string;
  card_no?: string;
  serial_no?: string;
  location?: string;
  purchased_at?: string;
  model?: string;
  horsepower?: string;
  voltage?: string;
}

const FIELDS: { name: keyof CardBasicValues; label: string; type?: string }[] =
  [
    { name: "customer_name", label: "客戶名稱" },
    { name: "serial_no", label: "機號" },
    { name: "card_no", label: "卡號" },
    { name: "location", label: "使用地點" },
    { name: "purchased_at", label: "購買時間", type: "date" },
    { name: "model", label: "機型" },
    { name: "horsepower", label: "馬力" },
    { name: "voltage", label: "電壓" },
  ];

export function CardBasicFields({
  values,
}: {
  values?: CardBasicValues;
}): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
            {(f.name === "customer_name" || f.name === "serial_no") && (
              <span className="text-red-500"> *</span>
            )}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.name === "customer_name" || f.name === "serial_no"}
            defaultValue={values?.[f.name] ?? ""}
            className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
          />
        </div>
      ))}
    </div>
  );
}
