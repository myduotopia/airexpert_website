import { describe, it, expect } from "vitest";

import { moveItem, moveToEdge, pageWindow } from "@/lib/admin/table";

const KEYS = ["a", "b", "c", "d", "e"];

describe("moveItem（剪下-貼上式跨頁移動）", () => {
  it("往前移：插入到目標列之前", () => {
    expect(moveItem(KEYS, "e", "b", "before")).toEqual([
      "a",
      "e",
      "b",
      "c",
      "d",
    ]);
  });

  it("往前移：插入到目標列之後", () => {
    expect(moveItem(KEYS, "e", "b", "after")).toEqual([
      "a",
      "b",
      "e",
      "c",
      "d",
    ]);
  });

  // 往後移時先移除元素會讓目標索引前移一格，必須以移除後的索引計算插入點。
  it("往後移：插入到目標列之前（索引位移）", () => {
    expect(moveItem(KEYS, "a", "d", "before")).toEqual([
      "b",
      "c",
      "a",
      "d",
      "e",
    ]);
  });

  it("往後移：插入到目標列之後（索引位移）", () => {
    expect(moveItem(KEYS, "a", "d", "after")).toEqual([
      "b",
      "c",
      "d",
      "a",
      "e",
    ]);
  });

  it("移到第一列之前 = 置頂", () => {
    expect(moveItem(KEYS, "d", "a", "before")).toEqual([
      "d",
      "a",
      "b",
      "c",
      "e",
    ]);
  });

  it("移到最後一列之後 = 置底", () => {
    expect(moveItem(KEYS, "b", "e", "after")).toEqual([
      "a",
      "c",
      "d",
      "e",
      "b",
    ]);
  });

  it("相鄰列移動不會遺失或重複項目", () => {
    const next = moveItem(KEYS, "b", "c", "after");
    expect(next).toEqual(["a", "c", "b", "d", "e"]);
    expect(new Set(next).size).toBe(KEYS.length);
  });

  it("目標就是自己時為 no-op", () => {
    expect(moveItem(KEYS, "c", "c", "before")).toEqual(KEYS);
    expect(moveItem(KEYS, "c", "c", "after")).toEqual(KEYS);
  });

  it("key 不存在時回傳原順序", () => {
    expect(moveItem(KEYS, "zz", "b", "before")).toEqual(KEYS);
    expect(moveItem(KEYS, "a", "zz", "before")).toEqual(KEYS);
  });

  it("不會就地修改輸入陣列", () => {
    const input = [...KEYS];
    moveItem(input, "e", "a", "before");
    expect(input).toEqual(KEYS);
  });
});

describe("moveToEdge（置頂 / 置底）", () => {
  it("置頂", () => {
    expect(moveToEdge(KEYS, "d", "start")).toEqual(["d", "a", "b", "c", "e"]);
  });

  it("置底", () => {
    expect(moveToEdge(KEYS, "b", "end")).toEqual(["a", "c", "d", "e", "b"]);
  });

  it("已在該端點時順序不變", () => {
    expect(moveToEdge(KEYS, "a", "start")).toEqual(KEYS);
    expect(moveToEdge(KEYS, "e", "end")).toEqual(KEYS);
  });

  it("key 不存在時回傳原順序", () => {
    expect(moveToEdge(KEYS, "zz", "start")).toEqual(KEYS);
  });
});

describe("pageWindow（分頁頁碼視窗）", () => {
  it("總頁數 <= span + 2 時全部列出，不出現省略號", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("當前頁在最前面", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
  });

  it("當前頁在中間時置中", () => {
    expect(pageWindow(10, 20)).toEqual([
      1,
      "ellipsis",
      8,
      9,
      10,
      11,
      12,
      "ellipsis",
      20,
    ]);
  });

  it("當前頁在最後面", () => {
    expect(pageWindow(20, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  it("視窗與頭尾相連時不插入多餘省略號", () => {
    // total=8, current=4 → 視窗 2..6，與第 1 頁相連，故左側無省略號。
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, 6, "ellipsis", 8]);
    // total=8, current=5 → 視窗 3..7，與第 8 頁相連，故右側無省略號。
    expect(pageWindow(5, 8)).toEqual([1, "ellipsis", 3, 4, 5, 6, 7, 8]);
  });

  it("永遠包含第一頁與最後一頁，且頁碼遞增不重複", () => {
    for (let current = 1; current <= 30; current++) {
      const win = pageWindow(current, 30);
      const nums = win.filter((t): t is number => typeof t === "number");
      expect(nums[0]).toBe(1);
      expect(nums[nums.length - 1]).toBe(30);
      expect(nums).toContain(current);
      expect(new Set(nums).size).toBe(nums.length);
      expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    }
  });

  it("current 超出範圍時夾在合法區間", () => {
    expect(pageWindow(0, 20)).toEqual(pageWindow(1, 20));
    expect(pageWindow(99, 20)).toEqual(pageWindow(20, 20));
  });

  it("total 小於 1 時回傳單頁", () => {
    expect(pageWindow(1, 0)).toEqual([1]);
  });
});
