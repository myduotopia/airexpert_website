// Combobox／ItemOrTextPicker 輸入框「何時展開清單」的純邏輯（#239 A-1）。client 與測試共用。
//
// 背景：選了「＋ 新增」會開就地新增 Dialog；Dialog 關閉（Esc／取消／建立完成）時瀏覽器把焦點還給輸入框。
// 那次 focus 不應自動展開清單（skipFocusOpen 旗標，由元件在選「新增」時設為 true）。
// 問題：焦點還回來後輸入框已是聚焦狀態，使用者再用滑鼠點同一欄位時不會再觸發 focus，
// 原本只靠 focus 展開，所以清單打不開（aria-expanded=false），要改字才會出現。
// 修正：click 時若清單未開就展開；focus 仍照舊（含略過 Dialog 關閉那一次）。
//
// 已聚焦的欄位點擊時事件為 mousedown → click（沒有 focus）；未聚焦時為 mousedown → focus → click，
// 此時 focus 已展開，click 看到清單已開就不再重新初始化（不會洗掉剛帶入的查詢字）。

export type PickerInputEvent = "focus" | "mousedown" | "click";

export interface PickerOpenState {
  /** 清單目前是否展開。 */
  open: boolean;
  /** 下一次 focus 是否略過展開（Dialog 關閉時焦點歸還）。 */
  skipFocusOpen: boolean;
}

export interface PickerOpenResult {
  /** 是否要初始化查詢字並展開清單。 */
  openList: boolean;
  /** skipFocusOpen 的新值。 */
  skipFocusOpen: boolean;
}

export function pickerInputEvent(
  event: PickerInputEvent,
  state: PickerOpenState,
): PickerOpenResult {
  switch (event) {
    case "focus":
      // 旗標只略過一次：Dialog 關閉時焦點歸還的那次。
      return { openList: !state.skipFocusOpen, skipFocusOpen: false };
    case "mousedown":
      // 使用者主動點擊：之後的 focus（若有）不是焦點歸還，照常展開。
      return { openList: false, skipFocusOpen: false };
    case "click":
      return { openList: !state.open, skipFocusOpen: false };
  }
}
