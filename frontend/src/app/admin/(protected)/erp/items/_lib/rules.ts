// 品項基本資料的純規則（client 表單與 server action 共用；不可 import server-only 模組）。
// 對應 migration 0020 的 erp_items check constraints：
//   * service / expense → track_stock = false、track_serial = false
//   * track_serial → track_stock
//   * mx_card_type 非 null → track_serial（保養卡機台需要機號）
import type { ItemKind, MxCardType } from "@/lib/erp/types";

export const ITEM_KINDS: readonly ItemKind[] = [
  "machine",
  "part",
  "service",
  "expense",
];

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  machine: "整機",
  part: "零件耗材",
  service: "服務",
  expense: "費用",
};

export const MX_CARD_TYPE_LABEL: Record<MxCardType, string> = {
  compressor: "空壓機卡",
  filter: "過濾卡",
};

/** 表單送出的品項輸入（受控表單的 state，可序列化）。 */
export interface ItemInput {
  code: string;
  name: string;
  kind: ItemKind;
  unit: string;
  track_stock: boolean;
  track_serial: boolean;
  mx_card_type: MxCardType | null;
  brand: string;
  model: string;
  sale_price: number | null;
  purchase_price: number | null;
  safety_stock: number;
  default_vendor_id: string | null;
  active: boolean;
  note: string;
}

/** 寫入 erp_items 的欄位（不含 avg_cost：只能由過帳寫入）。 */
export interface ItemRow {
  code: string;
  name: string;
  kind: ItemKind;
  unit: string;
  track_stock: boolean;
  track_serial: boolean;
  mx_card_type: MxCardType | null;
  brand: string | null;
  model: string | null;
  sale_price: number | null;
  purchase_price: number | null;
  safety_stock: number;
  default_vendor_id: string | null;
  active: boolean;
  note: string | null;
}

/** 服務 / 費用：不追蹤庫存與機號。 */
export function isNonStockKind(kind: ItemKind): boolean {
  return kind === "service" || kind === "expense";
}

/**
 * 依 kind 套用追蹤設定規則（client 切換 kind / 勾選時即時套用，server 存檔前再套一次）。
 * 規則優先序：非庫存類別全部關閉 → 有保養卡則必追蹤機號 → 追蹤機號必追蹤庫存。
 */
export function applyItemKindRules<
  T extends Pick<
    ItemInput,
    "kind" | "track_stock" | "track_serial" | "mx_card_type"
  >,
>(input: T): T {
  if (isNonStockKind(input.kind)) {
    return {
      ...input,
      track_stock: false,
      track_serial: false,
      mx_card_type: null,
    };
  }
  const track_serial = input.track_serial || input.mx_card_type !== null;
  const track_stock = input.track_stock || track_serial;
  return { ...input, track_serial, track_stock };
}

/** 新增品項的預設值；整機預設追蹤機號。 */
export function defaultItemInput(kind: ItemKind = "part"): ItemInput {
  return applyItemKindRules({
    code: "",
    name: "",
    kind,
    unit: kind === "machine" ? "台" : kind === "part" ? "個" : "式",
    track_stock: true,
    track_serial: kind === "machine",
    mx_card_type: null,
    brand: "",
    model: "",
    sale_price: null,
    purchase_price: null,
    safety_stock: 0,
    default_vendor_id: null,
    active: true,
    note: "",
  });
}

function text(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

function money(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number.isFinite(v) ? v : null;
}

/** 驗證 + 正規化品項輸入。錯誤回中文訊息。 */
export function normalizeItemInput(
  input: ItemInput,
): { ok: true; row: ItemRow } | { ok: false; error: string } {
  const code = (input.code ?? "").trim();
  const name = (input.name ?? "").trim();
  if (!code) return { ok: false, error: "請填寫產品編號。" };
  if (!name) return { ok: false, error: "請填寫品名規格。" };
  if (!ITEM_KINDS.includes(input.kind)) {
    return { ok: false, error: "品項類別不正確。" };
  }
  const mx =
    input.mx_card_type === "compressor" || input.mx_card_type === "filter"
      ? input.mx_card_type
      : null;
  const sale = money(input.sale_price);
  const purchase = money(input.purchase_price);
  const safety = Number.isFinite(input.safety_stock) ? input.safety_stock : 0;
  if ((sale ?? 0) < 0 || (purchase ?? 0) < 0 || safety < 0) {
    return { ok: false, error: "售價、進價與安全存量不可為負數。" };
  }
  const ruled = applyItemKindRules({
    kind: input.kind,
    track_stock: !!input.track_stock,
    track_serial: !!input.track_serial,
    mx_card_type: mx,
  });
  return {
    ok: true,
    row: {
      code,
      name,
      kind: ruled.kind,
      unit: text(input.unit) ?? "台",
      track_stock: ruled.track_stock,
      track_serial: ruled.track_serial,
      mx_card_type: ruled.mx_card_type,
      brand: text(input.brand),
      model: text(input.model),
      sale_price: sale,
      purchase_price: purchase,
      safety_stock: safety,
      default_vendor_id: text(input.default_vendor_id),
      active: input.active !== false,
      note: text(input.note),
    },
  };
}
