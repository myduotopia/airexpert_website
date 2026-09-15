"use client";
// 倉庫新增／編輯表單（受控）。設為預設倉時 server 會自動取消其他倉的預設。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WarehouseInput } from "@/lib/erp/queries/master-data";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../items/_components/master-ui";
import { createWarehouseAction, updateWarehouseAction } from "../actions";

export function WarehouseForm({
  warehouseId,
  initial,
}: {
  warehouseId?: string;
  initial: WarehouseInput;
}) {
  const router = useRouter();
  const [v, setV] = useState<WarehouseInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof WarehouseInput>(k: K, value: WarehouseInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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
      <div className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <Field label="倉庫代碼" htmlFor="code" required>
          <input
            id="code"
            className={ERP_INPUT}
            value={v.code}
            onChange={(e) => set("code", e.target.value)}
            required
          />
        </Field>
        <Field label="倉庫名稱" htmlFor="name" required>
          <input
            id="name"
            className={ERP_INPUT}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field label="備註" htmlFor="note" wide>
          <textarea
            id="note"
            rows={3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
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
          href="/admin/erp/warehouses"
          className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
