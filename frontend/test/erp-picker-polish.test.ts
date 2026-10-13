import { describe, it, expect } from "vitest";

// ERP 選取器小修（#239）：
//   A-6：搜尋字與既有項目的代碼（客戶／廠商另含名稱）完全相同時，不顯示「＋ 新增」
//        → matchKey / hasExactMatch / shouldOfferCreate
//   A-1：就地新增 Dialog 關閉後焦點已在輸入框（focus 不會再觸發），滑鼠點欄位要能展開清單；
//        但 Dialog 關閉時焦點回來的那次 focus 不可自動展開
//        → pickerInputEvent
import {
  comboboxEntries,
  hasExactMatch,
  matchKey,
  shouldOfferCreate,
} from "@/lib/erp/quick-create";
import { pickerInputEvent, type PickerOpenState } from "@/lib/erp/picker-open";

type Item = { id: string; code: string; name: string };
type Party = { id: string; code: string | null; name: string };

const items: Item[] = [
  { id: "1", code: "AM3-08A30", name: "空壓機 8HP" },
  { id: "2", code: "AM3-08A30-3", name: "空壓機 8HP 三相" },
];
const itemKeys = (o: Item) => [o.code];

const customers: Party[] = [
  { id: "c1", code: "KE108", name: "伍虹企業" },
  { id: "c2", code: null, name: "兆泰電線" },
];
const partyKeys = (o: Party) => [o.code, o.name];

describe("matchKey", () => {
  it("去頭尾空白、轉小寫", () => {
    expect(matchKey("  Am3-08a30 ")).toBe("am3-08a30");
  });

  it("null / undefined → 空字串", () => {
    expect(matchKey(null)).toBe("");
    expect(matchKey(undefined)).toBe("");
  });

  it("中間空白保留（代碼唯一鍵只去頭尾空白）", () => {
    expect(matchKey("AM3 08")).not.toBe(matchKey("AM3  08"));
  });
});

describe("hasExactMatch", () => {
  it("代碼完全相同 → true（AM3-08A30-3 只是部分相符，不影響）", () => {
    expect(hasExactMatch(items, "AM3-08A30", itemKeys)).toBe(true);
  });

  it("不分大小寫、去頭尾空白", () => {
    expect(hasExactMatch(items, "  am3-08a30\t", itemKeys)).toBe(true);
  });

  it("只是部分相符 → false", () => {
    expect(hasExactMatch(items, "AM3-08", itemKeys)).toBe(false);
    expect(hasExactMatch(items, "AM3-08A30-", itemKeys)).toBe(false);
  });

  it("品項只比代碼：輸入品名不算完全相符", () => {
    expect(hasExactMatch(items, "空壓機 8HP", itemKeys)).toBe(false);
  });

  it("客戶／廠商另比名稱", () => {
    expect(hasExactMatch(customers, "ke108", partyKeys)).toBe(true);
    expect(hasExactMatch(customers, "伍虹企業", partyKeys)).toBe(true);
    expect(hasExactMatch(customers, " 兆泰電線 ", partyKeys)).toBe(true);
    expect(hasExactMatch(customers, "伍虹", partyKeys)).toBe(false);
  });

  it("空白查詢 → false（不因代碼為 null／空白的選項而誤判）", () => {
    expect(hasExactMatch(customers, "", partyKeys)).toBe(false);
    expect(hasExactMatch(customers, "   ", partyKeys)).toBe(false);
  });

  it("沒有選項 → false", () => {
    expect(hasExactMatch([], "KE108", partyKeys)).toBe(false);
  });
});

describe("shouldOfferCreate", () => {
  it("不允許新增 → false", () => {
    expect(shouldOfferCreate(false, items, "NEW-01", itemKeys)).toBe(false);
  });

  it("允許新增且沒有完全相符 → true", () => {
    expect(shouldOfferCreate(true, items, "NEW-01", itemKeys)).toBe(true);
    expect(shouldOfferCreate(true, items, "AM3-08", itemKeys)).toBe(true);
  });

  it("允許新增但已有完全相符的代碼 → false（A-6）", () => {
    expect(shouldOfferCreate(true, items, "AM3-08A30", itemKeys)).toBe(false);
    expect(shouldOfferCreate(true, items, " am3-08a30 ", itemKeys)).toBe(false);
  });

  it("客戶名稱完全相符 → false", () => {
    expect(shouldOfferCreate(true, customers, "兆泰電線", partyKeys)).toBe(
      false,
    );
  });

  it("查詢空白 → 仍提供「＋ 新增…」", () => {
    expect(shouldOfferCreate(true, items, "", itemKeys)).toBe(true);
  });

  it("與 comboboxEntries 組合：完全相符時清單只有選項、沒有新增項", () => {
    const entries = comboboxEntries(
      items,
      "AM3-08A30",
      shouldOfferCreate(true, items, "AM3-08A30", itemKeys),
    );
    expect(entries.map((e) => e.kind)).toEqual(["option", "option"]);
  });
});

describe("pickerInputEvent（A-1）", () => {
  const closed: PickerOpenState = { open: false, skipFocusOpen: false };

  it("一般聚焦（Tab／點進未聚焦的欄位）→ 展開", () => {
    expect(pickerInputEvent("focus", closed)).toEqual({
      openList: true,
      skipFocusOpen: false,
    });
  });

  it("Dialog 關閉、焦點還給輸入框的那次 focus → 不展開，並清掉旗標", () => {
    expect(
      pickerInputEvent("focus", { open: false, skipFocusOpen: true }),
    ).toEqual({ openList: false, skipFocusOpen: false });
  });

  it("焦點已在輸入框、清單未開時點擊 → 展開（A-1 主要修正）", () => {
    expect(pickerInputEvent("click", closed)).toEqual({
      openList: true,
      skipFocusOpen: false,
    });
  });

  it("清單已開時點擊 → 不重新初始化（不清掉正在輸入的查詢字）", () => {
    expect(
      pickerInputEvent("click", { open: true, skipFocusOpen: false }),
    ).toEqual({ openList: false, skipFocusOpen: false });
  });

  it("mousedown 只清旗標，不直接展開（交給後續的 focus／click）", () => {
    expect(
      pickerInputEvent("mousedown", { open: false, skipFocusOpen: true }),
    ).toEqual({ openList: false, skipFocusOpen: false });
  });

  // 依序模擬瀏覽器事件，state.open 跟著 openList 更新。
  function run(
    events: Parameters<typeof pickerInputEvent>[0][],
    start: PickerOpenState,
  ) {
    let state = start;
    const opened: boolean[] = [];
    for (const ev of events) {
      const r = pickerInputEvent(ev, state);
      opened.push(r.openList);
      state = {
        open: state.open || r.openList,
        skipFocusOpen: r.skipFocusOpen,
      };
    }
    return { state, opened };
  }

  // 選「＋ 新增」→ 清單關閉、skipFocusOpen = true → Dialog 開啟（焦點移入 Dialog）。
  const afterCreate: PickerOpenState = { open: false, skipFocusOpen: true };

  it("情境：Dialog 以 Esc／取消關閉 → 焦點回輸入框（不展開）→ 滑鼠點同一欄位（已聚焦，無 focus）→ 展開", () => {
    const { state, opened } = run(["focus", "mousedown", "click"], afterCreate);
    expect(opened).toEqual([false, false, true]);
    expect(state).toEqual({ open: true, skipFocusOpen: false });
  });

  it("情境：Dialog 關閉後焦點沒回到輸入框 → 點欄位（mousedown → focus → click）→ 展開一次", () => {
    const { state, opened } = run(["mousedown", "focus", "click"], afterCreate);
    expect(opened).toEqual([false, true, false]);
    expect(state).toEqual({ open: true, skipFocusOpen: false });
  });

  it("情境：Dialog 關閉、焦點回來後不點擊 → 清單維持關閉", () => {
    const { state, opened } = run(["focus"], afterCreate);
    expect(opened).toEqual([false]);
    expect(state.open).toBe(false);
  });
});
