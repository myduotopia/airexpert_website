"use client";
// 客戶新增／編輯表單（mx_customers，含 ERP 欄位；受控，錯誤時保留輸入）。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerInput } from "@/lib/erp/queries/master-data";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../items/_components/master-ui";
import { createCustomerAction, updateCustomerAction } from "../actions";

type TextKey = Exclude<keyof CustomerInput, "erp_active" | "note">;

const TEXT_FIELDS: {
  key: TextKey;
  label: string;
  required?: boolean;
  wide?: boolean;
  type?: string;
  placeholder?: string;
}[] = [
  { key: "code", label: "客戶編號", placeholder: "例：KC360" },
  { key: "name", label: "客戶名稱", required: true },
  { key: "tax_id", label: "統一編號", placeholder: "8 位數字" },
  { key: "invoice_title", label: "發票抬頭" },
  { key: "contact_person", label: "聯絡人" },
  { key: "phone", label: "電話", type: "tel" },
  { key: "sales_rep", label: "業務" },
  { key: "payment_terms", label: "付款條件", placeholder: "例：月結30天" },
  { key: "address", label: "聯絡地址", wide: true },
  { key: "delivery_address", label: "送貨地址", wide: true },
];

export function CustomerForm({
  customerId,
  initial,
}: {
  customerId?: string;
  initial: CustomerInput;
}) {
  const router = useRouter();
  const [v, setV] = useState<CustomerInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelHref = customerId
    ? `/admin/erp/customers/${customerId}`
    : "/admin/erp/customers";

  function set<K extends keyof CustomerInput>(k: K, value: CustomerInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = customerId
        ? await updateCustomerAction(customerId, v)
        : await createCustomerAction(v);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.push(`/admin/erp/customers/${res.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message || "儲存失敗，請確認網路後再試一次。");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            htmlFor={f.key}
            required={f.required}
            wide={f.wide}
          >
            <input
              id={f.key}
              type={f.type ?? "text"}
              className={ERP_INPUT}
              value={v[f.key]}
              placeholder={f.placeholder}
              required={f.required}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="備註" htmlFor="note" wide>
          <textarea
            id="note"
            rows={3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={v.erp_active}
            onChange={(e) => set("erp_active", e.target.checked)}
          />
          ERP 啟用（停用後不出現在單據客戶選單；保養卡不受影響）
        </label>
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-deep h-11 rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        <Link
          href={cancelHref}
          className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
