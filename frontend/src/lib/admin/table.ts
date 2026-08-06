// 後台資料表的純計算工具（無 React、無 I/O，方便單元測試）。
// AdminTable 只負責 UI 與狀態，順序與分頁的計算都放在這裡。

export type MovePosition = "before" | "after";

/**
 * 把 movingKey 移到 targetKey 的前 / 後，回傳新的 key 順序（不修改輸入）。
 *
 * 這是「跨頁移動」的核心：插入位置綁定的是**某一具體列**，而非「第 N 筆」，
 * 因此即使畫面正在搜尋 / 排序視圖下，落點在手動全序中仍唯一確定。
 *
 * 往後移時先移除元素會讓目標索引前移一格，故插入點以「移除後」的索引計算。
 */
export function moveItem(
  keys: string[],
  movingKey: string,
  targetKey: string,
  position: MovePosition,
): string[] {
  if (movingKey === targetKey) return [...keys];
  const from = keys.indexOf(movingKey);
  const to = keys.indexOf(targetKey);
  if (from === -1 || to === -1) return [...keys];

  const next = [...keys];
  next.splice(from, 1);
  const targetIndex = next.indexOf(targetKey);
  next.splice(
    position === "before" ? targetIndex : targetIndex + 1,
    0,
    movingKey,
  );
  return next;
}

/** 把 movingKey 移到最前 / 最後，回傳新的 key 順序（不修改輸入）。 */
export function moveToEdge(
  keys: string[],
  movingKey: string,
  edge: "start" | "end",
): string[] {
  const from = keys.indexOf(movingKey);
  if (from === -1) return [...keys];

  const next = [...keys];
  next.splice(from, 1);
  if (edge === "start") next.unshift(movingKey);
  else next.push(movingKey);
  return next;
}

export type PageToken = number | "ellipsis";

/**
 * 分頁列要顯示的頁碼序列。
 *
 * 以 current 為中心取最多 span 個連續頁碼，並固定保留第一頁與最後一頁；
 * 中間有落差時插入 "ellipsis"。總頁數 <= span + 2 時直接全部列出。
 *
 * 例：pageWindow(10, 20) → [1, "ellipsis", 8, 9, 10, 11, 12, "ellipsis", 20]
 */
export function pageWindow(
  current: number,
  total: number,
  span = 5,
): PageToken[] {
  const totalPages = Math.max(1, Math.floor(total));
  const page = Math.min(Math.max(1, Math.floor(current)), totalPages);

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  // 頁數不多時全部列出（省略號反而佔位卻沒省到東西）。
  if (totalPages <= span + 2) return range(1, totalPages);

  let start = page - Math.floor(span / 2);
  let end = start + span - 1;
  if (start < 1) {
    start = 1;
    end = span;
  }
  if (end > totalPages) {
    end = totalPages;
    start = totalPages - span + 1;
  }

  const tokens: PageToken[] = [];
  if (start > 1) {
    tokens.push(1);
    // start === 2 時第 1 頁與視窗相連，不需要省略號。
    if (start > 2) tokens.push("ellipsis");
  }
  tokens.push(...range(start, end));
  if (end < totalPages) {
    if (end < totalPages - 1) tokens.push("ellipsis");
    tokens.push(totalPages);
  }
  return tokens;
}
