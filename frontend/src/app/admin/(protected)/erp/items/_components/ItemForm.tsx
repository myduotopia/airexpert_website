"use client";
// 品項新增／編輯表單（受控；錯誤時保留輸入）。
// kind 連動：服務／費用強制關閉庫存與機號追蹤；整機預設追蹤機號；建保養卡需追蹤機號。
// 傳 onSaved 時為「就地新增」模式（建單頁 Dialog 內，#218）：只新增、不導頁不 refresh，
// 存檔後以新品項的 Picker 選項回呼；取消改呼叫 onCancel；
// 精簡欄位：不顯示預設廠商、安全存量、啟用勾選（一律啟用，其餘可日後到品項主檔補）。
import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ItemKind,
  ItemOption,
  MxCardType,
  VendorOption,
} from "@/lib/erp/types";
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
  vendors = [],
  hasStockActivity = false,
  onSaved,
  onCancel,
}: {
  /** 有值 = 編輯。 */
  itemId?: string;
  initial: ItemInput;
  /** 預設廠商選項（就地新增模式不顯示預設廠商，可不傳）。 */
  vendors?: VendorOption[];
  /** 已有庫存異動：追蹤設定不可再變更（server 亦會擋）。 */
  hasStockActivity?: boolean;
  /** 就地新增：存檔成功後回呼（不導頁）。 */
  onSaved?: (id: string, option: ItemOption) => void;
  /** 就地新增：取消鈕改呼叫此回呼。 */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const uid = useId();
  // Dialog 內欄位 id 加前綴，避免與單據頁其他欄位撞 id。
  const fid = (key: string) => (embedded ? `${uid}-${key}` : key);
  const card = embedded
    ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
    : "border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2";
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
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      if (onSaved) {
        const created = await createItemAction(v);
        if (!created.ok) {
          setError(created.error);
          setBusy(false);
          return;
        }
        onSaved(created.id, created.option);
        return;
      }
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
      <div className={card}>
        <Field label="產品編號" htmlFor={fid("code")} required>
          <input
            id={fid("code")}
            data-autofocus={embedded && !v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="例：ALH-15AI"
            required
          />
        </Field>
        <Field label="類別" htmlFor={fid("kind")} required>
          <select
            id={fid("kind")}
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
        <Field label="品名規格" htmlFor={fid("name")} required wide>
          <input
            id={fid("name")}
            data-autofocus={embedded && !!v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field label="單位" htmlFor={fid("unit")}>
          <input
            id={fid("unit")}
            className={ERP_INPUT}
            value={v.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="台"
          />
        </Field>
        <Field label="品牌" htmlFor={fid("brand")}>
          <input
            id={fid("brand")}
            className={ERP_INPUT}
            value={v.brand}
            onChange={(e) => set("brand", e.target.value)}
          />
        </Field>
        <Field
          label="機型"
          htmlFor={fid("model")}
          hint="銷貨建立保養卡機台時帶入機型（空白則用品名）。"
        >
          <input
            id={fid("model")}
            className={ERP_INPUT}
            value={v.model}
            onChange={(e) => set("model", e.target.value)}
          />
        </Field>
        {!embedded && (
          <Field label="預設廠商" htmlFor="default_vendor_id">
            <VendorPicker
              id="default_vendor_id"
              options={vendors}
              value={v.default_vendor_id}
              onChange={(id) => set("default_vendor_id", id)}
            />
          </Field>
        )}
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
          htmlFor={fid("mx_card_type")}
          hint="選擇卡別後，銷貨過帳會自動建立保養卡機台。"
        >
          <select
            id={fid("mx_card_type")}
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
        {!embedded && (
          <Field label="安全存量" htmlFor="safety_stock">
            <NumberInput
              id="safety_stock"
              value={v.safety_stock}
              decimals={3}
              disabled={!v.track_stock}
              onChange={(n) => set("safety_stock", n)}
            />
          </Field>
        )}
      </fieldset>

      <div className={card}>
        <Field label="售價（預設單價）" htmlFor={fid("sale_price")}>
          <NumberInput
            id={fid("sale_price")}
            value={v.sale_price ?? 0}
            decimals={2}
            onChange={(n) => set("sale_price", n)}
          />
        </Field>
        <Field label="進價（預設單價）" htmlFor={fid("purchase_price")}>
          <NumberInput
            id={fid("purchase_price")}
            value={v.purchase_price ?? 0}
            decimals={2}
            onChange={(n) => set("purchase_price", n)}
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
