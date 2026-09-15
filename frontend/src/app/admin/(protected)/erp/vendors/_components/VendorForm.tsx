"use client";
// 廠商新增／編輯表單（受控；錯誤時保留輸入）。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VendorInput } from "@/lib/erp/queries/master-data";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../items/_components/master-ui";
import { createVendorAction, updateVendorAction } from "../actions";

const TEXT_FIELDS: {
  key: keyof VendorInput;
  label: string;
  required?: boolean;
  wide?: boolean;
  type?: string;
  placeholder?: string;
}[] = [
  { key: "code", label: "廠商代碼", required: true, placeholder: "例：KA405" },
  { key: "name", label: "廠商名稱", required: true },
  { key: "tax_id", label: "統一編號" },
  { key: "contact_person", label: "聯絡人" },
  { key: "phone", label: "電話", type: "tel" },
  { key: "fax", label: "傳真", type: "tel" },
  { key: "email", label: "Email", type: "email" },
  { key: "currency", label: "幣別", placeholder: "TWD" },
  { key: "address", label: "地址", wide: true },
  {
    key: "payment_terms",
    label: "付款條件",
    wide: true,
    placeholder: "例：月結30天、票期60天",
  },
];

export function VendorForm({
  vendorId,
  initial,
}: {
  vendorId?: string;
  initial: VendorInput;
}) {
  const router = useRouter();
  const [v, setV] = useState<VendorInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelHref = vendorId
    ? `/admin/erp/vendors/${vendorId}`
    : "/admin/erp/vendors";

  function set<K extends keyof VendorInput>(k: K, value: VendorInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = vendorId
        ? await updateVendorAction(vendorId, v)
        : await createVendorAction(v);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.push(`/admin/erp/vendors/${res.id}`);
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
              value={String(v[f.key] ?? "")}
              placeholder={f.placeholder}
              required={f.required}
              onChange={(e) => set(f.key, e.target.value as never)}
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
            checked={v.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          啟用（停用後不出現在單據選單）
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
