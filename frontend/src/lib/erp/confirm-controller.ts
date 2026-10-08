// 頁內確認框（#220）的 promise 狀態管理：純邏輯，不碰 DOM／React，useConfirm 與測試共用。
// - request(options) 回傳 Promise<boolean>：確認 → true；取消／Esc／卸載 → false。
// - 每個請求只會 resolve 一次（連點確認鈕不會重複執行動作）。
// - 同時只有一個請求：新的 request 會先以 false 結束前一個未決請求，避免舊 promise 永久懸掛。
// - cancel() 供元件卸載時呼叫；之後控制器仍可再用（React StrictMode 開發模式會模擬卸載再掛載）。

export interface ConfirmRequest<O> {
  /** 每次 request 遞增；Dialog 以此為 key，換新請求時重新掛載並重設起始焦點。 */
  id: number;
  options: O;
}

export interface ConfirmController<O> {
  request(options: O): Promise<boolean>;
  /**
   * 結束目前的請求。給 id 時只在 id 相符才生效（避免舊 Dialog 的事件結束新請求）；
   * 沒有未決請求時不做任何事。
   */
  resolve(value: boolean, id?: number): void;
  /** 以 false 結束未決請求（元件卸載時呼叫）。 */
  cancel(): void;
  isOpen(): boolean;
}

/**
 * @param onChange 顯示狀態變動時呼叫：有請求時帶入 { id, options }，關閉時為 null。
 */
export function createConfirmController<O>(
  onChange: (request: ConfirmRequest<O> | null) => void,
): ConfirmController<O> {
  let seq = 0;
  let current: { id: number; settle: (value: boolean) => void } | null = null;

  function finish(value: boolean, notify: boolean) {
    const pending = current;
    if (!pending) return;
    // 先清掉再 settle：settle 之後的 then 若又發出新請求，不會被這裡蓋掉。
    current = null;
    if (notify) onChange(null);
    pending.settle(value);
  }

  return {
    request(options) {
      // 前一個未決請求以 false 結束（不先通知關閉，直接換成新的內容）。
      finish(false, false);
      const id = ++seq;
      return new Promise<boolean>((settle) => {
        current = { id, settle };
        onChange({ id, options });
      });
    },
    resolve(value, id) {
      if (!current) return;
      if (id !== undefined && id !== current.id) return;
      finish(value, true);
    },
    cancel() {
      finish(false, true);
    },
    isOpen() {
      return current !== null;
    },
  };
}
