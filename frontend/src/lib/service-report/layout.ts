// 報告單列印版面（spec §5.1）— 純函式（client / server 皆可用）。
//
// 座標系：一律以紙張左上角為原點，單位 mm。
// 紙張尺寸、安全邊界、校正值正規化與可列印範圍檢查的單一事實來源。
// 實際套用到 DOM 的校正 transform 只有一份實作：
//   components/service-report/sheet-layout.ts 的 sheetTransform()
//   （以 sheet unit 平移，預覽縮放時與列印等比例一致；縮放原點為紙張中心）。

/* ---------------------------------------------------------------- 紙張 */

/** 紙張尺寸（mm）。連續紙實際尺寸待確認（spec §1.3），集中在此調整。 */
export const PAPER_WIDTH_MM = 210;
export const PAPER_HEIGHT_MM = 297;

export interface EdgeMm {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 印表機可列印的安全邊界（mm）：內容超出這些邊界就可能被裁掉。 */
export const SAFE_MARGINS_MM: Readonly<EdgeMm> = {
  top: 10,
  bottom: 8,
  left: 8,
  right: 8,
};

/** 矩形（mm，自紙張左上角起算）。 */
export interface BoxMm {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** 表單內容在未校正時佔用的範圍＝安全範圍（ReportSheet 應把格線畫在此框內）。 */
export const FORM_BOX_MM: Readonly<BoxMm> = {
  left: SAFE_MARGINS_MM.left,
  top: SAFE_MARGINS_MM.top,
  right: PAPER_WIDTH_MM - SAFE_MARGINS_MM.right,
  bottom: PAPER_HEIGHT_MM - SAFE_MARGINS_MM.bottom,
  width: PAPER_WIDTH_MM - SAFE_MARGINS_MM.left - SAFE_MARGINS_MM.right,
  height: PAPER_HEIGHT_MM - SAFE_MARGINS_MM.top - SAFE_MARGINS_MM.bottom,
};

/** 由列印頁注入的 @page 規則（邊界一律 0，由 .sheet 自己控制位置）。 */
export function pageRule(): string {
  return `@page { size: ${PAPER_WIDTH_MM}mm ${PAPER_HEIGHT_MM}mm; margin: 0 }`;
}

/** mm → 預覽容器寬度百分比單位 cqw（容器寬＝紙寬 210mm → 100cqw）。 */
export function mmToCqw(mm: number): number {
  return round3((mm / PAPER_WIDTH_MM) * 100);
}

/** pt → mm（1pt = 1/72 吋 = 25.4/72 mm）。字級換算用。 */
export function ptToMm(pt: number): number {
  return round3((pt * 25.4) / 72);
}

/* ---------------------------------------------------------------- 校正 */

export interface Calibration {
  /** 水平平移（mm，+ = 往右），±15。 */
  offsetXmm: number;
  /** 垂直平移（mm，+ = 往下），±15。 */
  offsetYmm: number;
  /** 縮放倍率（以紙張中心為原點），0.9–1.1。 */
  scale: number;
}

export const MAX_OFFSET_MM = 15;
export const MIN_SCALE = 0.9;
export const MAX_SCALE = 1.1;

export const DEFAULT_CALIBRATION: Readonly<Calibration> = {
  offsetXmm: 0,
  offsetYmm: 0,
  scale: 1,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 任意值 → 有限數字；空白 / null / 非數值回 fallback（不可讓清空輸入框變成 0 以外的極值）。 */
function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    if (value.trim() === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * 校正值正規化：缺欄位 / 空白 / NaN → 預設值；平移夾到 ±15mm、縮放夾到 0.9–1.1。
 * 接受任意輸入（localStorage 讀回、表單字串）。
 */
export function clampCalibration(input: unknown): Calibration {
  const r = isRecord(input) ? input : {};
  return {
    offsetXmm: round3(
      clamp(
        toNumber(r.offsetXmm, DEFAULT_CALIBRATION.offsetXmm),
        -MAX_OFFSET_MM,
        MAX_OFFSET_MM,
      ),
    ),
    offsetYmm: round3(
      clamp(
        toNumber(r.offsetYmm, DEFAULT_CALIBRATION.offsetYmm),
        -MAX_OFFSET_MM,
        MAX_OFFSET_MM,
      ),
    ),
    scale: round3(
      clamp(toNumber(r.scale, DEFAULT_CALIBRATION.scale), MIN_SCALE, MAX_SCALE),
    ),
  };
}

/**
 * 校正後表單內容（FORM_BOX_MM）在紙上的實際範圍（mm）。
 * 以紙張中心 (W/2, H/2) 縮放、再平移：x' = cx + (x − cx)·s + dx。
 */
export function contentBoxMm(c: Calibration): BoxMm {
  const { offsetXmm, offsetYmm, scale } = clampCalibration(c);
  const cx = PAPER_WIDTH_MM / 2;
  const cy = PAPER_HEIGHT_MM / 2;
  const left = cx + (FORM_BOX_MM.left - cx) * scale + offsetXmm;
  const right = cx + (FORM_BOX_MM.right - cx) * scale + offsetXmm;
  const top = cy + (FORM_BOX_MM.top - cy) * scale + offsetYmm;
  const bottom = cy + (FORM_BOX_MM.bottom - cy) * scale + offsetYmm;
  return {
    left: round3(left),
    top: round3(top),
    right: round3(right),
    bottom: round3(bottom),
    width: round3(right - left),
    height: round3(bottom - top),
  };
}

export type Edge = "top" | "bottom" | "left" | "right";

export const EDGE_LABELS: Record<Edge, string> = {
  top: "上",
  bottom: "下",
  left: "左",
  right: "右",
};

export interface PrintableWarning {
  edge: Edge;
  /** 超出安全邊界多少 mm（> 0）。 */
  overMm: number;
  /** 例：「上緣超出安全範圍 2.5mm，可能被裁切」。 */
  message: string;
}

/** 浮點容差：避免 10.0000001 < 10 這種誤報。 */
const EPSILON_MM = 0.005;

/** 校正後內容是否超出安全邊界；回傳超出的邊（依 上、下、左、右 排序），空陣列＝可正常列印。 */
export function checkPrintableArea(c: Calibration): PrintableWarning[] {
  const box = contentBoxMm(c);
  const over: Record<Edge, number> = {
    top: SAFE_MARGINS_MM.top - box.top,
    bottom: box.bottom - (PAPER_HEIGHT_MM - SAFE_MARGINS_MM.bottom),
    left: SAFE_MARGINS_MM.left - box.left,
    right: box.right - (PAPER_WIDTH_MM - SAFE_MARGINS_MM.right),
  };
  const edges: Edge[] = ["top", "bottom", "left", "right"];
  return edges
    .filter((edge) => over[edge] > EPSILON_MM)
    .map((edge) => {
      const overMm = round2(over[edge]);
      return {
        edge,
        overMm,
        message: `${EDGE_LABELS[edge]}緣超出安全範圍 ${overMm}mm，可能被裁切`,
      };
    });
}

/* ------------------------------------------------------ localStorage */

/** 所有報告單共用的校正設定 key（spec §5.1）。 */
export const CALIBRATION_STORAGE_KEY = "sr-print-calibration";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** 讀回校正值；storage 不存在 / 丟錯 / 內容壞掉一律回預設值。 */
export function loadCalibration(
  storage: ReadableStorage | null | undefined,
): Calibration {
  if (!storage) return { ...DEFAULT_CALIBRATION };
  try {
    const raw = storage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CALIBRATION };
    return clampCalibration(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CALIBRATION };
  }
}

/** 儲存校正值（先正規化）；成功回 true，storage 停用 / 丟錯回 false（不影響列印）。 */
export function saveCalibration(
  storage: WritableStorage | null | undefined,
  c: Calibration,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      CALIBRATION_STORAGE_KEY,
      JSON.stringify(clampCalibration(c)),
    );
    return true;
  } catch {
    return false;
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
