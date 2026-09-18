import { describe, expect, it, vi } from "vitest";
import { createCalibrationStore } from "@/components/service-report/calibration-store";
import { resolvePrint } from "@/components/service-report/SheetPrintView";
import {
  CALIBRATION_STORAGE_KEY,
  DEFAULT_CALIBRATION,
  checkPrintableArea,
} from "@/lib/service-report/layout";

/** 記憶體版 localStorage；throwOnWrite = 模擬隱私模式 / 配額用盡。 */
function fakeStorage(initial?: string, throwOnWrite = false) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(CALIBRATION_STORAGE_KEY, initial);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (throwOnWrite) throw new Error("QuotaExceeded");
      map.set(k, v);
    },
  };
}

describe("校正 store（CalibrationPanel 的持久化）", () => {
  it("server 快照固定為預設值（避免 hydration 不一致）", () => {
    const store = createCalibrationStore(() => fakeStorage());
    expect(store.getServerSnapshot().calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it("沒有存過 → 預設值；存過 → 讀回並 clamp 到合法範圍", () => {
    expect(
      createCalibrationStore(() => fakeStorage()).getSnapshot().calibration,
    ).toEqual(DEFAULT_CALIBRATION);

    const store = createCalibrationStore(() =>
      fakeStorage(JSON.stringify({ offsetXmm: 99, offsetYmm: -40, scale: 2 })),
    );
    expect(store.getSnapshot().calibration).toEqual({
      offsetXmm: 15,
      offsetYmm: -15,
      scale: 1.1,
    });
  });

  it("壞掉的 JSON / 空值回預設值", () => {
    expect(
      createCalibrationStore(() => fakeStorage("{oops")).getSnapshot()
        .calibration,
    ).toEqual(DEFAULT_CALIBRATION);
    const blank = createCalibrationStore(() =>
      fakeStorage(JSON.stringify({ offsetXmm: "", scale: "" })),
    );
    expect(blank.getSnapshot().calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it("set：clamp 後寫入 storage、通知訂閱者、快照參照更新", () => {
    const storage = fakeStorage();
    const store = createCalibrationStore(() => storage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();

    const snap = store.set({ offsetXmm: "3.5", offsetYmm: 20, scale: 0.5 });
    expect(snap.calibration).toEqual({
      offsetXmm: 3.5,
      offsetYmm: 15,
      scale: 0.9,
    });
    expect(snap.persisted).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(JSON.parse(storage.map.get(CALIBRATION_STORAGE_KEY)!)).toEqual(
      snap.calibration,
    );

    unsubscribe();
    store.set(DEFAULT_CALIBRATION);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reset 回預設值", () => {
    const storage = fakeStorage();
    const store = createCalibrationStore(() => storage);
    store.set({ offsetXmm: 5, offsetYmm: 5, scale: 1.05 });
    expect(store.reset().calibration).toEqual(DEFAULT_CALIBRATION);
  });

  it("storage 不可寫（隱私模式）→ persisted false，但校正值仍生效", () => {
    const store = createCalibrationStore(() => fakeStorage(undefined, true));
    const snap = store.set({ offsetXmm: 2, offsetYmm: 0, scale: 1 });
    expect(snap.persisted).toBe(false);
    expect(snap.calibration.offsetXmm).toBe(2);
  });

  it("沒有 storage（SSR）→ 預設值、persisted false", () => {
    const store = createCalibrationStore(() => null);
    expect(store.getSnapshot().calibration).toEqual(DEFAULT_CALIBRATION);
    expect(store.set({ offsetXmm: 1 }).persisted).toBe(false);
  });

  it("校正值超出可列印範圍時有警示（工具列用）", () => {
    expect(checkPrintableArea(DEFAULT_CALIBRATION)).toEqual([]);
    const warnings = checkPrintableArea({
      offsetXmm: 0,
      offsetYmm: -12,
      scale: 1,
    });
    expect(warnings.map((w) => w.edge)).toContain("top");
    expect(warnings[0].message).toContain("超出安全範圍");
  });
});

describe("列印決策 resolvePrint", () => {
  it("空白表單（無 record）→ 直接列印，不寫 DB", async () => {
    await expect(resolvePrint({})).resolves.toEqual({ print: true });
  });

  it("已作廢 → 不列印並顯示原因，且不呼叫 recordPrintAction", async () => {
    const record = vi.fn();
    await expect(
      resolvePrint({ blockedReason: "已作廢的報告單不可列印", record }),
    ).resolves.toEqual({
      print: false,
      error: "已作廢的報告單不可列印",
    });
    expect(record).not.toHaveBeenCalled();
  });

  it("recordPrintAction 成功 → 列印", async () => {
    const record = vi.fn().mockResolvedValue({ ok: true, data: {} });
    await expect(resolvePrint({ record })).resolves.toEqual({ print: true });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("recordPrintAction 回錯誤 → 不列印，顯示 server 的中文訊息", async () => {
    const record = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "報告單狀態已變更，請重新整理" });
    await expect(resolvePrint({ record })).resolves.toEqual({
      print: false,
      error: "報告單狀態已變更，請重新整理",
    });
  });

  it("網路錯誤 → 不列印（避免紙本與列印紀錄不一致）", async () => {
    const record = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const res = await resolvePrint({ record });
    expect(res.print).toBe(false);
    expect(res).toHaveProperty("error");
  });
});
