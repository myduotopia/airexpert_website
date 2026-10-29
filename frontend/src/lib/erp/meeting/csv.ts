// ERP 週報（#271）共用：CSV 匯出 — 純函式（client / server 皆可用）。
// UTF-8 BOM + CRLF（Excel 直接開啟中文不亂碼）；儲存格跳脫與公式注入防護沿用 lib/erp/reports 的 csvCell / toCsv。
// 用法（server page）：
//   const csv = meetingCsvFile("維護完成紀錄", range, headers, rows);
//   <ReportToolbar csv={csv} … />   // 工具列以 Blob 下載，不必另寫 server action
import { csvCell, toCsv, type CsvCell } from "@/lib/erp/reports";

export { csvCell, toCsv, type CsvCell };

/** 工具列「匯出 CSV」要下載的檔案（內容已含 BOM）。 */
export interface MeetingCsvFile {
  filename: string;
  content: string;
}

/** 檔名不可含路徑或 Windows 保留字元。 */
export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "report";
}

/** 檔名：「維護完成紀錄_2026-10-26_2026-11-01.csv」。 */
export function meetingCsvFilename(
  title: string,
  range: { from: string; to: string },
): string {
  return `${safeFilename(title)}_${range.from}_${range.to}.csv`;
}

export function meetingCsvFile(
  title: string,
  range: { from: string; to: string },
  headers: string[],
  rows: CsvCell[][],
): MeetingCsvFile {
  return {
    filename: meetingCsvFilename(title, range),
    content: toCsv(headers, rows),
  };
}
