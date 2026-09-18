// 列印校正值的小型外部 store（所有報告單共用，spec §5.1）。
//
// 為什麼不是 useState + useEffect：校正值來自 localStorage，SSR 讀不到。
// 以 useSyncExternalStore 取用時，server 快照固定為預設值、client 掛載後才讀 storage，
// 既不會 hydration 不一致，也不必在 effect 裡 setState。
// storage 以 getter 注入 → 可在測試中替換（node 環境沒有 localStorage）。
import {
  DEFAULT_CALIBRATION,
  clampCalibration,
  loadCalibration,
  saveCalibration,
  type Calibration,
} from "@/lib/service-report/layout";

export interface CalibrationSnapshot {
  calibration: Calibration;
  /** 是否成功寫入瀏覽器（false＝storage 停用，只在本次列印有效）。 */
  persisted: boolean;
}

export interface CalibrationStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => CalibrationSnapshot;
  getServerSnapshot: () => CalibrationSnapshot;
  /** 寫入新校正值（先 clamp）；通知所有訂閱者。 */
  set: (next: unknown) => CalibrationSnapshot;
  /** 回預設值。 */
  reset: () => CalibrationSnapshot;
}

const SERVER_SNAPSHOT: CalibrationSnapshot = {
  calibration: { ...DEFAULT_CALIBRATION },
  persisted: true,
};

type StorageGetter = () => Pick<Storage, "getItem" | "setItem"> | null;

export function createCalibrationStore(
  getStorage: StorageGetter,
): CalibrationStore {
  // 快照必須是穩定參照（useSyncExternalStore 以 Object.is 比對），故快取整包。
  let snapshot: CalibrationSnapshot | null = null;
  const listeners = new Set<() => void>();

  function getSnapshot(): CalibrationSnapshot {
    snapshot ??= {
      calibration: loadCalibration(getStorage()),
      persisted: true,
    };
    return snapshot;
  }

  function set(next: unknown): CalibrationSnapshot {
    const calibration = clampCalibration(next);
    const persisted = saveCalibration(getStorage(), calibration);
    snapshot = { calibration, persisted };
    for (const fn of listeners) fn();
    return snapshot;
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot,
    getServerSnapshot: () => SERVER_SNAPSHOT,
    set,
    reset: () => set({ ...DEFAULT_CALIBRATION }),
  };
}

/** 瀏覽器用的單例（頁面間切換時沿用同一份校正值）。 */
export const calibrationStore = createCalibrationStore(() =>
  typeof localStorage === "undefined" ? null : localStorage,
);
