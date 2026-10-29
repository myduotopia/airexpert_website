// ERP 週報（#271）共用列印版型：A4 橫式、表格自然分頁（表頭每頁重複、合計只在最後）。
// 用於 app/admin/(print)/erp/print/meeting/<tab>/page.tsx（獨立列印路由，無側欄；沿用 (print) 殼層的
// 登入／必改密碼檢查與 (print)/erp/layout.tsx 的 erp 模組守門）。
// 選擇獨立路由而非在週報頁加 @media print：後台頁有側欄與工具列，獨立頁才能只印報表本身，
// 且 A4 橫式的 @page 只套在這些列印頁（其他 ERP 列印頁維持 PrintStyles 的 A4 直式）。
//
// 用法：
//   <PrintShell title={title} backHref={backHref}>
//     <MeetingPrintStyles />
//     <MeetingPrintSheet title="維護完成紀錄 10/26~11/02" printedOn="2026-10-29" meta="共 12 筆">
//       <table className="mtg-table">…</table>
//     </MeetingPrintSheet>
//   </PrintShell>
// 表格可用 class：mtg-table（外框）、mtg-num（數字靠右）、mtg-nowrap、mtg-wrap（長文字換行）、
//   tfoot 列為合計（只印在最後一頁）。
import type { ReactNode } from "react";
import { COMPANY_INFO } from "@/lib/erp/print";
import { rocShortDate } from "@/lib/erp/meeting/maintenance";

// 常數字串（無使用者輸入）。在 (print)/layout 的 PrintStyles 之後輸出，@page 以後者為準 → A4 橫式。
const CSS = `
@page { size: A4 landscape; margin: 10mm; }
.mtg-sheets { display: flex; flex-direction: column; align-items: center; }
.mtg-sheet { box-sizing: border-box; width: 297mm; min-height: 210mm; padding: 10mm; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); font-size: 9.5pt; line-height: 1.35; color: #111; }
.mtg-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; border-bottom: 0.5mm solid #111; padding-bottom: 1.5mm; margin-bottom: 2.5mm; }
.mtg-company { font-size: 10pt; font-weight: 600; letter-spacing: .05em; }
.mtg-title { font-size: 15pt; font-weight: 700; letter-spacing: .1em; margin: 0; }
.mtg-meta { font-size: 9pt; color: #333; text-align: right; white-space: nowrap; }
.mtg-table { width: 100%; border-collapse: collapse; }
.mtg-table th, .mtg-table td { border: 0.25mm solid #444; padding: 0.8mm 1.2mm; vertical-align: top; text-align: left; }
.mtg-table th { background: #f3f4f6; font-weight: 600; white-space: nowrap; }
.mtg-table thead { display: table-header-group; }
.mtg-table tfoot { display: table-row-group; }
.mtg-table tfoot td { font-weight: 700; background: #f9fafb; }
.mtg-table tr { break-inside: avoid; page-break-inside: avoid; }
.mtg-table .mtg-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mtg-table .mtg-nowrap { white-space: nowrap; }
.mtg-table .mtg-wrap { white-space: pre-wrap; word-break: break-all; }
.mtg-empty { padding: 8mm 0; text-align: center; color: #555; }
@media print {
  .mtg-sheet { width: auto; min-height: 0; padding: 0; box-shadow: none; }
  .mtg-sheet, .mtg-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function MeetingPrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export function MeetingPrintSheet({
  title,
  printedOn,
  meta,
  children,
}: {
  /** 報表標題（例：meetingReportTitle("維護完成紀錄", range)）。 */
  title: string;
  /** 列印日期（YYYY-MM-DD，台北時區）。 */
  printedOn: string;
  /** 右上角補充（例：「共 12 筆」、篩選條件）。 */
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mtg-sheets">
      <section className="mtg-sheet" aria-label={title}>
        <header className="mtg-head">
          <div>
            <div className="mtg-company">{COMPANY_INFO.name}</div>
            <h1 className="mtg-title">{title}</h1>
          </div>
          <div className="mtg-meta">
            {meta ? <div>{meta}</div> : null}
            <div>列印日期：{rocShortDate(printedOn)}</div>
          </div>
        </header>
        {children}
      </section>
    </div>
  );
}
