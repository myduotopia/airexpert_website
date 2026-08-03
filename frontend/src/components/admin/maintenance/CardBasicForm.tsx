"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
import { useState, type ReactNode } from "react";
import { lookupCustomerByCodeAction } from "@/app/admin/(protected)/maintenance/actions";

export interface CardBasicValues {
  customer_code?: string;
  customer_name?: string;
  serial_no?: string;
  machine_no?: string;
  location?: string;
  purchased_at?: string;
  model?: string;
  horsepower?: string;
  voltage?: string;
}

// customer_code / customer_name 為受控欄位（自動帶入），其餘沿用 defaultValue（非受控）。
const FIELDS: { name: keyof CardBasicValues; label: string; type?: string }[] =
  [
    { name: "serial_no", label: "機號" },
    { name: "machine_no", label: "機台編號" },
    { name: "location", label: "使用地點" },
    { name: "purchased_at", label: "購買時間", type: "date" },
    { name: "model", label: "機型" },
    { name: "horsepower", label: "馬力" },
    { name: "voltage", label: "電壓" },
  ];

const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

export function CardBasicFields({
  values,
}: {
  values?: CardBasicValues;
}): ReactNode {
  // 客戶編號、客戶名稱受控，供「輸入客戶編號 → onBlur 自動帶入客戶名稱」。
  const [customerCode, setCustomerCode] = useState(values?.customer_code ?? "");
  const [customerName, setCustomerName] = useState(values?.customer_name ?? "");

  async function onCodeBlur() {
    const code = customerCode.trim();
    if (!code) return;
    const hit = await lookupCustomerByCodeAction(code);
    if (hit) setCustomerName(hit.name);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="customer_code"
          className="text-ink text-[14px] font-medium"
        >
          客戶編號
        </label>
        <input
          id="customer_code"
          name="customer_code"
          type="text"
          value={customerCode}
          onChange={(e) => setCustomerCode(e.target.value)}
          onBlur={onCodeBlur}
          className={INPUT_CLASS}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="customer_name"
          className="text-ink text-[14px] font-medium"
        >
          客戶名稱
          <span className="text-red-500"> *</span>
        </label>
        <input
          id="customer_name"
          name="customer_name"
          type="text"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
            {f.name === "serial_no" && <span className="text-red-500"> *</span>}
          </label>
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.name === "serial_no"}
            defaultValue={values?.[f.name] ?? ""}
            className={INPUT_CLASS}
          />
        </div>
      ))}
    </div>
  );
}
