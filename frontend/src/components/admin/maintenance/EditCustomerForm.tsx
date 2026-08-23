"use client";
// 客戶主檔編輯表單。儲存成功即導回客戶頁；若客戶編號與其他客戶重複，
// 留在原頁顯示軟性警告（資料已存檔，僅提醒確認）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateCustomerAction } from "@/app/admin/(protected)/maintenance/actions";

export interface CustomerFormValues {
  code?: string;
  name?: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  note?: string;
}

const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

const FIELDS: {
  name: keyof CustomerFormValues;
  label: string;
  type?: string;
  required?: boolean;
}[] = [
  { name: "code", label: "客戶編號" },
  { name: "name", label: "客戶名稱", required: true },
  { name: "contact_person", label: "聯絡人" },
  { name: "phone", label: "電話", type: "tel" },
];

export function EditCustomerForm({
  customerId,
  values,
}: {
  customerId: string;
  values: CustomerFormValues;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const detailHref = `/admin/maintenance/customers/${customerId}`;

  async function onSubmit(fd: FormData) {
    setBusy(true);
    setError(null);
    setWarning(null);
    const res = await updateCustomerAction(customerId, fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.warning) {
      // 已存檔但編號重複：留在原頁提示，由使用者決定要不要改。
      setWarning(res.warning);
      router.refresh();
      return;
    }
    router.push(detailHref);
    router.refresh();
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5">
            <label
              htmlFor={f.name}
              className="text-ink text-[14px] font-medium"
            >
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </label>
            <input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              defaultValue={values[f.name] ?? ""}
              className={INPUT_CLASS}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="address" className="text-ink text-[14px] font-medium">
            地址
          </label>
          <input
            id="address"
            name="address"
            type="text"
            defaultValue={values.address ?? ""}
            className={INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="note" className="text-ink text-[14px] font-medium">
            備註
          </label>
          <textarea
            id="note"
            name="note"
            rows={4}
            defaultValue={values.note ?? ""}
            className="border-border focus:border-primary rounded-lg border px-3 py-2 text-[15px] outline-none"
          />
        </div>
      </div>

      {error && <p className="text-[14px] text-red-600">{error}</p>}
      {warning && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-800"
        >
          {warning}
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
          href={detailHref}
          className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
        >
          {warning ? "返回客戶頁" : "取消"}
        </Link>
      </div>
    </form>
  );
}
