import { describe, it, expect } from "vitest";
import {
  CALIBRATION_STORAGE_KEY,
  DEFAULT_CALIBRATION,
  FORM_BOX_MM,
  PAPER_HEIGHT_MM,
  PAPER_WIDTH_MM,
  SAFE_MARGINS_MM,
  checkPrintableArea,
  clampCalibration,
  contentBoxMm,
  loadCalibration,
  mmToCqw,
  pageRule,
  ptToMm,
  saveCalibration,
} from "@/lib/service-report/layout";

describe("紙張常數與換算", () => {
  it("A4 與安全邊界", () => {
    expect([PAPER_WIDTH_MM, PAPER_HEIGHT_MM]).toEqual([210, 297]);
    expect(SAFE_MARGINS_MM).toEqual({ top: 10, bottom: 8, left: 8, right: 8 });
    expect(FORM_BOX_MM).toEqual({
      left: 8,
      top: 10,
      right: 202,
      bottom: 289,
      width: 194,
      height: 279,
    });
  });
  it("pageRule", () => {
    expect(pageRule()).toBe("@page { size: 210mm 297mm; margin: 0 }");
  });
  it("mm → cqw、pt → mm", () => {
    expect(mmToCqw(210)).toBe(100);
    expect(mmToCqw(21)).toBe(10);
    expect(ptToMm(72)).toBe(25.4);
    expect(ptToMm(9)).toBe(3.175);
  });
});

describe("clampCalibration", () => {
  it("非物件 / 空物件 → 預設", () => {
    for (const v of [null, undefined, "x", 3, [], {}]) {
      expect(clampCalibration(v)).toEqual(DEFAULT_CALIBRATION);
    }
  });
  it("空白 / NaN / Infinity → 預設值（不是 0 以外的極值）", () => {
    expect(
      clampCalibration({ offsetXmm: "", offsetYmm: "abc", scale: "" }),
    ).toEqual(DEFAULT_CALIBRATION);
    expect(
      clampCalibration({ offsetXmm: NaN, offsetYmm: Infinity, scale: NaN }),
    ).toEqual(DEFAULT_CALIBRATION);
    expect(clampCalibration({ scale: "  " }).scale).toBe(1);
  });
  it("夾住範圍：平移 ±15mm、縮放 0.9–1.1", () => {
    expect(
      clampCalibration({ offsetXmm: 20, offsetYmm: -99, scale: 2 }),
    ).toEqual({ offsetXmm: 15, offsetYmm: -15, scale: 1.1 });
    expect(clampCalibration({ scale: 0 }).scale).toBe(0.9);
  });
  it("接受數字字串；部分欄位保留", () => {
    expect(clampCalibration({ offsetXmm: "2.5", scale: "0.95" })).toEqual({
      offsetXmm: 2.5,
      offsetYmm: 0,
      scale: 0.95,
    });
  });
});

describe("contentBoxMm / checkPrintableArea", () => {
  it("預設：內容剛好等於安全範圍、無警示", () => {
    expect(contentBoxMm(DEFAULT_CALIBRATION)).toEqual(FORM_BOX_MM);
    expect(checkPrintableArea(DEFAULT_CALIBRATION)).toEqual([]);
  });
  it("縮小 90% 以中心縮放、四邊皆在範圍內", () => {
    const box = contentBoxMm({ offsetXmm: 0, offsetYmm: 0, scale: 0.9 });
    expect(box.width).toBeCloseTo(194 * 0.9, 3);
    expect(box.height).toBeCloseTo(279 * 0.9, 3);
    expect(box.left).toBeCloseTo(105 - 97 * 0.9, 3);
    expect(
      checkPrintableArea({ offsetXmm: 0, offsetYmm: 0, scale: 0.9 }),
    ).toEqual([]);
  });
  it("往下平移 → 下緣超出，回報 mm", () => {
    const w = checkPrintableArea({ offsetXmm: 0, offsetYmm: 3, scale: 1 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ edge: "bottom", overMm: 3 });
    expect(w[0].message).toContain("下緣");
    expect(w[0].message).toContain("3mm");
  });
  it("往左上平移 → 上、左超出（依 上下左右 排序）", () => {
    const w = checkPrintableArea({ offsetXmm: -2.5, offsetYmm: -1, scale: 1 });
    expect(w.map((x) => [x.edge, x.overMm])).toEqual([
      ["top", 1],
      ["left", 2.5],
    ]);
  });
  it("放大 110% → 四邊皆超出", () => {
    const w = checkPrintableArea({ offsetXmm: 0, offsetYmm: 0, scale: 1.1 });
    expect(w.map((x) => x.edge)).toEqual(["top", "bottom", "left", "right"]);
    // 上緣：148.5 − 138.5×1.1 = −3.85 → 超出 10 − (−3.85) = 13.85
    expect(w[0].overMm).toBeCloseTo(13.85, 2);
  });
  it("縮小後平移可抵銷：90% + 往下 10mm 仍在範圍內", () => {
    // 90% 時上方多出 13.85mm、下方多出 14.05mm 餘裕
    expect(
      checkPrintableArea({ offsetXmm: 0, offsetYmm: 10, scale: 0.9 }),
    ).toEqual([]);
  });
});

describe("loadCalibration / saveCalibration", () => {
  function memory(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      get length() {
        return m.size;
      },
    };
  }
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };

  it("存了再讀回（已正規化）", () => {
    const s = memory();
    expect(saveCalibration(s, { offsetXmm: 3, offsetYmm: 99, scale: 1 })).toBe(
      true,
    );
    expect(JSON.parse(s.getItem(CALIBRATION_STORAGE_KEY)!)).toEqual({
      offsetXmm: 3,
      offsetYmm: 15,
      scale: 1,
    });
    expect(loadCalibration(s)).toEqual({
      offsetXmm: 3,
      offsetYmm: 15,
      scale: 1,
    });
  });
  it("key 為 sr-print-calibration", () => {
    expect(CALIBRATION_STORAGE_KEY).toBe("sr-print-calibration");
  });
  it("無資料 / JSON 壞掉 / storage 不存在 / 丟錯 → 預設", () => {
    const s = memory();
    expect(loadCalibration(s)).toEqual(DEFAULT_CALIBRATION);
    s.setItem(CALIBRATION_STORAGE_KEY, "{not json");
    expect(loadCalibration(s)).toEqual(DEFAULT_CALIBRATION);
    expect(loadCalibration(null)).toEqual(DEFAULT_CALIBRATION);
    expect(loadCalibration(undefined)).toEqual(DEFAULT_CALIBRATION);
    expect(loadCalibration(throwing)).toEqual(DEFAULT_CALIBRATION);
  });
  it("回傳的預設值是新物件（修改不影響常數）", () => {
    const c = loadCalibration(null);
    c.scale = 1.05;
    expect(DEFAULT_CALIBRATION.scale).toBe(1);
  });
  it("storage 丟錯或不存在時 save 回 false", () => {
    expect(saveCalibration(throwing, DEFAULT_CALIBRATION)).toBe(false);
    expect(saveCalibration(null, DEFAULT_CALIBRATION)).toBe(false);
  });
});
