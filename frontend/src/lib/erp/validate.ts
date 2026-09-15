// 草稿單據的輸入驗證（存草稿前）。純函式，client 可先檢查、server 必再檢查。
// 只檢查「存得進 DB」的條件（對應 erp_documents 的 check 約束與明顯的輸入錯誤）；
// 過帳才需要的條件（qty ≠ 0、序號數 = qty、倉庫必填…）由 erp_post_document 把關。
import { DOC_TYPES, TAX_TYPES, type DraftDocument } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CUSTOMER_DOCS = new Set(["Q", "S", "SR"]);
const VENDOR_DOCS = new Set(["P", "I", "PR"]);

/** 回傳第一個錯誤訊息；通過回 null。 */
export function validateDraftDocument(doc: DraftDocument): string | null {
  if (!DOC_TYPES.includes(doc.doc_type)) return "單別不正確。";
  if (!ISO_DATE.test(doc.doc_date ?? "")) return "請填寫單據日期。";
  if (doc.expected_date && !ISO_DATE.test(doc.expected_date)) {
    return "預計日期格式不正確。";
  }
  if (CUSTOMER_DOCS.has(doc.doc_type) && !doc.customer_id) {
    return "請選擇客戶。";
  }
  if (VENDOR_DOCS.has(doc.doc_type) && !doc.vendor_id) {
    return "請選擇廠商。";
  }
  if (doc.doc_type === "T") {
    if (!doc.warehouse_id || !doc.to_warehouse_id) {
      return "調撥單需選擇來源倉與目的倉。";
    }
    if (doc.warehouse_id === doc.to_warehouse_id) {
      return "調撥單的來源倉與目的倉不可相同。";
    }
  }
  if (!TAX_TYPES.includes(doc.tax_type)) return "稅別不正確。";
  if (!Number.isFinite(doc.tax_rate) || doc.tax_rate < 0 || doc.tax_rate >= 1) {
    return "稅率需介於 0 與 1 之間（例 0.05）。";
  }
  if (!doc.currency?.trim()) return "請填寫幣別。";
  if (!Number.isFinite(doc.exchange_rate) || doc.exchange_rate <= 0) {
    return "匯率需大於 0。";
  }

  const seenSerials = new Set<string>();
  for (const [i, line] of doc.lines.entries()) {
    const n = i + 1;
    if (line.line_type === "item") {
      if (!line.item_id) return `第 ${n} 行請選擇品項。`;
      if (!Number.isFinite(line.qty)) return `第 ${n} 行數量不正確。`;
      if (!Number.isFinite(line.unit_price)) return `第 ${n} 行單價不正確。`;
      for (const id of line.serial_ids ?? []) {
        if (seenSerials.has(`id:${id}`)) return `第 ${n} 行機號重複選取。`;
        seenSerials.add(`id:${id}`);
      }
      for (const no of line.serial_nos ?? []) {
        const k = `no:${line.item_id}:${no.trim().toLowerCase()}`;
        if (seenSerials.has(k)) return `第 ${n} 行機號「${no}」重複。`;
        seenSerials.add(k);
      }
    } else if (line.line_type === "discount") {
      if (!Number.isFinite(line.amount)) return `第 ${n} 行折扣金額不正確。`;
    } else if (line.line_type !== "note") {
      return `第 ${n} 行類型不正確。`;
    }
  }
  return null;
}
