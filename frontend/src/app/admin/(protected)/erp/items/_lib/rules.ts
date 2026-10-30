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
  /** 馬力（選填，原文照存，例「15HP」）：銷貨建立保養卡機台時帶入（0042）。 */
  horsepower: string;
  /** 電壓（選填，例「220V」）：銷貨建立保養卡機台時帶入（0042）。 */
  voltage: string;
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
  horsepower: string | null;
  voltage: string | null;
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

/** 各類別的預設單位：整機「台」、零件耗材「個」、服務／費用「式」。 */
export function defaultUnitForKind(kind: ItemKind): string {
  return kind === "machine" ? "台" : kind === "part" ? "個" : "式";
}

/** 新增整機時預設的保養卡卡別（#282：避免賣出的整機不出現在保養卡）。 */
export const MACHINE_DEFAULT_CARD_TYPE: MxCardType = "compressor";

/** 新增品項的預設值；整機預設追蹤機號並建立空壓機卡。 */
export function defaultItemInput(kind: ItemKind = "part"): ItemInput {
  return applyItemKindRules({
    code: "",
    name: "",
    kind,
    unit: defaultUnitForKind(kind),
    track_stock: true,
    track_serial: kind === "machine",
    mx_card_type: kind === "machine" ? MACHINE_DEFAULT_CARD_TYPE : null,
    brand: "",
    model: "",
    horsepower: "",
    voltage: "",
    sale_price: null,
    purchase_price: null,
    safety_stock: 0,
    default_vendor_id: null,
    active: true,
    note: "",
  });
}

/** 表單切換類別時的上下文。 */
export interface KindChangeContext {
  /** 新增品項（含就地新增）；編輯既有品項為 false。 */
  isNew: boolean;
  /** 使用者已手動修改過單位：不再自動切換。 */
  unitTouched: boolean;
  /** 使用者已手動選過保養卡卡別：不再自動帶入或清除。 */
  cardTouched: boolean;
}

/**
 * 切換類別（client 表單）：只在「新增品項」時套用預設，編輯既有品項不悄悄改動已存的設定。
 *   * 切到整機：預設追蹤機號與庫存；保養卡仍是「不建卡」且未手動選過 → 預設空壓機卡（#282）。
 *   * 由整機切走：保養卡仍是自動帶入的空壓機卡（未手動選過）→ 還原「不建卡」。
 *   * 由服務／費用切到庫存類別：預設追蹤庫存。
 *   * 單位未手動修改且仍是原類別的預設值 → 改為新類別的預設（整機「台」，切回還原「個」／「式」）（P3-5）。
 * 最後一律套用 applyItemKindRules（服務／費用關閉追蹤與保養卡等）。
 */
export function applyKindChange(
  prev: ItemInput,
  kind: ItemKind,
  ctx: KindChangeContext,
): ItemInput {
  const next: ItemInput = { ...prev, kind };
  if (ctx.isNew && kind !== prev.kind) {
    if (kind === "machine") {
      next.track_stock = true;
      next.track_serial = true;
      if (!ctx.cardTouched && prev.mx_card_type === null) {
        next.mx_card_type = MACHINE_DEFAULT_CARD_TYPE;
      }
    } else if (
      prev.kind === "machine" &&
      !ctx.cardTouched &&
      prev.mx_card_type === MACHINE_DEFAULT_CARD_TYPE
    ) {
      next.mx_card_type = null;
    }
    if (!isNonStockKind(kind) && isNonStockKind(prev.kind)) {
      next.track_stock = true;
    }
    if (
      !ctx.unitTouched &&
      prev.unit.trim() === defaultUnitForKind(prev.kind)
    ) {
      next.unit = defaultUnitForKind(kind);
    }
  }
  return applyItemKindRules(next);
}

/** 整機但不建保養卡：表單顯示提示「此整機銷貨後不會出現在保養卡」。 */
export function isMachineWithoutCard(
  input: Pick<ItemInput, "kind" | "mx_card_type">,
): boolean {
  return input.kind === "machine" && input.mx_card_type === null;
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
      horsepower: text(input.horsepower),
      voltage: text(input.voltage),
      sale_price: sale,
      purchase_price: purchase,
      safety_stock: safety,
      default_vendor_id: text(input.default_vendor_id),
      active: input.active !== false,
      note: text(input.note),
    },
  };
}
