// ERP 數字輸入欄（NumberInput）的純邏輯（#247，#238 §4 N-1）。client 與測試共用。
//
// 背景：欄位文字靠右，原本 0 / 1 會直接顯示。滑鼠點欄位中間時瀏覽器把游標放在位置 0，
// 直接輸入的數字會黏在原值前面（單價 0 → 輸入 75000 → 750000；數量 1 → 輸入 2 → 21）。
// 修正：
//   1. 值為 0 時顯示空白（placeholder 顯示「0」），空白解析為 0。
//   2. 聚焦時全選，輸入直接取代原值。
//
// 全選的事件順序（滑鼠點未聚焦的欄位）：mousedown → focus → mouseup → click。
// 瀏覽器在 mousedown／mouseup 的預設動作會放置游標並取消選取，所以只在 focus 呼叫 select()
// 常常無效；要在「這次聚焦帶來的第一次 mouseup」preventDefault 並再 select() 一次。
// 之後使用者再點已聚焦的欄位（mousedown 時已聚焦），mouseup 不攔，游標可正常移動。
// Tab 聚焦只有 focus，沒有 mousedown，不會留下待攔的 mouseup。

/** 0 顯示空白；blankZero=false 時照常顯示 0（例：稅率 0% 有意義，要明確顯示）。 */
export function formatNumberText(
  n: number,
  { blankZero = true }: { blankZero?: boolean } = {},
): string {
  if (n === 0) return blankZero ? "" : "0";
  return String(n);
}

/** 解析輸入文字：忽略千分位逗號；空白、未完成（"-"、"."）或無法解析一律為 0。 */
export function parseNumberText(text: string): number {
  const t = text.replace(/,/g, "").trim();
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 檢核使用者輸入（每次 onChange）：去掉千分位逗號後符合格式就回傳清理後的文字，
 * 否則回傳 null（不接受這次輸入，欄位維持原文字）。輸入過程的 "1."、"-"、"" 皆允許。
 */
export function sanitizeNumberInput(
  raw: string,
  { allowNegative, decimals }: { allowNegative: boolean; decimals: number },
): string | null {
  const t = raw.replace(/,/g, "");
  const pattern = new RegExp(
    `^${allowNegative ? "-?" : ""}\\d*${decimals > 0 ? `(\\.\\d{0,${decimals}})?` : ""}$`,
  );
  return pattern.test(t) ? t : null;
}

export type FocusSelectEventName = "mousedown" | "focus" | "mouseup" | "blur";

export interface FocusSelectState {
  /** 下一次 mouseup 是否要攔下（preventDefault）並全選：只在滑鼠點未聚焦欄位時設為 true。 */
  armed: boolean;
}

export interface FocusSelectResult {
  state: FocusSelectState;
  /** 是否呼叫 event.preventDefault()（只用在 mouseup）。 */
  preventDefault: boolean;
  /** 是否呼叫 input.select()。 */
  select: boolean;
}

export function focusSelectEvent(
  event: FocusSelectEventName,
  state: FocusSelectState,
  ctx: { focused?: boolean } = {},
): FocusSelectResult {
  switch (event) {
    case "mousedown":
      // 未聚焦 → 這次點擊會帶來 focus，接著的 mouseup 要攔；已聚焦 → 一般點擊，解除殘留旗標。
      return {
        state: { armed: !ctx.focused },
        preventDefault: false,
        select: false,
      };
    case "focus":
      // 滑鼠或 Tab 聚焦都全選（Tab 時這一次就生效；滑鼠時會被 mouseup 蓋掉，靠 mouseup 補）。
      return { state, preventDefault: false, select: true };
    case "mouseup":
      if (!state.armed) return { state, preventDefault: false, select: false };
      return { state: { armed: false }, preventDefault: true, select: true };
    case "blur":
      return { state: { armed: false }, preventDefault: false, select: false };
  }
}
