"use client";
// 品項新增／編輯表單（受控；錯誤時保留輸入）。
// kind 連動：服務／費用強制關閉庫存與機號追蹤；整機預設追蹤機號；建保養卡需追蹤機號。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ItemKind, MxCardType, VendorOption } from "@/lib/erp/types";
import { ERP_AREA, ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { NumberInput } from "@/components/erp/NumberInput";
import { VendorPicker } from "@/components/erp/VendorPicker";
import { createItemAction, updateItemAction } from "../actions";
import {
  ITEM_KINDS,
  ITEM_KIND_LABEL,
  MX_CARD_TYPE_LABEL,
  applyItemKindRules,
  isNonStockKind,
  type ItemInput,
} from "../_lib/rules";
import { Field } from "./master-ui";

export function ItemForm({
  itemId,
  initial,
  vendors,
  hasStockActivity = false,
}: {
  /** 有值 = 編輯。 */
  itemId?: string;
  initial: ItemInput;
  vendors: VendorOption[];
  /** 已有庫存異動：追蹤設定不可再變更（server 亦會擋）。 */
  hasStockActivity?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<ItemInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelHref = itemId ? `/admin/erp/items/${itemId}` : "/admin/erp/items";
  const nonStock = isNonStockKind(v.kind);
  const trackingLocked = hasStockActivity;

  function set<K extends keyof ItemInput>(key: K, value: ItemInput[K]) {
    setV((prev) => applyItemKindRules({ ...prev, [key]: value }));
  }

  function changeKind(kind: ItemKind) {
    setV((prev) => {
      // 新增時切到整機，預設追蹤機號；其他情況保留使用者的勾選（規則再過濾）。
      const next = { ...prev, kind };
      if (!itemId && kind === "machine" && prev.kind !== "machine") {
        next.track_stock = true;
        next.track_serial = true;
      }
      if (!itemId && !isNonStockKind(kind) && isNonStockKind(prev.kind)) {
        next.track_stock = true;
      }
      return applyItemKindRules(next);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = itemId
        ? await updateItemAction(itemId, v)
        : await createItemAction(v);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.push(`/admin/erp/items/${res.id}`);
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message || "儲存失敗，請確認網路後再試一次。");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <Field label="產品編號" htmlFor="code" required>
          <input
            id="code"
            className={ERP_INPUT}
            value={v.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="例：ALH-15AI"
            required
          />
        </Field>
        <Field label="類別" htmlFor="kind" required>
          <select
            id="kind"
            className={ERP_SELECT}
            value={v.kind}
            onChange={(e) => changeKind(e.target.value as ItemKind)}
          >
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="品名規格" htmlFor="name" required wide>
          <input
            id="name"
            className={ERP_INPUT}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field label="單位" htmlFor="unit">
          <input
            id="unit"
            className={ERP_INPUT}
            value={v.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="台"
          />
        </Field>
        <Field label="品牌" htmlFor="brand">
          <input
            id="brand"
            className={ERP_INPUT}
            value={v.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </Field>
        <Field
          label="機型"
          htmlFor="model"
          hint="銷貨建立保養卡機台時帶入機型（空白則用品名）。"
        >
          <input
            id="model"
            className={ERP_INPUT}
            value={v.model}
            onChange={(e) => set("model", e.target.value)}
          />
        </Field>
        <Field label="預設廠商" htmlFor="default_vendor_id">
          <VendorPicker
            id="default_vendor_id"
            options={vendors}
            value={v.default_vendor_id}
            onChange={(id) => set("default_vendor_id", id)}
          />
        </Field>
      </div>

      <fieldset className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <legend className="text-ink px-1 text-[14px] font-semibold">
          庫存與保養卡
        </legend>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={v.track_stock}
              disabled={nonStock || trackingLocked || v.track_serial}
              onChange={(e) => set("track_stock", e.target.checked)}
            />
            追蹤庫存
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={v.track_serial}
              disabled={nonStock || trackingLocked || v.mx_card_type !== null}
              onChange={(e) => set("track_serial", e.target.checked)}
            />
            追蹤機號（逐台）
          </label>
          <p className="text-text-muted text-[12px]">
            {nonStock
              ? "服務／費用不追蹤庫存與機號。"
              : trackingLocked
                ? "此品項已有庫存異動，追蹤設定不可變更。"
                : "追蹤機號必追蹤庫存；建立保養卡需追蹤機號。"}
          </p>
        </div>
        <Field
          label="銷貨建立保養卡"
          htmlFor="mx_card_type"
          hint="選擇卡別後，銷貨過帳會自動建立保養卡機台。"
        >
          <select
            id="mx_card_type"
            className={ERP_SELECT}
            value={v.mx_card_type ?? ""}
            disabled={nonStock}
            onChange={(e) =>
              set(
                "mx_card_type",
                e.target.value ? (e.target.value as MxCardType) : null,
              )
            }
          >
            <option value="">不建卡</option>
            {(Object.keys(MX_CARD_TYPE_LABEL) as MxCardType[]).map((k) => (
              <option key={k} value={k}>
                {MX_CARD_TYPE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="安全存量" htmlFor="safety_stock">
          <NumberInput
            id="safety_stock"
            value={v.safety_stock}
            decimals={3}
            disabled={!v.track_stock}
            onChange={(n) => set("safety_stock", n)}
          />
        </Field>
      </fieldset>

      <div className="border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2">
        <Field label="售價（預設單價）" htmlFor="sale_price">
          <NumberInput
            id="sale_price"
            value={v.sale_price ?? 0}
            decimals={2}
            onChange={(n) => set("sale_price", n)}
          />
        </Field>
        <Field label="進價（預設單價）" htmlFor="purchase_price">
          <NumberInput
            id="purchase_price"
            value={v.purchase_price ?? 0}
            decimals={2}
            onChange={(n) => set("purchase_price", n)}
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
