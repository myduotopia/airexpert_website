// 草稿（編輯中單據）的建構 / 轉換純函式。client 表單與 server 共用。
import type {
  DocType,
  DraftDocument,
  DraftLine,
  ErpDocumentWithLines,
  LineType,
  TaxType,
} from "./types";

let keySeq = 0;

/** 產生 client 端穩定 key（不需密碼學強度，僅作 React key）。 */
export function newLineKey(): string {
  keySeq += 1;
  return `l${Date.now().toString(36)}${keySeq.toString(36)}`;
}

/** 新的一行空白明細。 */
export function newDraftLine(
  lineType: LineType = "item",
  patch: Partial<DraftLine> = {},
): DraftLine {
  return {
    key: newLineKey(),
    id: null,
    line_type: lineType,
    item_id: null,
    description: "",
    qty: lineType === "item" ? 1 : 0,
    unit_price: 0,
    amount: 0,
    source_line_id: null,
    serial_ids: [],
    serial_nos: [],
    ...patch,
  };
}

/** 單別的預設稅別：T / A 不涉及金額 → 免稅；其餘外加 5%。 */
export function defaultTaxType(docType: DocType): TaxType {
  return docType === "T" || docType === "A" ? "exempt" : "excluded";
}

/** 新的空白草稿單據。 */
export function newDraftDocument(
  docType: DocType,
  docDate: string,
  patch: Partial<DraftDocument> = {},
): DraftDocument {
  return {
    id: null,
    doc_type: docType,
    doc_date: docDate,
    customer_id: null,
    vendor_id: null,
    warehouse_id: null,
    to_warehouse_id: null,
    source_doc_id: null,
    sales_rep: null,
    tax_type: defaultTaxType(docType),
    tax_rate: 0.05,
    currency: "TWD",
    exchange_rate: 1,
    invoice_no: null,
    expected_date: null,
    note: null,
    lines: [],
    ...patch,
  };
}

/** DB 單據（getDocumentWithLines）→ 可編輯草稿。 */
export function draftDocumentFromRow(doc: ErpDocumentWithLines): DraftDocument {
  return {
    id: doc.id,
    doc_type: doc.doc_type,
    doc_date: doc.doc_date,
    customer_id: doc.customer_id,
    vendor_id: doc.vendor_id,
    warehouse_id: doc.warehouse_id,
    to_warehouse_id: doc.to_warehouse_id,
    source_doc_id: doc.source_doc_id,
    sales_rep: doc.sales_rep,
    tax_type: doc.tax_type,
    tax_rate: Number(doc.tax_rate),
    currency: doc.currency,
    exchange_rate: Number(doc.exchange_rate),
    invoice_no: doc.invoice_no,
    expected_date: doc.expected_date,
    note: doc.note,
    lines: [...doc.lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l) =>
        newDraftLine(l.line_type, {
          id: l.id,
          item_id: l.item_id,
          description: l.description ?? "",
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
          amount: Number(l.amount),
          source_line_id: l.source_line_id,
          serial_ids: (l.serials ?? []).map((s) => s.id),
          serial_nos: l.serial_nos ?? [],
        }),
      ),
  };
}

/** 多行文字 → 機號陣列（每行一個，去空白、去空行、去重複，保留順序）。 */
export function parseSerialLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
