// ERP 列印頁樣式（A4 直式、12mm 邊界）。只由 app/admin/(print) 的 layout 載入，
// 類別一律 erp- 前綴，避免影響其他頁面。內容為常數字串（無使用者輸入）。
const CSS = `
@page { size: A4; margin: 12mm; }
.erp-print-body { background: #e5e7eb; min-height: 100dvh; padding: 64px 16px 32px; overflow-x: auto; color: #111; }
.erp-sheets { display: flex; flex-direction: column; align-items: center; gap: 16px; }
.erp-sheet { position: relative; box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 12mm; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.18); display: flex; flex-direction: column; font-size: 10pt; line-height: 1.35; overflow: hidden; }
.erp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; padding-bottom: 2mm; border-bottom: 0.6mm solid #111; margin-bottom: 3mm; }
.erp-company { display: flex; align-items: center; gap: 3mm; }
.erp-logo { width: 14mm; height: 14mm; object-fit: contain; }
.erp-company-name { font-size: 15pt; font-weight: 700; letter-spacing: .08em; }
.erp-company-contact { font-size: 8.5pt; margin-top: 1mm; }
.erp-head-right { text-align: right; }
.erp-title { font-size: 17pt; font-weight: 700; letter-spacing: .3em; margin: 0 0 1mm; }
.erp-meta { display: grid; grid-template-columns: auto auto; column-gap: 2mm; justify-content: end; font-size: 9pt; margin: 0; }
.erp-meta dt { color: #444; }
.erp-meta dd { margin: 0; font-weight: 600; text-align: left; font-variant-numeric: tabular-nums; }
.erp-sheet-body { flex: 1; display: flex; flex-direction: column; }
.erp-party { display: grid; grid-template-columns: 19mm 1fr 19mm 1fr; border-top: 0.3mm solid #333; border-left: 0.3mm solid #333; margin-bottom: 3mm; }
.erp-party > div { border-right: 0.3mm solid #333; border-bottom: 0.3mm solid #333; padding: 0.8mm 1.5mm; min-height: 6mm; box-sizing: border-box; word-break: break-all; }
.erp-party .erp-label { background: #f3f4f6; color: #333; white-space: nowrap; }
.erp-party .erp-span3 { grid-column: span 3; }
.erp-lines { width: 100%; border-collapse: collapse; table-layout: fixed; }
.erp-lines th { border: 0.3mm solid #333; background: #f3f4f6; font-weight: 600; padding: 0 1.5mm; height: 7mm; text-align: left; }
.erp-lines td { border-left: 0.3mm solid #333; border-right: 0.3mm solid #333; padding: 0.4mm 1.5mm; height: 6mm; vertical-align: top; word-break: break-all; }
.erp-lines tbody tr.erp-row-start td { border-top: 0.2mm dotted #999; }
.erp-lines tbody tr:last-child td { border-bottom: 0.3mm solid #333; }
.erp-lines tr.erp-serial td { height: 5mm; font-size: 9pt; color: #333; }
.erp-lines .erp-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.erp-lines .erp-note { color: #333; font-style: italic; }
.erp-continued { text-align: right; font-size: 9pt; color: #555; margin: 1.5mm 0 0; }
.erp-sheet-bottom { margin-top: auto; padding-top: 3mm; display: flex; flex-direction: column; gap: 3mm; }
.erp-summary { display: flex; gap: 4mm; align-items: stretch; }
.erp-remark { flex: 1; border: 0.3mm solid #333; padding: 1mm 1.5mm; white-space: pre-wrap; word-break: break-all; min-height: 18mm; }
.erp-remark-label { font-size: 8.5pt; color: #444; }
.erp-totals { border-collapse: collapse; min-width: 62mm; }
.erp-totals th, .erp-totals td { border: 0.3mm solid #333; padding: 0 2mm; height: 6mm; }
.erp-totals th { background: #f3f4f6; font-weight: 600; text-align: left; white-space: nowrap; }
.erp-totals td { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.erp-totals tr.erp-grand td, .erp-totals tr.erp-grand th { font-weight: 700; font-size: 11pt; }
.erp-ownership { font-weight: 700; text-align: center; font-size: 10.5pt; }
.erp-signs { display: flex; border: 0.3mm solid #333; }
.erp-signs > div { flex: 1; min-height: 18mm; padding: 1mm 1.5mm; border-left: 0.3mm solid #333; box-sizing: border-box; }
.erp-signs > div:first-child { border-left: 0; }
.erp-sign-label { font-size: 9pt; color: #333; }
.erp-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 5; }
.erp-watermark span { transform: rotate(-30deg); font-size: 110pt; font-weight: 800; letter-spacing: .25em; color: rgba(185, 28, 28, .14); white-space: nowrap; }
.erp-print-toolbar { position: fixed; inset: 0 0 auto 0; z-index: 50; }
.erp-print-message { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px; font-size: 15px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
@media print {
  html, body { background: #fff !important; }
  .erp-print-body { background: #fff; padding: 0; min-height: 0; overflow: visible; }
  .erp-print-toolbar { display: none !important; }
  .erp-sheets { display: block; }
  .erp-sheet { width: auto; min-height: 270mm; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
  .erp-sheet:last-child { break-after: auto; page-break-after: auto; }
  .erp-sheet, .erp-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function PrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
