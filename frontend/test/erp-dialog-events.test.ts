import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleDialogCancel, handleDialogClose } from "@/lib/erp/dialog-events";

// #223 review：巢狀 ErpDialog（新增客戶 Dialog 內再開新增員工 Dialog）按 Esc 時，
// React 會把 cancel 沿元件樹（穿過 portal）傳給外層 <dialog> 的 onCancel，外層會一起關閉、
// 客戶表單已填內容遺失。處理函式必須停止冒泡。

function fakeEvent() {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe("ErpDialog cancel／close 事件", () => {
  it("cancel（Esc）：阻止瀏覽器自行關閉、停止冒泡、通知父層", () => {
    const e = fakeEvent();
    const onClose = vi.fn();
    handleDialogCancel(e, onClose);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close：停止冒泡；非主動關閉時通知父層", () => {
    const e = fakeEvent();
    const onClose = vi.fn();
    handleDialogClose(e, false, onClose);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close：主動關閉（卸載中）時不重複通知父層，但仍停止冒泡", () => {
    const e = fakeEvent();
    const onClose = vi.fn();
    handleDialogClose(e, true, onClose);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("巢狀模擬：內層處理後停止冒泡，外層 onCancel 不會被呼叫", () => {
    // 以最小的「沿元件樹冒泡」模型模擬 React 的派送：依序呼叫內→外的 handler，遇到 stopPropagation 即停。
    const inner = vi.fn();
    const outer = vi.fn();
    let stopped = false;
    const e = {
      preventDefault: () => {},
      stopPropagation: () => {
        stopped = true;
      },
    };
    const chain = [
      () => handleDialogCancel(e, inner),
      () => handleDialogCancel(e, outer),
    ];
    for (const h of chain) {
      if (stopped) break;
      h();
    }
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("ErpDialog 的 <dialog> 使用上述處理函式（防止退步）", () => {
    const src = readFileSync(
      join(__dirname, "..", "src/components/erp/ErpDialog.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /onCancel=\{\(e\) => handleDialogCancel\(e, onClose\)\}/,
    );
    expect(src).toMatch(
      /onClose=\{\(e\) =>\s*handleDialogClose\(e, closingRef\.current, onClose\)\s*\}/,
    );
  });
});
