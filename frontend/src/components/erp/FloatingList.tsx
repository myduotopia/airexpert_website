"use client";
// ERP 下拉清單浮層（#219）：Combobox、ItemOrTextPicker 共用。
// 明細表外層是 overflow-x-auto，absolute 定位的清單會被裁切；改為 createPortal + position: fixed，
// 依輸入框的 getBoundingClientRect() 定位（計算見 lib/erp/floating-list.ts）。
// - portal 目標：輸入框最近的 <dialog open> 祖先（ErpDialog 以 showModal() 開在 top layer、背景 inert，
//   portal 到 body 會點不到也會被 Dialog 蓋住）；沒有才用 document.body。
// - 每次 render（結果筆數變動）同步重新定位；任何祖先捲動（capture）與 resize 以 rAF 節流後重新定位。
// - 清單上的 mousedown 一律 preventDefault：點選項、捲軸、空白處都不會讓輸入框 blur 而關閉清單。
// - 呼叫端只在 open 時渲染；anchor 為 null（尚未掛載 / server render）時不渲染。
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { computeListPlacement } from "@/lib/erp/floating-list";

/** 原本的 max-h-72。 */
const DEFAULT_MAX_HEIGHT = 288;

interface PlaceOptions {
  minWidth: number;
  maxHeight: number;
}

export interface FloatingListProps extends Omit<
  HTMLAttributes<HTMLUListElement>,
  "style" | "children"
> {
  /** 定位基準（輸入框）；以 callback ref 存進 state 傳入。 */
  anchor: HTMLElement | null;
  /** 清單最小寬度（px）；實際寬度 = max(輸入框寬, minWidth)。 */
  minWidth?: number;
  /** 空間足夠時的最大高度（px）。 */
  maxHeight?: number;
  children: ReactNode;
}

export function FloatingList({
  anchor,
  minWidth = 240,
  maxHeight = DEFAULT_MAX_HEIGHT,
  className = "",
  onMouseDown,
  children,
  ...rest
}: FloatingListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const optionsRef = useRef<PlaceOptions>({ minWidth, maxHeight });

  // 每次 render 都在 paint 前重新定位：內容筆數變動會影響「往上 / 往下」判斷。
  useLayoutEffect(() => {
    optionsRef.current = { minWidth, maxHeight };
    if (anchor && listRef.current) {
      placeList(anchor, listRef.current, optionsRef.current);
    }
  });

  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    const run = () => {
      frame = 0;
      if (listRef.current) {
        placeList(anchor, listRef.current, optionsRef.current);
      }
    };
    const schedule = (e: Event) => {
      // 清單自身捲動（滑鼠滾輪、鍵盤移動時 scrollIntoView）不影響位置。
      if (e.target instanceof Node && listRef.current?.contains(e.target)) {
        return;
      }
      if (!frame) frame = requestAnimationFrame(run);
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("scroll", schedule, opts);
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, opts);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchor]);

  if (!anchor || typeof document === "undefined") return null;
  const container = anchor.closest("dialog[open]") ?? document.body;

  return createPortal(
    <ul
      ref={listRef}
      {...rest}
      // top / bottom / left / width / max-height 由 placeList 在 paint 前直接寫入 DOM。
      style={{ position: "fixed" }}
      onMouseDown={(e) => {
        // mousedown 先於 input blur：不 preventDefault 的話點清單會先關閉清單。
        e.preventDefault();
        onMouseDown?.(e);
      }}
      className={`z-50 overflow-y-auto ${className}`}
    >
      {children}
    </ul>,
    container,
  );
}

/** 鍵盤移動 highlight 時，把該選項捲進清單可視範圍。 */
export function scrollOptionIntoView(optionId: string) {
  document.getElementById(optionId)?.scrollIntoView({ block: "nearest" });
}

function placeList(
  anchor: HTMLElement,
  list: HTMLUListElement,
  { minWidth, maxHeight }: PlaceOptions,
) {
  const root = document.documentElement;
  const viewportWidth = root.clientWidth;
  const viewportHeight = root.clientHeight;
  // scrollHeight 不含框線；補上上下框線才是內容實際需要的高度。
  const borders = list.offsetHeight - list.clientHeight;
  const p = computeListPlacement({
    anchorRect: anchor.getBoundingClientRect(),
    viewportWidth,
    viewportHeight,
    preferredMaxHeight: maxHeight,
    minWidth,
    contentHeight: list.scrollHeight + borders,
  });

  const s = list.style;
  s.left = `${p.left}px`;
  s.width = `${p.width}px`;
  s.maxHeight = `${p.maxHeight}px`;
  if (p.placement === "below") {
    s.top = `${p.top}px`;
    s.bottom = "auto";
  } else {
    s.top = "auto";
    s.bottom = `${p.bottom}px`;
  }

  // 防呆：若祖先有 transform 等使 fixed 不再以 viewport 為基準，依實際位置差補正（只處理平移）。
  // 目前 ErpDialog / body 都沒有，正常情況差值為 0，不會再寫入。
  const rect = list.getBoundingClientRect();
  const dx = p.left - rect.left;
  const dy =
    p.placement === "below"
      ? p.top! - rect.top
      : viewportHeight - p.bottom! - rect.bottom;
  if (Math.abs(dx) > 0.5) s.left = `${p.left + dx}px`;
  if (Math.abs(dy) > 0.5) {
    if (p.placement === "below") s.top = `${p.top! + dy}px`;
    else s.bottom = `${p.bottom! - dy}px`;
  }
}
