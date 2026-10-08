import { describe, expect, it } from "vitest";
import {
  computeListPlacement,
  LIST_GAP,
  VIEWPORT_MARGIN,
  type ListPlacementInput,
} from "@/lib/erp/floating-list";

// 輸入框：高 36px、寬 220px。
function anchor(top: number, left = 100, width = 220, height = 36) {
  return { top, bottom: top + height, left, width };
}

function input(over: Partial<ListPlacementInput>): ListPlacementInput {
  return {
    anchorRect: anchor(100),
    viewportWidth: 1280,
    viewportHeight: 800,
    preferredMaxHeight: 288,
    minWidth: 240,
    ...over,
  };
}

/** 清單實際佔用的上下緣（以 viewport 為座標）。 */
function verticalBox(
  p: ReturnType<typeof computeListPlacement>,
  viewportHeight: number,
) {
  if (p.placement === "below") {
    return { top: p.top!, bottom: p.top! + p.maxHeight };
  }
  const bottom = viewportHeight - p.bottom!;
  return { top: bottom - p.maxHeight, bottom };
}

describe("computeListPlacement", () => {
  it("下方空間足夠 → 往下開，緊貼輸入框下緣", () => {
    const p = computeListPlacement(input({}));
    expect(p.placement).toBe("below");
    expect(p.top).toBe(136 + LIST_GAP);
    expect(p.bottom).toBeUndefined();
    expect(p.maxHeight).toBe(288);
    expect(p.left).toBe(100);
  });

  it("寬度至少等於輸入框，且不小於 minWidth", () => {
    expect(computeListPlacement(input({ minWidth: 240 })).width).toBe(240);
    expect(
      computeListPlacement(
        input({ anchorRect: anchor(100, 100, 400), minWidth: 240 }),
      ).width,
    ).toBe(400);
  });

  it("下方不足且上方較多 → 往上開，以 bottom 定位貼齊輸入框上緣", () => {
    const p = computeListPlacement(input({ anchorRect: anchor(650) }));
    expect(p.placement).toBe("above");
    expect(p.top).toBeUndefined();
    // 清單下緣 = 輸入框上緣 - gap
    expect(800 - p.bottom!).toBe(650 - LIST_GAP);
    expect(p.maxHeight).toBe(288);
  });

  it("內容較矮、下方放得下 → 不必往上開", () => {
    // 下方可用 = 800 - 686 - gap - margin ≈ 102；內容只有 80px。
    const p = computeListPlacement(
      input({ anchorRect: anchor(650), contentHeight: 80 }),
    );
    expect(p.placement).toBe("below");
  });

  it("兩邊都不足 → 取較大一邊，maxHeight 縮到可用空間", () => {
    // viewport 高 400；輸入框在 150–186：上方 150、下方 214。
    const below = computeListPlacement(
      input({ viewportHeight: 400, anchorRect: anchor(150) }),
    );
    expect(below.placement).toBe("below");
    expect(below.maxHeight).toBe(400 - 186 - LIST_GAP - VIEWPORT_MARGIN);

    // 輸入框在 230–266：上方 230、下方 134 → 往上。
    const above = computeListPlacement(
      input({ viewportHeight: 400, anchorRect: anchor(230) }),
    );
    expect(above.placement).toBe("above");
    expect(above.maxHeight).toBe(230 - LIST_GAP - VIEWPORT_MARGIN);
  });

  it("靠右邊界時 left 往內縮，不超出 viewport", () => {
    const p = computeListPlacement(
      input({ viewportWidth: 1000, anchorRect: anchor(100, 900, 80) }),
    );
    expect(p.width).toBe(240);
    expect(p.left).toBe(1000 - VIEWPORT_MARGIN - 240);
  });

  it("viewport 比 minWidth 還窄 → 寬度縮到 viewport 內，left 不小於邊距", () => {
    const p = computeListPlacement(
      input({ viewportWidth: 200, anchorRect: anchor(100, 20, 150) }),
    );
    expect(p.width).toBe(200 - VIEWPORT_MARGIN * 2);
    expect(p.left).toBe(VIEWPORT_MARGIN);
  });

  it("靠左邊界（輸入框部分捲出畫面）時 left 不小於邊距", () => {
    const p = computeListPlacement(input({ anchorRect: anchor(100, -60) }));
    expect(p.left).toBe(VIEWPORT_MARGIN);
  });

  it("輸入框在畫面內（含部分捲出）的各種位置，清單都不超出 viewport", () => {
    const vw = 1024;
    const vh = 600;
    // 輸入框高 36：top 從 -35（只剩 1px 在畫面上緣）到 vh-1（只剩 1px 在下緣）。
    for (let top = -35; top < vh; top += 17) {
      for (const left of [-100, 0, 300, 900, 1000]) {
        const p = computeListPlacement(
          input({
            viewportWidth: vw,
            viewportHeight: vh,
            anchorRect: anchor(top, left),
          }),
        );
        const box = verticalBox(p, vh);
        expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.bottom).toBeLessThanOrEqual(vh);
        expect(p.maxHeight).toBeGreaterThanOrEqual(0);
        expect(p.maxHeight).toBeLessThanOrEqual(288);
        expect(p.left).toBeGreaterThanOrEqual(0);
        expect(p.left + p.width).toBeLessThanOrEqual(vw);
      }
    }
  });
});
