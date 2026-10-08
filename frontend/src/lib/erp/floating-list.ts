// 下拉清單浮層定位（#219）的純計算：依輸入框在 viewport 中的位置，決定清單往下或往上開、
// 位置、寬度與最大高度。座標皆以 viewport 為基準（對應 position: fixed）。
// FloatingList 元件與測試共用；不碰 DOM。

/** 清單與輸入框之間的間距（px，對應原本的 mt-1）。 */
export const LIST_GAP = 4;
/** 清單與 viewport 邊緣至少保留的距離（px）。 */
export const VIEWPORT_MARGIN = 8;

export interface ListPlacementInput {
  /** 輸入框的 getBoundingClientRect()（只用到 top / bottom / left / width）。 */
  anchorRect: { top: number; bottom: number; left: number; width: number };
  viewportWidth: number;
  viewportHeight: number;
  /** 空間足夠時的最大高度（原本的 max-h-72 = 288px）。 */
  preferredMaxHeight: number;
  /** 清單最小寬度；實際寬度 = max(輸入框寬, minWidth)，但不超過 viewport。 */
  minWidth: number;
  /**
   * 清單內容實際高度（含框線）。提供時，內容較矮且下方放得下就不往上開；
   * 未提供則以 preferredMaxHeight 判斷。
   */
  contentHeight?: number;
}

export interface ListPlacement {
  placement: "below" | "above";
  /** 往下開：清單上緣（CSS top）。 */
  top?: number;
  /** 往上開：清單下緣到 viewport 底部的距離（CSS bottom），內容高度變動時清單仍貼齊輸入框。 */
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function computeListPlacement({
  anchorRect,
  viewportWidth,
  viewportHeight,
  preferredMaxHeight,
  minWidth,
  contentHeight,
}: ListPlacementInput): ListPlacement {
  const spaceBelow =
    viewportHeight - anchorRect.bottom - LIST_GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchorRect.top - LIST_GAP - VIEWPORT_MARGIN;
  const needed = Math.min(preferredMaxHeight, contentHeight ?? Infinity);
  // 下方放得下就往下；放不下時，上方較多才往上（兩邊都不夠取較大一邊）。
  const placement: ListPlacement["placement"] =
    spaceBelow >= needed || spaceBelow >= spaceAbove ? "below" : "above";
  const space = placement === "below" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(0, Math.min(preferredMaxHeight, space));

  const width = Math.max(
    0,
    Math.min(
      Math.max(anchorRect.width, minWidth),
      viewportWidth - VIEWPORT_MARGIN * 2,
    ),
  );
  // 靠右邊界時往內縮；靠左（輸入框部分捲出畫面）時不小於邊距。
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchorRect.left, viewportWidth - VIEWPORT_MARGIN - width),
  );

  return placement === "below"
    ? { placement, top: anchorRect.bottom + LIST_GAP, left, width, maxHeight }
    : {
        placement,
        bottom: viewportHeight - anchorRect.top + LIST_GAP,
        left,
        width,
        maxHeight,
      };
}
