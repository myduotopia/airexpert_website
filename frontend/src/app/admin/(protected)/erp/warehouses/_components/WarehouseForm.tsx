"use client";
// 倉庫新增／編輯表單（受控）。設為預設倉時 server 會自動取消其他倉的預設。
// 傳 onSaved 時為「就地新增」模式（建單頁 Dialog 內，#218）：只新增、不導頁不 refresh，
// 存檔後以新倉庫的 Picker 選項回呼；取消改呼叫 onCancel；隱藏預設倉與啟用勾選（非預設、啟用）。
import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WarehouseInput } from "@/lib/erp/queries/master-data";
import type { WarehouseOption } from "@/lib/erp/types";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../items/_components/master-ui";
import { createWarehouseAction, updateWarehouseAction } from "../actions";

export function WarehouseForm({
  warehouseId,
  initial,
  onSaved,
  onCancel,
}: {
  warehouseId?: string;
  initial: WarehouseInput;
  /** 就地新增：存檔成功後回呼（不導頁）。 */
  onSaved?: (id: string, option: WarehouseOption) => void;
  /** 就地新增：取消鈕改呼叫此回呼。 */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const uid = useId();
  // Dialog 內欄位 id 加前綴，避免與單據頁其他欄位撞 id。
  const fid = (key: string) => (embedded ? `${uid}-${key}` : key);
  const [v, setV] = useState<WarehouseInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof WarehouseInput>(k: K, value: WarehouseInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      if (onSaved) {
        const created = await createWarehouseAction(v);
        if (!created.ok) {
          setError(created.error);
          setBusy(false);
          return;
        }
        onSaved(created.id, created.option);
        return;
      }
      const res = warehouseId
        ? await updateWarehouseAction(warehouseId, v)
        : await createWarehouseAction(v);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.push("/admin/erp/warehouses");
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
        <Field label="倉庫代碼" htmlFor={fid("code")} required>
          <input
            id={fid("code")}
            data-autofocus={embedded && !v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.code}
            onChange={(e) => set("code", e.target.value)}
            required
          />
        </Field>
        <Field label="倉庫名稱" htmlFor={fid("name")} required>
          <input
            id={fid("name")}
            data-autofocus={embedded && !!v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field label="備註" htmlFor={fid("note")} wide>
          <textarea
            id={fid("note")}
            rows={3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {/* 就地新增不提供預設倉／停用設定（新倉一律非預設、啟用）。 */}
        {!embedded && (
          <div className="flex flex-col gap-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={v.is_default}
                onChange={(e) => {
                  const on = e.target.checked;
                  setV((prev) => ({
                    ...prev,
                    is_default: on,
                    active: on ? true : prev.active,
                  }));
                }}
              />
              設為預設倉（單據預設帶入；全公司僅一個）
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={v.active}
                disabled={v.is_default}
                onChange={(e) => set("active", e.target.checked)}
              />
              啟用
            </label>
          </div>
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
            href="/admin/erp/warehouses"
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
