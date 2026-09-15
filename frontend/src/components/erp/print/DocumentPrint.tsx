// 單據 A4 列印（spec §7）：報價 / 銷貨 / 銷退、採購 / 進貨 / 進退、調撥 / 盤點調整。server component。
// 分頁由 paginateLines 決定：每頁重複公司抬頭、單據資料與明細表頭；合計 / 總計只在最後一頁。
import { Fragment } from "react";
import { rocDate } from "@/lib/admin/minguo";
import { formatMoney, formatQty } from "@/lib/erp/format";
import {
  buildPrintLines,
  DOC_PRINT_ROWS,
  formatUnitPrice,
  paginateLines,
  PRINT_DOC_TITLE,
  printDocKind,
  printLineRows,
  watermarkText,
  type PrintDocKind,
  type PrintLine,
} from "@/lib/erp/print";
import type { DocumentPrintContext } from "@/lib/erp/queries/print";
import type { ErpDocumentWithLines, TaxType } from "@/lib/erp/types";
import {
  PartyGrid,
  PrintSheet,
  SignatureBoxes,
  type PartyField,
} from "./PrintSheet";

const TAX_LABEL: Record<TaxType, string> = {
  excluded: "外加",
  included: "內含",
  exempt: "免稅",
};

function warehouseText(
  ctx: DocumentPrintContext,
  id: string | null,
): string | null {
  if (!id) return null;
  const w = ctx.warehouses.get(id);
  return w ? `${w.code} ${w.name}` : null;
}

function rate(v: number): string {
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function partyFields(
  doc: ErpDocumentWithLines,
  ctx: DocumentPrintContext,
  kind: PrintDocKind,
): PartyField[] {
  const fields: PartyField[] = [];
  if (kind === "customer") {
    fields.push(
      { label: "客戶名稱", value: doc.party_name },
      { label: "客戶編號", value: ctx.customerCode },
      { label: "統一編號", value: doc.party_tax_id },
      { label: "電話", value: doc.party_phone },
      { label: "聯絡人", value: doc.party_contact },
      { label: "業務", value: doc.sales_rep },
      {
        label: doc.doc_type === "SR" ? "地址" : "送貨地址",
        value: doc.party_address,
        wide: true,
      },
    );
    if (doc.doc_type === "Q") {
      fields.push({ label: "有效期限", value: rocDate(doc.expected_date) });
    } else {
      fields.push({ label: "發票號碼", value: doc.invoice_no });
    }
    fields.push({ label: "稅別", value: TAX_LABEL[doc.tax_type] });
  } else if (kind === "vendor") {
    fields.push(
      { label: "廠商編號", value: ctx.vendor?.code },
      { label: "廠商名稱", value: doc.party_name },
      { label: "聯絡人", value: doc.party_contact },
      { label: "電話", value: doc.party_phone },
      { label: "傳真", value: ctx.vendor?.fax },
      { label: "統一編號", value: doc.party_tax_id },
      { label: "地址", value: doc.party_address, wide: true },
    );
    if (doc.doc_type === "P") {
      fields.push(
        { label: "採購日期", value: rocDate(doc.doc_date) },
        { label: "交貨日期", value: rocDate(doc.expected_date) },
      );
    } else {
      fields.push(
        {
          label: doc.doc_type === "I" ? "進貨日期" : "退貨日期",
          value: rocDate(doc.doc_date),
        },
        {
          label: doc.doc_type === "I" ? "入庫倉" : "出庫倉",
          value: warehouseText(ctx, doc.warehouse_id),
        },
        { label: "發票號碼", value: doc.invoice_no },
        { label: "稅別", value: TAX_LABEL[doc.tax_type] },
      );
    }
    fields.push(
      { label: "幣別", value: doc.currency },
      { label: "匯率", value: rate(doc.exchange_rate) },
    );
  } else if (doc.doc_type === "T") {
    fields.push(
      { label: "來源倉", value: warehouseText(ctx, doc.warehouse_id) },
      { label: "目的倉", value: warehouseText(ctx, doc.to_warehouse_id) },
      { label: "備註", value: doc.note, wide: true },
    );
  } else {
    fields.push(
      {
        label: "倉庫",
        value: warehouseText(ctx, doc.warehouse_id),
        wide: true,
      },
      { label: "備註", value: doc.note, wide: true },
    );
  }
  if (doc.status === "voided" && doc.void_reason) {
    fields.push({ label: "作廢原因", value: doc.void_reason, wide: true });
  }
  return fields;
}

export function DocumentPrint({
  doc,
  ctx,
  logoUrl,
}: {
  doc: ErpDocumentWithLines;
  ctx: DocumentPrintContext;
  logoUrl: string;
}) {
  const kind = printDocKind(doc.doc_type);
  const hasPrice = kind !== "stock";
  const isAdjust = doc.doc_type === "A";
  const colCount = hasPrice ? 5 : isAdjust ? 4 : 3;
  const lines = buildPrintLines(doc, ctx.items);
  const pages = paginateLines(lines, {
    ...DOC_PRINT_ROWS,
    rowsOf: (l) => printLineRows(l),
  });
  const party = partyFields(doc, ctx, kind);
  const money = (v: number) => formatMoney(v, { currency: doc.currency });

  return (
    <div className="erp-sheets">
      {pages.map((page) => (
        <PrintSheet
          key={page.pageNo}
          logoUrl={logoUrl}
          title={PRINT_DOC_TITLE[doc.doc_type]}
          meta={[
            { label: "單號", value: doc.doc_no ?? "（草稿未取號）" },
            { label: "日期", value: rocDate(doc.doc_date) },
          ]}
          pageNo={page.pageNo}
          pageCount={page.pageCount}
          watermark={watermarkText(doc.status)}
        >
          <PartyGrid fields={party} />

          <table className="erp-lines">
            <colgroup>
              <col style={{ width: "28mm" }} />
              <col />
              <col style={{ width: hasPrice ? "20mm" : "24mm" }} />
              {hasPrice && <col style={{ width: "22mm" }} />}
              {hasPrice && <col style={{ width: "26mm" }} />}
              {isAdjust && <col style={{ width: "52mm" }} />}
            </colgroup>
            <thead>
              <tr>
                <th>產品編號</th>
                <th>品名規格</th>
                <th className="erp-num">{isAdjust ? "調整數量" : "數量"}</th>
                {hasPrice && <th className="erp-num">單價</th>}
                {hasPrice && <th className="erp-num">金額</th>}
                {isAdjust && <th>調整原因</th>}
              </tr>
            </thead>
            <tbody>
              {page.lines.length === 0 && (
                <tr className="erp-row-start">
                  <td colSpan={colCount} className="erp-note">
                    （無明細）
                  </td>
                </tr>
              )}
              {page.lines.map((line) => (
                <LineRows
                  key={line.key}
                  line={line}
                  colCount={colCount}
                  hasPrice={hasPrice}
                  isAdjust={isAdjust}
                  currency={doc.currency}
                />
              ))}
            </tbody>
          </table>
          {!page.isLast && <p className="erp-continued">（續下頁）</p>}

          <div className="erp-sheet-bottom">
            {page.isLast && hasPrice && (
              <div className="erp-summary">
                <div className="erp-remark">
                  <div className="erp-remark-label">備註</div>
                  {doc.note}
                </div>
                <table className="erp-totals">
                  <tbody>
                    <tr>
                      <th>{kind === "vendor" ? "合計金額" : "合計"}</th>
                      <td>{money(doc.amount_untaxed)}</td>
                    </tr>
                    <tr>
                      <th>
                        {kind === "vendor" ? "營業稅" : "稅額"}
                        {doc.tax_type !== "excluded" &&
                          `（${TAX_LABEL[doc.tax_type]}）`}
                      </th>
                      <td>{money(doc.tax_amount)}</td>
                    </tr>
                    <tr className="erp-grand">
                      <th>
                        {kind === "vendor" ? "總計金額" : "總計"}
                        {doc.currency !== "TWD" && ` ${doc.currency}`}
                      </th>
                      <td>{money(doc.total_amount)}</td>
                    </tr>
                    {doc.currency !== "TWD" && (
                      <tr>
                        <th>折合台幣</th>
                        <td>{formatMoney(doc.total_twd)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {kind === "customer" && (
              <>
                <p className="erp-ownership">
                  貨款未全部兌現前，貨物所有權仍歸本公司所有
                </p>
                <SignatureBoxes labels={["簽認處"]}>
                  <div style={{ flex: "0 0 60mm" }}>
                    <div className="erp-sign-label">業務</div>
                    <div>{doc.sales_rep}</div>
                  </div>
                </SignatureBoxes>
              </>
            )}
            {kind === "vendor" && (
              <SignatureBoxes labels={["主管", "承辦人", "請購人"]} />
            )}
            {kind === "stock" && (
              <SignatureBoxes labels={["主管", "承辦人", "經手人"]} />
            )}
          </div>
        </PrintSheet>
      ))}
    </div>
  );
}

function LineRows({
  line,
  colCount,
  hasPrice,
  isAdjust,
  currency,
}: {
  line: PrintLine;
  colCount: number;
  hasPrice: boolean;
  isAdjust: boolean;
  currency: string;
}) {
  if (line.kind === "note") {
    return (
      <tr className="erp-row-start">
        <td />
        <td colSpan={colCount - 1} className="erp-note">
          {line.name}
        </td>
      </tr>
    );
  }
  if (line.kind === "discount") {
    return (
      <tr className="erp-row-start">
        <td />
        <td>{line.name}</td>
        <td />
        {hasPrice && <td />}
        {hasPrice && (
          <td className="erp-num">{formatMoney(line.amount, { currency })}</td>
        )}
        {isAdjust && <td />}
      </tr>
    );
  }
  const qty = line.qty ?? 0;
  return (
    <Fragment>
      <tr className="erp-row-start">
        <td>{line.code}</td>
        <td>{line.name}</td>
        <td className="erp-num">
          {isAdjust && qty > 0 ? "+" : ""}
          {formatQty(qty)}
          {line.unit && ` ${line.unit}`}
        </td>
        {hasPrice && (
          <td className="erp-num">
            {formatUnitPrice(line.unitPrice ?? 0, currency)}
          </td>
        )}
        {hasPrice && (
          <td className="erp-num">{formatMoney(line.amount, { currency })}</td>
        )}
        {isAdjust && <td>{line.reason}</td>}
      </tr>
      {line.serials.map((sn, i) => (
        <tr key={`${sn}-${i}`} className="erp-serial">
          <td />
          <td>機號*{sn}</td>
          <td />
          {hasPrice && <td />}
          {hasPrice && <td />}
          {isAdjust && <td />}
        </tr>
      ))}
    </Fragment>
  );
}
