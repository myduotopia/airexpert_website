"use client";
// 廠商新增／編輯表單（受控；錯誤時保留輸入）。
// 傳 onSaved 時為「就地新增」模式（建單頁 Dialog 內，#218）：只新增、不導頁不 refresh，
// 存檔後以新廠商的 Picker 選項回呼；取消改呼叫 onCancel；隱藏啟用勾選（一律啟用）。
import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { VendorInput } from "@/lib/erp/queries/master-data";
import type { VendorOption } from "@/lib/erp/types";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../items/_components/master-ui";
import { createVendorAction, updateVendorAction } from "../actions";

const TEXT_FIELDS: {
  key: keyof VendorInput;
  label: string;
  required?: boolean;
  wide?: boolean;
  type?: string;
  inputMode?: "email" | "tel";
  placeholder?: string;
}[] = [
  { key: "code", label: "廠商代碼", required: true, placeholder: "例：KA405" },
  { key: "name", label: "廠商名稱", required: true },
  { key: "tax_id", label: "統一編號" },
  { key: "contact_person", label: "聯絡人" },
  { key: "phone", label: "電話", type: "tel" },
  { key: "fax", label: "傳真", type: "tel" },
  // 不用 type="email"：瀏覽器原生驗證不接受多筆、錯誤只以浮動提示呈現（自動化工具與部分使用者
  // 看起來像「按儲存沒反應」）；改由 server 檢查並在表單下方顯示訊息（#222）。
  {
    key: "email",
    label: "Email",
    inputMode: "email",
    placeholder: "多筆以 ; 分隔",
  },
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
  onSaved,
  onCancel,
}: {
  vendorId?: string;
  initial: VendorInput;
  /** 就地新增：存檔成功後回呼（不導頁）。 */
  onSaved?: (id: string, option: VendorOption) => void;
  /** 就地新增：取消鈕改呼叫此回呼。 */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const uid = useId();
  // Dialog 內欄位 id 加前綴，避免與單據頁其他欄位撞 id。
  const fid = (key: string) => (embedded ? `${uid}-${key}` : key);
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
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      if (onSaved) {
        const created = await createVendorAction(v);
        if (!created.ok) {
          setError(created.error);
          setBusy(false);
          return;
        }
        onSaved(created.id, created.option);
        return;
      }
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
      <div
        className={
          embedded
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"
        }
      >
        {TEXT_FIELDS.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            htmlFor={fid(f.key)}
            required={f.required}
            wide={f.wide}
          >
            <input
              id={fid(f.key)}
              data-autofocus={
                embedded && f.key === (v.code ? "name" : "code")
                  ? true
                  : undefined
              }
              type={f.type ?? "text"}
              inputMode={f.inputMode}
              className={ERP_INPUT}
              value={String(v[f.key] ?? "")}
              placeholder={f.placeholder}
              required={f.required}
              onChange={(e) => set(f.key, e.target.value as never)}
            />
          </Field>
        ))}
        <Field label="備註" htmlFor={fid("note")} wide>
          <textarea
            id={fid("note")}
            rows={3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {!embedded && (
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            啟用（停用後不出現在單據選單）
          </label>
        )}
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
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold disabled:opacity-50"
          >
            取消
          </button>
        ) : (
          <Link
            href={cancelHref}
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
