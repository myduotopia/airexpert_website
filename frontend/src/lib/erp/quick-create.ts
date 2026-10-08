// 建單時就地新增主檔（#218）的純邏輯：選項合併、Combobox 結果清單、新增項文字、表單初始值。
// client（Combobox / Picker / Dialog）與測試共用；不可 import server-only 模組（型別除外）。
import type {
  CustomerInput,
  VendorInput,
  WarehouseInput,
} from "./queries/master-data";
import type { DocType } from "./types";

/**
 * 合併 server 傳入的選項與就地新增的選項（依 id 去重，base 版本優先）。
 * 父層重新以 props 傳入 options（例如 server action revalidate 後重新渲染）時，
 * 新增項若已在 base 中就以 base 為準；不在則接在最後，不會被洗掉。
 * 沒有需要追加的項目時回傳 base 本身（同一參考），讓下游 useMemo 不必重算。
 */
export function mergeOptions<T extends { id: string }>(
  base: T[],
  added: readonly T[],
): T[] {
  if (added.length === 0) return base;
  const seen = new Set(base.map((o) => o.id));
  const extra: T[] = [];
  for (const o of added) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    extra.push(o);
  }
  return extra.length === 0 ? base : [...base, ...extra];
}

/** 單據上可就地新增的主檔。 */
export interface QuickCreateTargets {
  customer: boolean;
  vendor: boolean;
  warehouse: boolean;
  item: boolean;
}

/**
 * 各單別允許就地新增哪些主檔。
 * 退貨單（銷退 SR／進退 PR）一律由來源單帶入：客戶／廠商與品項行必須來自來源單
 * （SR 存檔時 server 會擋「銷退品項須來自原銷貨單」），新建的對象不可能出現在來源單上，
 * 所以不提供新增；PR 的出庫倉為原入庫倉（新倉沒有可退的庫存），也不提供。
 * SR 的入庫倉可以是任一倉，保留新增倉庫。
 */
export function quickCreateTargets(docType: DocType): QuickCreateTargets {
  switch (docType) {
    case "Q":
    case "S":
      return { customer: true, vendor: false, warehouse: true, item: true };
    case "SR":
      return { customer: false, vendor: false, warehouse: true, item: false };
    case "P":
    case "I":
      return { customer: false, vendor: true, warehouse: true, item: true };
    case "PR":
      return { customer: false, vendor: false, warehouse: false, item: false };
    case "T":
    case "A":
      return { customer: false, vendor: false, warehouse: true, item: true };
  }
}

/**
 * 輸入法（注音、倉頡等）組字中的按鍵：選字用的 Enter／方向鍵不可當成 Combobox 的操作。
 * Chrome 組字中 keydown 為 isComposing=true（key 仍可能是 "Enter"）；
 * Safari 確認選字的 Enter 在 compositionend 之後才觸發、isComposing=false，但 keyCode 為 229。
 * 不擋的話，用注音打一個不存在的名稱、按 Enter 選字就會直接開「新增」Dialog（清單只剩新增項）。
 */
export function isImeComposing(e: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return !!e.isComposing || e.keyCode === 229;
}

/** Combobox 的 client 端搜尋：不分大小寫部分比對，最多 max 筆；空白查詢回前 max 筆。 */
export function filterComboboxOptions<T>(
  options: readonly T[],
  query: string,
  getText: (option: T) => string,
  max: number,
): T[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? options.filter((o) => getText(o).toLowerCase().includes(q))
    : options;
  return matched.slice(0, max);
}

export type ComboboxEntry<T> =
  | { kind: "option"; option: T }
  | { kind: "create"; query: string };

/**
 * Combobox 下拉清單的項目：搜尋結果，允許新增時最後再接一個「＋ 新增」項
 * （查無結果時也有，鍵盤 ↑↓ Enter 與滑鼠都能選）。
 */
export function comboboxEntries<T>(
  results: readonly T[],
  query: string,
  canCreate: boolean,
): ComboboxEntry<T>[] {
  const entries: ComboboxEntry<T>[] = results.map((option) => ({
    kind: "option",
    option,
  }));
  if (canCreate) entries.push({ kind: "create", query: query.trim() });
  return entries;
}

/** 新增項文字：有查詢字 →「＋ 新增『xxx』」；空白 →「＋ 新增…」。noun 例：「品項」。 */
export function quickCreateLabel(query: string, noun = ""): string {
  const q = query.trim();
  return q ? `＋ 新增${noun}『${q}』` : `＋ 新增${noun}…`;
}

/**
 * 依搜尋字推測使用者輸入的是代碼還是名稱（Dialog 預先帶入用，使用者可再改）：
 * 純英數與 - _ . / 組成、無空白且含數字（例：KE108、AM3-22A-E30）→ 代碼；其餘 → 名稱。
 */
export function guessCodeOrName(query: string): { code: string; name: string } {
  const q = query.trim();
  if (!q) return { code: "", name: "" };
  const looksLikeCode =
    /^[A-Za-z0-9][A-Za-z0-9\-_./]*$/.test(q) && /\d/.test(q);
  return looksLikeCode ? { code: q, name: "" } : { code: "", name: q };
}

// ── Dialog 表單初始值（與 /new 頁的預設相同） ────────────────────

export function emptyCustomerInput(
  patch: Partial<CustomerInput> = {},
): CustomerInput {
  return {
    code: "",
    name: "",
    contact_person: "",
    phone: "",
    address: "",
    note: "",
    tax_id: "",
    invoice_title: "",
    delivery_address: "",
    payment_terms: "",
    sales_rep: "",
    sales_rep_id: null,
    fax: "",
    mail_recipient: "",
    email: "",
    erp_active: true,
    ...patch,
  };
}

export function emptyVendorInput(
  patch: Partial<VendorInput> = {},
): VendorInput {
  return {
    code: "",
    name: "",
    tax_id: "",
    contact_person: "",
    phone: "",
    fax: "",
    email: "",
    address: "",
    currency: "TWD",
    payment_terms: "",
    active: true,
    note: "",
    ...patch,
  };
}

export function emptyWarehouseInput(
  patch: Partial<WarehouseInput> = {},
): WarehouseInput {
  return {
    code: "",
    name: "",
    is_default: false,
    active: true,
    note: "",
    ...patch,
  };
}
