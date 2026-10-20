// 試算表檔案 → 工作表格子（#257 員工匯入）。瀏覽器（動態載入 SheetJS）與一次性匯入腳本共用。
// 以參數傳入 SheetJS 模組，本檔不直接 import xlsx（避免把 SheetJS 打包進非匯入頁面）。
import type * as XLSXTypes from "xlsx";

export interface SheetData {
  name: string;
  /** 每格皆為顯示文字（raw: false）；日期格式統一為 yyyy-mm-dd；空白列保留，列號才對得上 Excel。 */
  grid: string[][];
}

export type SheetJS = Pick<typeof XLSXTypes, "read" | "utils">;

/** 支援的副檔名（xls 舊格式 BIFF5 需要 codepage 表，見呼叫端 set_cptable；csv 由 decodeCsv 處理編碼）。 */
export const IMPORT_FILE_ACCEPT = ".xls,.xlsx,.csv";

/** 檔案大小上限（舊系統員工匯出檔通常數十 KB）。 */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** xlsx（zip：PK\x03\x04）或 xls（OLE：D0 CF 11 E0）；其餘視為文字（csv）。 */
function isBinarySpreadsheet(u8: Uint8Array): boolean {
  return (
    (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04) ||
    (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0)
  );
}

/** csv 文字解碼：先試 UTF-8（含 BOM），不是合法 UTF-8 再以 Big5（舊系統常見）解碼。 */
export function decodeCsv(u8: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder("big5").decode(u8);
  }
}

export function readWorkbook(
  XLSX: SheetJS,
  data: ArrayBuffer | Uint8Array,
): SheetData[] {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  // csv 以文字讀入且不轉型（raw）：電話、編號的開頭 0 不會被當成數字吃掉。
  const wb = isBinarySpreadsheet(u8)
    ? XLSX.read(u8, { type: "array", cellDates: false })
    : XLSX.read(decodeCsv(u8), { type: "string", raw: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows = ws
      ? XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          raw: false,
          defval: "",
          blankrows: true,
          dateNF: "yyyy-mm-dd",
        })
      : [];
    return {
      name,
      grid: rows.map((r) =>
        (Array.isArray(r) ? r : []).map((c) =>
          c === null || c === undefined ? "" : String(c),
        ),
      ),
    };
  });
}
