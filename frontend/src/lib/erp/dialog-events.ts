// ErpDialog（原生 <dialog> + createPortal）的 cancel／close 事件處理 — 純函式，client 與測試共用。
//
// 為何要 stopPropagation：React 的合成事件沿「元件樹」冒泡（會穿過 portal），而 cancel／close
// 雖是原生不冒泡的事件，React 仍會一路呼叫元件樹上祖先的 onCancel／onClose（只有 scroll／scrollend
// 是 target-only）。巢狀 Dialog（例：單據頁「新增客戶」Dialog 內，業務欄再開「新增員工」Dialog，#223）
// 在內層按 Esc 時，外層 <dialog> 的 onCancel 也會被呼叫 → 外層一起關閉、客戶表單已填內容全部遺失。
// 故在 <dialog> 上處理完就停止冒泡：每個 Dialog 只回應「自己」的 cancel／close。

/** 事件需要的最小介面（React SyntheticEvent 相容）。 */
export interface DialogEventLike {
  preventDefault(): void;
  stopPropagation(): void;
}

/** Esc（cancel）：不讓瀏覽器自行關閉（受控，交給父層決定），也不讓外層 Dialog 收到。 */
export function handleDialogCancel(
  e: DialogEventLike,
  onClose: () => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  onClose();
}

/**
 * 原生 close（少數情況瀏覽器強制關閉）：同步回報父層；已由我們主動關閉（卸載中）時忽略，
 * 避免重複呼叫 onClose。一律停止冒泡，外層 Dialog 不受影響。
 */
export function handleDialogClose(
  e: DialogEventLike,
  closing: boolean,
  onClose: () => void,
): void {
  e.stopPropagation();
  if (!closing) onClose();
}
