import { describe, it, expect } from "vitest";

// ERP 數字輸入欄（#247，#238 §4 N-1）：
//   - 值為 0 時顯示空白（placeholder 顯示「0」），空白解析為 0 → formatNumberText / parseNumberText
//   - 千分位、負數、小數位數的輸入檢核維持原行為 → sanitizeNumberInput
//   - 滑鼠點欄位中間後直接輸入要取代原值：聚焦全選，且只有「這次聚焦帶來的第一次 mouseup」
//     要 preventDefault（否則瀏覽器會在 mouseup 放游標、取消全選）→ focusSelectEvent
import {
  focusSelectEvent,
  formatNumberText,
  parseNumberText,
  sanitizeNumberInput,
  type FocusSelectState,
} from "@/lib/erp/number-input";

describe("formatNumberText", () => {
  it("0 預設顯示空白", () => {
    expect(formatNumberText(0)).toBe("");
    expect(formatNumberText(-0)).toBe("");
  });

  it("blankZero=false 時 0 照常顯示", () => {
    expect(formatNumberText(0, { blankZero: false })).toBe("0");
  });

  it("非 0 照常顯示（數量預設 1 仍顯示 1）", () => {
    expect(formatNumberText(1)).toBe("1");
    expect(formatNumberText(75000)).toBe("75000");
    expect(formatNumberText(-12.5)).toBe("-12.5");
    expect(formatNumberText(0.05)).toBe("0.05");
  });
});

describe("parseNumberText", () => {
  it("空白解析為 0", () => {
    expect(parseNumberText("")).toBe(0);
    expect(parseNumberText("   ")).toBe(0);
  });

  it("未完成的輸入（只有 - 或 .）解析為 0", () => {
    expect(parseNumberText("-")).toBe(0);
    expect(parseNumberText(".")).toBe(0);
    expect(parseNumberText("-.")).toBe(0);
  });

  it("負數與小數", () => {
    expect(parseNumberText("-3")).toBe(-3);
    expect(parseNumberText("1.")).toBe(1);
    expect(parseNumberText("12.345")).toBe(12.345);
    expect(parseNumberText("-0.5")).toBe(-0.5);
  });

  it("千分位逗號忽略", () => {
    expect(parseNumberText("75,000")).toBe(75000);
    expect(parseNumberText("1,234,567.89")).toBe(1234567.89);
  });

  it("無法解析時為 0", () => {
    expect(parseNumberText("abc")).toBe(0);
  });
});

describe("sanitizeNumberInput", () => {
  const plain = { allowNegative: false, decimals: 2 };

  it("去掉千分位逗號", () => {
    expect(sanitizeNumberInput("75,000", plain)).toBe("75000");
    expect(sanitizeNumberInput("1,234.5", plain)).toBe("1234.5");
  });

  it("空字串允許（清空欄位）", () => {
    expect(sanitizeNumberInput("", plain)).toBe("");
  });

  it("負號只在 allowNegative 時接受", () => {
    expect(sanitizeNumberInput("-5", plain)).toBeNull();
    expect(sanitizeNumberInput("-", plain)).toBeNull();
    const neg = { allowNegative: true, decimals: 2 };
    expect(sanitizeNumberInput("-5", neg)).toBe("-5");
    expect(sanitizeNumberInput("-", neg)).toBe("-");
    expect(sanitizeNumberInput("5-", neg)).toBeNull();
  });

  it("小數位數上限", () => {
    expect(sanitizeNumberInput("1.", plain)).toBe("1.");
    expect(sanitizeNumberInput("1.23", plain)).toBe("1.23");
    expect(sanitizeNumberInput("1.234", plain)).toBeNull();
  });

  it("decimals=0 只收整數", () => {
    const int = { allowNegative: false, decimals: 0 };
    expect(sanitizeNumberInput("12", int)).toBe("12");
    expect(sanitizeNumberInput("1.", int)).toBeNull();
  });

  it("非數字字元拒絕", () => {
    expect(sanitizeNumberInput("12a", plain)).toBeNull();
    expect(sanitizeNumberInput("1.2.3", plain)).toBeNull();
  });
});

describe("focusSelectEvent", () => {
  const idle: FocusSelectState = { armed: false };

  it("滑鼠點未聚焦欄位：mousedown → focus（全選）→ 第一次 mouseup preventDefault 並再全選", () => {
    let s = idle;
    const down = focusSelectEvent("mousedown", s, { focused: false });
    expect(down.preventDefault).toBe(false);
    expect(down.select).toBe(false);
    s = down.state;

    const focus = focusSelectEvent("focus", s);
    expect(focus.select).toBe(true);
    expect(focus.preventDefault).toBe(false);
    s = focus.state;

    const up = focusSelectEvent("mouseup", s);
    expect(up.preventDefault).toBe(true);
    expect(up.select).toBe(true);
    s = up.state;

    // 已聚焦後再點欄位：要能正常移動游標，不可 preventDefault 也不可全選。
    const down2 = focusSelectEvent("mousedown", s, { focused: true });
    s = down2.state;
    const up2 = focusSelectEvent("mouseup", s);
    expect(up2.preventDefault).toBe(false);
    expect(up2.select).toBe(false);
  });

  it("第二次 mouseup（未經 mousedown，例如拖曳結束）也不 preventDefault", () => {
    let s = focusSelectEvent("mousedown", idle, { focused: false }).state;
    s = focusSelectEvent("focus", s).state;
    s = focusSelectEvent("mouseup", s).state;
    const up2 = focusSelectEvent("mouseup", s);
    expect(up2.preventDefault).toBe(false);
    expect(up2.select).toBe(false);
  });

  it("Tab 聚焦：focus 全選，之後滑鼠點同欄位不攔 mouseup", () => {
    const focus = focusSelectEvent("focus", idle);
    expect(focus.select).toBe(true);
    let s = focus.state;
    s = focusSelectEvent("mousedown", s, { focused: true }).state;
    const up = focusSelectEvent("mouseup", s);
    expect(up.preventDefault).toBe(false);
    expect(up.select).toBe(false);
  });

  it("mousedown 後焦點離開（未到 mouseup）時解除，下一次 mouseup 不攔", () => {
    let s = focusSelectEvent("mousedown", idle, { focused: false }).state;
    s = focusSelectEvent("focus", s).state;
    s = focusSelectEvent("blur", s).state;
    expect(s.armed).toBe(false);
    const up = focusSelectEvent("mouseup", s);
    expect(up.preventDefault).toBe(false);
  });

  it("mousedown 在已聚焦欄位會解除殘留的 armed（例：上次在欄位外放開滑鼠）", () => {
    const armed: FocusSelectState = { armed: true };
    const down = focusSelectEvent("mousedown", armed, { focused: true });
    expect(down.state.armed).toBe(false);
  });
});
