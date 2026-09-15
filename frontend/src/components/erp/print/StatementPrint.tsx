// 月結對帳單 A4 列印（spec §5.5 / §7）。server component。
// 資料來自 getStatementData（與 /admin/erp/statements 預覽共用 buildStatement 結果）。
import { formatMoney } from "@/lib/erp/format";
import {
  estimateTextRows,
  paginateLines,
  rocShort,
  STATEMENT_DESC_UNITS_PER_ROW,
  STATEMENT_PRINT_ROWS,
} from "@/lib/erp/print";
import type { StatementData } from "@/lib/erp/queries/ar-ap";
import { PartyGrid, PrintSheet, type PartyField } from "./PrintSheet";

export function StatementPrint({
  data,
  printedOn,
  logoUrl,
}: {
  data: StatementData;
  /** 列印日（西元 YYYY-MM-DD）。 */
  printedOn: string;
  logoUrl: string;
}) {
  const { party, statement } = data;
  const isVendor = party.type === "vendor";
  const balanceLabel = isVendor ? "應付餘額" : "應收餘額";
  const pages = paginateLines(statement.rows, {
    ...STATEMENT_PRINT_ROWS,
    // 第一頁另有「期初餘額」一列。
    firstPageRows: STATEMENT_PRINT_ROWS.firstPageRows - 1,
    rowsOf: (r) =>
      estimateTextRows(r.description || " ", STATEMENT_DESC_UNITS_PER_ROW),
  });

  const fields: PartyField[] = [
    {
      label: isVendor ? "廠商名稱" : "客戶名稱",
      value: party.invoice_title || party.name,
    },
    { label: isVendor ? "廠商編號" : "客戶編號", value: party.code },
    { label: "統一編號", value: party.tax_id },
    { label: "聯絡人", value: party.contact_person },
    { label: "電話", value: party.phone },
    { label: "傳真", value: party.fax },
    { label: "地址", value: party.address, wide: true },
  ];
  const money = (v: number | null) =>
    v === null ? "" : formatMoney(v, { decimals: Number.isInteger(v) ? 0 : 2 });

  return (
    <div className="erp-sheets">
      {pages.map((page) => (
        <PrintSheet
          key={page.pageNo}
          logoUrl={logoUrl}
          title={isVendor ? "廠商對帳單" : "客戶對帳單"}
          meta={[
            {
              label: "期間",
              value: `${rocShort(statement.from)}～${rocShort(statement.to)}`,
            },
            { label: "列印日", value: rocShort(printedOn) },
          ]}
          pageNo={page.pageNo}
          pageCount={page.pageCount}
        >
          <PartyGrid fields={fields} />
          <table className="erp-lines">
            <colgroup>
              <col style={{ width: "20mm" }} />
              <col style={{ width: "26mm" }} />
              <col />
              <col style={{ width: "25mm" }} />
              <col style={{ width: "25mm" }} />
              <col style={{ width: "26mm" }} />
            </colgroup>
            <thead>
              <tr>
                <th>日期</th>
                <th>單號</th>
                <th>摘要</th>
                <th className="erp-num">單據金額</th>
                <th className="erp-num">{isVendor ? "付款" : "收款"}</th>
                <th className="erp-num">餘額</th>
              </tr>
            </thead>
            <tbody>
              {page.isFirst && (
                <tr className="erp-row-start">
                  <td>{rocShort(statement.from)}</td>
                  <td />
                  <td>期初餘額</td>
                  <td />
                  <td />
                  <td className="erp-num">{money(statement.opening)}</td>
                </tr>
              )}
              {page.isFirst && statement.rows.length === 0 && (
                <tr className="erp-row-start">
                  <td colSpan={6} className="erp-note">
                    本期無已過帳單據或收付款。
                  </td>
                </tr>
              )}
              {page.lines.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="erp-row-start">
                  <td>{rocShort(r.date)}</td>
                  <td>{r.doc_no ?? ""}</td>
                  <td>{r.description}</td>
                  <td className="erp-num">{money(r.charge)}</td>
                  <td className="erp-num">{money(r.payment)}</td>
                  <td className="erp-num">{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!page.isLast && <p className="erp-continued">（續下頁）</p>}

          {page.isLast && (
            <div className="erp-sheet-bottom">
              <div className="erp-summary">
                <div className="erp-remark">
                  <div className="erp-remark-label">說明</div>
                  作廢單據與草稿不列入。如有疑問請洽服務專線。
                </div>
                <table className="erp-totals">
                  <tbody>
                    <tr>
                      <th>期初餘額</th>
                      <td>{money(statement.opening)}</td>
                    </tr>
                    <tr>
                      <th>本期單據</th>
                      <td>{money(statement.documentsTotal)}</td>
                    </tr>
                    <tr>
                      <th>本期{isVendor ? "付款" : "收款"}</th>
                      <td>{money(statement.paymentsTotal)}</td>
                    </tr>
                    <tr className="erp-grand">
                      <th>期末{balanceLabel}</th>
                      <td>{money(statement.closing)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </PrintSheet>
      ))}
    </div>
  );
}
