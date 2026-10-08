import { describe, it, expect } from "vitest";

// 建單時就地新增主檔（#218）的純邏輯：
//   1. mergeOptions：父層重傳 options 時保留就地新增的項目、依 id 去重
//   2. filterComboboxOptions / comboboxEntries：Combobox 結果清單與「＋ 新增」項
//   3. quickCreateLabel：新增項的文字
//   4. guessCodeOrName：搜尋字串預先帶入代碼或名稱
//   5. empty*Input：Dialog 表單的初始值
//   6. quickCreateTargets：各單別可新增的主檔（退貨單不提供）
//   7. isImeComposing：輸入法選字中的 Enter 不可觸發選取／新增
import {
  comboboxEntries,
  emptyCustomerInput,
  emptyVendorInput,
  emptyWarehouseInput,
  filterComboboxOptions,
  guessCodeOrName,
  isImeComposing,
  mergeOptions,
  quickCreateLabel,
  quickCreateTargets,
} from "@/lib/erp/quick-create";

type Opt = { id: string; name: string };
const a: Opt = { id: "a", name: "伍虹企業" };
const b: Opt = { id: "b", name: "兆泰電線" };
const c: Opt = { id: "c", name: "伍弘實業" };

describe("mergeOptions", () => {
  it("沒有新增項目 → 回傳原陣列（同一參考，避免下游 useMemo 重算）", () => {
    const base = [a, b];
    expect(mergeOptions(base, [])).toBe(base);
  });

  it("新增項目接在最後", () => {
    expect(mergeOptions([a, b], [c])).toEqual([a, b, c]);
  });

  it("父層重傳的 options 已含新增項 → 不重複、以父層（server）版本為準", () => {
    const fresh = { id: "c", name: "伍弘實業股份有限公司" };
    const base = [a, b, fresh];
    const merged = mergeOptions(base, [c]);
    expect(merged).toBe(base);
    expect(merged.filter((o) => o.id === "c")).toEqual([fresh]);
  });

  it("父層重傳的 options 不含新增項 → 新增項保留（不被洗掉）", () => {
    const first = mergeOptions([a], [c]);
    const reloaded = mergeOptions([a, b], [c]);
    expect(first.map((o) => o.id)).toEqual(["a", "c"]);
    expect(reloaded.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("新增清單本身重複 id → 只留第一筆", () => {
    expect(mergeOptions([a], [c, { ...c, name: "x" }])).toEqual([a, c]);
  });
});

describe("filterComboboxOptions", () => {
  const text = (o: Opt) => o.name;

  it("空白查詢 → 全部（受 max 限制）", () => {
    expect(filterComboboxOptions([a, b, c], "  ", text, 2)).toEqual([a, b]);
  });

  it("不分大小寫、部分比對", () => {
    const opts = [
      { id: "1", name: "AM3-22A" },
      { id: "2", name: "TOK-0360" },
    ];
    expect(filterComboboxOptions(opts, "am3", (o) => o.name, 50)).toEqual([
      opts[0],
    ]);
  });

  it("「伍」→ 伍虹、伍弘", () => {
    expect(filterComboboxOptions([a, b, c], "伍", text, 50)).toEqual([a, c]);
  });
});

describe("comboboxEntries", () => {
  it("不允許新增 → 只有選項（行為與原本相同）", () => {
    expect(comboboxEntries([a, b], "伍", false)).toEqual([
      { kind: "option", option: a },
      { kind: "option", option: b },
    ]);
    expect(comboboxEntries([], "不存在", false)).toEqual([]);
  });

  it("允許新增 → 新增項接在選項最後，帶入去頭尾空白的查詢字", () => {
    expect(comboboxEntries([a], " 伍 ", true)).toEqual([
      { kind: "option", option: a },
      { kind: "create", query: "伍" },
    ]);
  });

  it("允許新增且查無結果 → 只剩新增項（Enter 即新增）", () => {
    expect(comboboxEntries([], "伍虹", true)).toEqual([
      { kind: "create", query: "伍虹" },
    ]);
  });

  it("允許新增且查詢空白 → 仍有新增項（query 為空字串）", () => {
    expect(comboboxEntries([], "", true)).toEqual([
      { kind: "create", query: "" },
    ]);
  });
});

describe("quickCreateLabel", () => {
  it("有查詢字 → ＋ 新增『xxx』", () => {
    expect(quickCreateLabel("伍虹")).toBe("＋ 新增『伍虹』");
    expect(quickCreateLabel("  伍虹 ")).toBe("＋ 新增『伍虹』");
  });

  it("查詢空白 → ＋ 新增…", () => {
    expect(quickCreateLabel("")).toBe("＋ 新增…");
    expect(quickCreateLabel("   ")).toBe("＋ 新增…");
  });

  it("可帶對象名稱", () => {
    expect(quickCreateLabel("AM3-22", "品項")).toBe("＋ 新增品項『AM3-22』");
    expect(quickCreateLabel("", "品項")).toBe("＋ 新增品項…");
  });
});

describe("guessCodeOrName", () => {
  it.each(["KE108", "AM3-22A-E30", "TOK-0360", "LM-F-0010-P", "A046"])(
    "英數代碼樣式 %s → 帶入代碼",
    (q) => {
      expect(guessCodeOrName(q)).toEqual({ code: q, name: "" });
    },
  );

  it.each([
    "伍虹企業有限公司",
    "MAIN",
    "Atlas Copco",
    "兆泰電線電纜有限公司(F.補)",
  ])("其他 %s → 帶入名稱", (q) => {
    expect(guessCodeOrName(q)).toEqual({ code: "", name: q });
  });

  it("去頭尾空白；空字串 → 皆空", () => {
    expect(guessCodeOrName("  KE108 ")).toEqual({ code: "KE108", name: "" });
    expect(guessCodeOrName("  ")).toEqual({ code: "", name: "" });
  });
});

describe("empty*Input", () => {
  it("客戶：預設 ERP 啟用，可覆寫", () => {
    const v = emptyCustomerInput({ name: "伍虹" });
    expect(v).toMatchObject({ name: "伍虹", code: "", erp_active: true });
  });

  it("廠商：預設 TWD、啟用", () => {
    expect(emptyVendorInput({ code: "KA405" })).toMatchObject({
      code: "KA405",
      name: "",
      currency: "TWD",
      active: true,
    });
  });

  it("倉庫：預設非預設倉、啟用", () => {
    expect(emptyWarehouseInput({ name: "二倉" })).toEqual({
      code: "",
      name: "二倉",
      is_default: false,
      active: true,
      note: "",
    });
  });
});

describe("quickCreateTargets", () => {
  it("報價／銷貨：客戶、倉庫、品項", () => {
    for (const t of ["Q", "S"] as const) {
      expect(quickCreateTargets(t)).toEqual({
        customer: true,
        vendor: false,
        warehouse: true,
        item: true,
      });
    }
  });

  it("採購／進貨：廠商、倉庫、品項", () => {
    for (const t of ["P", "I"] as const) {
      expect(quickCreateTargets(t)).toEqual({
        customer: false,
        vendor: true,
        warehouse: true,
        item: true,
      });
    }
  });

  it("銷退：客戶與品項來自來源銷貨單 → 只可新增入庫倉", () => {
    expect(quickCreateTargets("SR")).toEqual({
      customer: false,
      vendor: false,
      warehouse: true,
      item: false,
    });
  });

  it("進退：廠商、品項、出庫倉皆來自來源進貨單 → 全部不可新增", () => {
    expect(quickCreateTargets("PR")).toEqual({
      customer: false,
      vendor: false,
      warehouse: false,
      item: false,
    });
  });

  it("調撥／盤點調整：倉庫、品項", () => {
    for (const t of ["T", "A"] as const) {
      expect(quickCreateTargets(t)).toEqual({
        customer: false,
        vendor: false,
        warehouse: true,
        item: true,
      });
    }
  });
});

describe("isImeComposing", () => {
  it("Chrome 組字中（isComposing=true，key 可能仍是 Enter）", () => {
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it("Safari 確認選字的 Enter（isComposing=false、keyCode 229）", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("一般 Enter／方向鍵 → 不是組字", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 40 })).toBe(false);
    expect(isImeComposing({})).toBe(false);
  });
});
