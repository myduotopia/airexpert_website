// 草稿單據的輸入驗證。純函式，client 可先檢查、server 必再檢查。
// - collectDraftDocumentErrors：存草稿前的檢核，一次列出所有錯誤（#240 B-08a）。只檢查「存得進 DB」的條件
//   （對應 erp_documents 的 check 約束與明顯的輸入錯誤）；validateDraftDocument 回其第一條，供 server 存草稿沿用。
// - collectPostErrors：過帳前可在前端先擋下的條件（倉庫、品項、數量、機號數），對齊 erp_post_document；
//   庫存不足、來源單累計量等需讀 DB 的檢查仍由 RPC 把關（RPC 一次只回一條錯誤）。
import { lineMissingItem } from "./draft";
import { formatQty } from "./format";
import {
  DOC_TYPES,
  TAX_TYPES,
  type DocType,
  type DraftDocument,
  type ItemOption,
} from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CUSTOMER_DOCS = new Set(["Q", "S", "SR"]);
const VENDOR_DOCS = new Set(["P", "I", "PR"]);
/** 品項行可不指定品項（只填品名規格）的單別。 */
const FREE_TEXT_LINE_DOCS = new Set(["Q", "S"]);

/** 合併多組錯誤訊息：略過 null／空字串，保留順序並去除重複。 */
export function mergeErrors(
  ...groups: (readonly string[] | string | null | undefined)[]
): string[] {
  const out: string[] = [];
  for (const g of groups) {
    for (const msg of typeof g === "string" ? [g] : (g ?? [])) {
      if (msg && !out.includes(msg)) out.push(msg);
    }
  }
  return out;
}

/**
 * 表單底部紅底錯誤清單實際要顯示的項目（#248 N-5）：已由即時提示（黃底）顯示的訊息不再重複列出。
 * 例：銷退金額超過可退上限時，即時提示與存檔檢核（或 server 回傳）是同一句，只留即時提示。
 * hints 為 null／空字串時略過；只排除完全相同的字串（金額已改的舊訊息不誤刪）。
 */
export function excludeLiveHints(
  errors: readonly string[],
  ...hints: (string | null | undefined)[]
): string[] {
  const shown = new Set(hints.filter((h): h is string => !!h));
  return errors.filter((e) => !shown.has(e));
}

/** 存草稿前的檢核：回傳全部錯誤（依表頭 → 各行順序）；通過回空陣列。 */
export function collectDraftDocumentErrors(doc: DraftDocument): string[] {
  const errors: string[] = [];
  const add = (msg: string) => errors.push(msg);

  if (!DOC_TYPES.includes(doc.doc_type)) add("單別不正確。");
  if (!ISO_DATE.test(doc.doc_date ?? "")) add("請填寫單據日期。");
  if (doc.expected_date && !ISO_DATE.test(doc.expected_date)) {
    add("預計日期格式不正確。");
  }
  if (CUSTOMER_DOCS.has(doc.doc_type) && !doc.customer_id) {
    add("請選擇客戶。");
  }
  if (VENDOR_DOCS.has(doc.doc_type) && !doc.vendor_id) {
    add("請選擇廠商。");
  }
  if (doc.doc_type === "T") {
    if (!doc.warehouse_id || !doc.to_warehouse_id) {
      add("調撥單需選擇來源倉與目的倉。");
    } else if (doc.warehouse_id === doc.to_warehouse_id) {
      add("調撥單的來源倉與目的倉不可相同。");
    }
  }
  if (!TAX_TYPES.includes(doc.tax_type)) add("稅別不正確。");
  if (!Number.isFinite(doc.tax_rate) || doc.tax_rate < 0 || doc.tax_rate >= 1) {
    add("稅率需介於 0 與 1 之間（例 0.05）。");
  }
  if (!doc.currency?.trim()) add("請填寫幣別。");
  if (!Number.isFinite(doc.exchange_rate) || doc.exchange_rate <= 0) {
    add("匯率需大於 0。");
  }

  const seenSerials = new Set<string>();
  for (const [i, line] of doc.lines.entries()) {
    const n = i + 1;
    if (line.line_type === "item") {
      if (!line.item_id) {
        // 報價單可自由輸入（品項文字或品名規格）；由其轉入的銷貨草稿也可先存，過帳時 RPC 會要求指定品項。
        if (!FREE_TEXT_LINE_DOCS.has(doc.doc_type)) {
          add(`第 ${n} 行請選擇品項。`);
        } else if (!line.item_text?.trim() && !line.description?.trim()) {
          add(`第 ${n} 行請選擇品項或填寫品名規格。`);
        }
      }
      if (!Number.isFinite(line.qty)) add(`第 ${n} 行數量不正確。`);
      if (!Number.isFinite(line.unit_price)) add(`第 ${n} 行單價不正確。`);
      for (const id of line.serial_ids ?? []) {
        if (seenSerials.has(`id:${id}`)) add(`第 ${n} 行機號重複選取。`);
        seenSerials.add(`id:${id}`);
      }
      for (const no of line.serial_nos ?? []) {
        const k = `no:${line.item_id}:${no.trim().toLowerCase()}`;
        if (seenSerials.has(k)) add(`第 ${n} 行機號「${no}」重複。`);
        seenSerials.add(k);
      }
    } else if (line.line_type === "discount") {
      if (!Number.isFinite(line.amount)) add(`第 ${n} 行折扣金額不正確。`);
    } else if (line.line_type === "subtotal") {
      // 小計行只開放報價單（轉銷貨單時改為備註行，見 quoteToSaleDraft）。
      if (doc.doc_type !== "Q") add(`第 ${n} 行「小計」只能用於報價單。`);
    } else if (line.line_type !== "note") {
      add(`第 ${n} 行類型不正確。`);
    }
  }
  return mergeErrors(errors);
}

/** 回傳第一個錯誤訊息；通過回 null（server 存草稿沿用：RPC／server 錯誤一次一條）。 */
export function validateDraftDocument(doc: DraftDocument): string | null {
  return collectDraftDocumentErrors(doc)[0] ?? null;
}

/** 過帳需指定倉庫的單別與未選時的訊息（對齊 erp_post_document 表頭驗證）。 */
const POST_WAREHOUSE_MESSAGE: Partial<Record<DocType, string>> = {
  S: "請選擇出庫倉。",
  PR: "請選擇出庫倉。",
  SR: "請選擇入庫倉。",
  I: "請選擇入庫倉。",
  A: "請選擇倉庫。",
  T: "請選擇來源倉。",
};

/** collectPostErrors 需要的品項設定（ItemOption 的子集）。 */
export type PostCheckItem = Pick<ItemOption, "id" | "code" | "track_serial">;

/**
 * 過帳前可在前端先擋下的條件（規則與訊息對齊 erp_post_document 的行驗證），一次列出所有錯誤。
 * items 找不到的品項（例如本頁就地新增、清單未含）不檢查機號，交由 RPC 把關。
 * 全空的品項行沿用存草稿的訊息，與 collectDraftDocumentErrors 以 mergeErrors 合併時只列一次。
 */
export function collectPostErrors(
  doc: Pick<DraftDocument, "doc_type" | "warehouse_id" | "lines">,
  items: readonly PostCheckItem[],
): string[] {
  const errors: string[] = [];
  const add = (msg: string) => errors.push(msg);
  const byId = new Map(items.map((it) => [it.id, it]));
  const type = doc.doc_type;

  const whMsg = POST_WAREHOUSE_MESSAGE[type];
  if (whMsg && !doc.warehouse_id) add(whMsg);
  if (!doc.lines.some((l) => l.line_type === "item")) {
    add("單據至少需要一個品項行。");
  }

  for (const [i, line] of doc.lines.entries()) {
    if (line.line_type !== "item") continue;
    const n = i + 1;
    const item = line.item_id ? byId.get(line.item_id) : undefined;
    if (!line.item_id && type !== "Q") {
      // 訊息與存草稿檢核一致者（全空行、非自由輸入單別）合併時只列一次。
      add(
        !FREE_TEXT_LINE_DOCS.has(type)
          ? `第 ${n} 行請選擇品項。`
          : lineMissingItem(line)
            ? `第 ${n} 行尚未選擇品項，過帳前需選定。`
            : `第 ${n} 行請選擇品項或填寫品名規格。`,
      );
    }
    const name =
      item?.code ||
      line.item_text?.trim() ||
      line.description?.trim().split("\n")[0] ||
      "";
    const at = name ? `第 ${n} 行（${name}）` : `第 ${n} 行`;
    const qty = Number(line.qty);
    if (!Number.isFinite(qty)) continue; // 存草稿檢核已列出
    if (qty === 0) add(`${at}數量不可為 0。`);
    if (qty < 0 && type !== "A") add(`${at}數量需為正數。`);
    if (type === "A" && !line.description?.trim()) {
      add(`第 ${n} 行需填寫調整原因。`);
    }

    if (!item?.track_serial || type === "Q" || type === "P" || qty === 0) {
      continue;
    }
    const absQty = Math.abs(qty);
    if (!Number.isInteger(absQty)) {
      add(`${at}追蹤機號的品項數量需為整數。`);
      continue;
    }
    if (type === "I" || (type === "A" && qty > 0)) {
      const nos = line.serial_nos ?? [];
      const filled = nos.map((s) => s.trim()).filter(Boolean);
      const unique = new Set(filled.map((s) => s.toLowerCase()));
      if (filled.length !== nos.length || unique.size !== filled.length) {
        add(`${at}機號有空白或重複。`);
      } else if (filled.length !== absQty) {
        add(`${at}機號數 ${filled.length} 與數量 ${formatQty(qty)} 不符。`);
      }
    } else {
      const picked = (line.serial_ids ?? []).length;
      if (picked !== absQty) {
        add(`${at}選取機號數 ${picked} 與數量 ${formatQty(qty)} 不符。`);
      }
    }
  }
  return mergeErrors(errors);
}
