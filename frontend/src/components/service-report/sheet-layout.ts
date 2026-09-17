// 機台維護報告單（ReportSheet）版面幾何與純函式 — client / server 共用。
// 單一尺寸系統：所有尺寸以「sheet unit」表示，1 unit = 1mm。
//   預覽：--u = 100cqw / 210（容器寬度等比縮放）
//   列印：--u = 1mm（容器寬度 = 210mm）
// → 預覽與列印幾何完全一致。見 spec §5。

import {
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  SAFE_MARGINS_MM,
  clampCalibration,
} from "@/lib/service-report/layout";
import type { ServiceReportPart } from "@/lib/service-report/types";

// 紙張尺寸與安全邊界的單一事實來源在 lib/service-report/layout.ts；
// 這裡只以別名再匯出，避免兩處數值漂移（checkPrintableArea 與實際畫格線用同一組數字）。
export const SHEET_WIDTH_MM = PAPER_WIDTH_MM;
export const SHEET_HEIGHT_MM = PAPER_HEIGHT_MM;

/** 安全範圍（scale 1 時內容必須落在此範圍內）。 */
export const SAFE_MARGIN_MM = SAFE_MARGINS_MM;

export const CONTENT_WIDTH_MM =
  SHEET_WIDTH_MM - SAFE_MARGIN_MM.left - SAFE_MARGIN_MM.right; // 194
export const CONTENT_HEIGHT_MM =
  SHEET_HEIGHT_MM - SAFE_MARGIN_MM.top - SAFE_MARGIN_MM.bottom; // 279

/** 一般表格列高。 */
export const ROW_MM = 8;
/** 區段標題列高（空壓機檢查、乾燥機檢查…）。 */
export const TITLE_ROW_MM = 6;
/** 修護記要：每行行高與可見行數（本文框高 = 行數 × 行高 + 上下留白）。 */
export const SUMMARY_LINE_MM = 5.5;
export const SUMMARY_LINES = 8;
export const SUMMARY_PAD_MM = 1;
export const PARTS_ROW_MM = 7.5;

/**
 * 高度預算（由上而下，mm）。總和必須 ≤ CONTENT_HEIGHT_MM（279）。
 *   header    25    LOGO/公司列 15 + 標題 10
 *   date       8    維護日期｜派工單號
 *   customer  24    客戶名稱｜電話、統一編號｜聯絡人、地址（3 × 8）
 *   service   24    服務項目｜設備／型號電壓／編號狀態（3 × 8）
 *   summary   52    標題 6 + 本文 46（8 行 × 5.5 + 上下 1）
 *   compressor 30   標題 6 + 3 × 8
 *   dryer     22    標題 6 + 2 × 8
 *   filter     8    過濾耗材｜貯氣桶排水功能
 *   parts     49.5  標題 6 + 欄名 6 + 5 × 7.5
 *   sign      28    建議事項｜維護人員簽名｜客戶簽名
 *   gap        1    表格與聯單說明間距
 *   footer     6    聯單說明、服務電話
 *   ─────────────
 *   total    277.5  ≤ 279（餘 1.5mm）
 */
export const SECTION_HEIGHTS_MM = {
  header: 25,
  date: ROW_MM,
  customer: ROW_MM * 3,
  service: ROW_MM * 3,
  summary: TITLE_ROW_MM + SUMMARY_LINES * SUMMARY_LINE_MM + SUMMARY_PAD_MM * 2,
  compressor: TITLE_ROW_MM + ROW_MM * 3,
  dryer: TITLE_ROW_MM + ROW_MM * 2,
  filter: ROW_MM,
  parts: TITLE_ROW_MM * 2 + PARTS_ROW_MM * 5,
  sign: 28,
  gap: 1,
  footer: 6,
} as const;

export const HEADER_TOP_MM = 15;
export const HEADER_TITLE_MM =
  SECTION_HEIGHTS_MM.header - HEADER_TOP_MM; /* 10 */

export function totalContentHeightMm(): number {
  return Object.values(SECTION_HEIGHTS_MM).reduce((a, b) => a + b, 0);
}

/** 各區欄寬（mm）。每組總和 = CONTENT_WIDTH_MM（equip* 為服務項目右側 104mm）。 */
export const COLUMNS_MM = {
  header: [32, 130, 32], // 左上代號｜LOGO＋公司｜（留白）
  info: [20, 90, 22, 62], // 維護日期/客戶名稱/統一編號｜電話/派工單號/聯絡人
  address: [20, 174],
  serviceOuter: [20, 70, 104],
  equip1: [14, 90], // 設備
  equip2: [14, 40, 14, 36], // 型號｜電壓
  equip3: [14, 36, 14, 40], // 編號｜狀態
  check: [26, 30, 20, 30, 34, 54], // 空壓機／乾燥機檢查
  filter: [20, 90, 30, 54], // 過濾耗材｜貯氣桶排水功能
  parts: [12, 61, 24, 12, 61, 24],
  sign: [74, 60, 60],
} as const;

/** N sheet units → CSS length。 */
export function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

/** 欄寬／列高陣列（mm）→ grid-template-columns / rows。 */
export function gridTracks(cols: readonly number[]): string {
  return cols.map(u).join(" ");
}

/** 勾選框字元：選中 ■、未選 □。 */
export function checkGlyph(selected: boolean): string {
  return selected ? "■" : "□";
}

/** 西元 "YYYY-MM-DD" → 紙本格式民國 "115/09/02"（無「民國」前綴）。空 / 無效回 ""。 */
export function rocShortDate(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return "";
  const roc = Number(m[1]) - 1911;
  if (roc < 1) return "";
  return `${roc}/${m[2]}/${m[3]}`;
}

export interface SheetCalibration {
  offsetXmm: number;
  offsetYmm: number;
  scale: number;
}

/**
 * 校正值 → 內層 transform。以 sheet unit 平移（預覽縮放時與列印等比例一致），
 * 數值範圍與預設值沿用 lib/service-report/layout.ts 的 clampCalibration，
 * 縮放原點為紙張中心（CSS .layer 的 transform-origin），與 checkPrintableArea 的算法一致。
 */
export function sheetTransform(
  calibration: SheetCalibration | null | undefined,
): string | undefined {
  if (!calibration) return undefined;
  const {
    offsetXmm: x,
    offsetYmm: y,
    scale: s,
  } = clampCalibration(calibration);
  if (x === 0 && y === 0 && s === 1) return undefined;
  return `translate(${u(x)}, ${u(y)}) scale(${s})`;
}

/** 更換料件 10 列 → 左（1–5）右（6–10）配對；缺列補空白。 */
export function splitParts(
  parts: readonly ServiceReportPart[] | null | undefined,
): { left: ServiceReportPart; right: ServiceReportPart }[] {
  const byNo = new Map<number, ServiceReportPart>();
  for (const p of parts ?? []) byNo.set(p.no, p);
  const get = (no: number): ServiceReportPart =>
    byNo.get(no) ?? { no, name: "", qty: "" };
  return [1, 2, 3, 4, 5].map((i) => ({ left: get(i), right: get(i + 5) }));
}
