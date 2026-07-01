import { describe, expect, it } from "vitest";
import {
  parseHpOutput,
  hpOutputToText,
  sortHpOutput,
  rangeLabel,
} from "@/lib/products/hp-output";

describe("parseHpOutput", () => {
  it("每行 馬力數=造氣量 解析成物件陣列", () => {
    expect(parseHpOutput("10=1.094\n20=2.372")).toEqual([
      { hp: "10", output: "1.094" },
      { hp: "20", output: "2.372" },
    ]);
  });

  it("trim 兩側空白", () => {
    expect(parseHpOutput("  10 = 1.094  ")).toEqual([
      { hp: "10", output: "1.094" },
    ]);
  });

  it("略過空行、無等號行、缺任一側的行", () => {
    expect(parseHpOutput("10=1.094\n\n沒有等號\n30=\n=5\n50=6.58")).toEqual([
      { hp: "10", output: "1.094" },
      { hp: "50", output: "6.58" },
    ]);
  });

  it("空字串回空陣列", () => {
    expect(parseHpOutput("")).toEqual([]);
  });
});

describe("hpOutputToText", () => {
  it("陣列還原成多行文字", () => {
    expect(
      hpOutputToText([
        { hp: "10", output: "1.094" },
        { hp: "20", output: "2.372" },
      ]),
    ).toBe("10=1.094\n20=2.372");
  });

  it("空 / undefined / null 回空字串", () => {
    expect(hpOutputToText([])).toBe("");
    expect(hpOutputToText(undefined)).toBe("");
    expect(hpOutputToText(null)).toBe("");
  });

  it("與 parseHpOutput 互為反向", () => {
    const text = "10=1.094\n215=32.66";
    expect(hpOutputToText(parseHpOutput(text))).toBe(text);
  });
});

describe("sortHpOutput", () => {
  it("依 hp 數值升冪（非字典序）", () => {
    const rows = [
      { hp: "215", output: "32.66" },
      { hp: "20", output: "2.372" },
      { hp: "100", output: "15.18" },
    ];
    expect(sortHpOutput(rows).map((r) => r.hp)).toEqual(["20", "100", "215"]);
  });

  it("不改動原陣列", () => {
    const rows = [
      { hp: "30", output: "3.905" },
      { hp: "10", output: "1.094" },
    ];
    sortHpOutput(rows);
    expect(rows[0].hp).toBe("30");
  });

  it("無法解析為數字者排在最後", () => {
    const rows = [
      { hp: "x", output: "?" },
      { hp: "10", output: "1.094" },
    ];
    expect(sortHpOutput(rows).map((r) => r.hp)).toEqual(["10", "x"]);
  });
});

describe("rangeLabel", () => {
  it("多值產生 min–max", () => {
    expect(rangeLabel(["10", "215", "50"])).toBe("10–215");
  });

  it("單值不重複顯示", () => {
    expect(rangeLabel(["10"])).toBe("10");
  });

  it("全部無法解析回空字串", () => {
    expect(rangeLabel(["a", "b"])).toBe("");
  });

  it("空陣列回空字串", () => {
    expect(rangeLabel([])).toBe("");
  });
});
