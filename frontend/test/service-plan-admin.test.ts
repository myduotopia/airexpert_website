import { describe, it, expect } from "vitest";

// 方案管理頁的表單狀態純函式（issue #201 / spec §6）：
// 馬力多值輸入解析、料件列增刪、階段排序與「草稿 → action 輸入」的轉換。

import {
  addPartRow,
  addStage,
  deletedStageIds,
  duplicateStageHoursError,
  formatHpTags,
  isBlankStage,
  makePartDraft,
  makePlanDraft,
  makeStageDraft,
  makeStageDrafts,
  mapStage,
  markStageSaved,
  nextDraftKey,
  parseHpTags,
  planConflictText,
  planDeleteConfirmText,
  planDraftToInput,
  removePartRow,
  removeStage,
  sortStageDrafts,
  stageDraftToInput,
  stageErrorText,
  updatePartRow,
  updateStage,
  type StageDraft,
} from "@/app/admin/(protected)/service-reports/plans/_components/plan-form-state";
import { SP_DUPLICATE_STAGE_HOURS_MESSAGE } from "@/lib/service-report/plan/errors";
import type { ServicePlanStage } from "@/lib/service-report/plan/types";
import {
  validatePlanInput,
  validateStageInput,
} from "@/lib/service-report/plan/validate";

const PLAN_ID = "11111111-2222-4333-8444-555555555555";

function stage(
  id: string,
  hours: number,
  label = "基礎保養",
  parts: ServicePlanStage["parts"] = [],
): ServicePlanStage {
  return { id, plan_id: PLAN_ID, hours, label, parts };
}

function draft(hours: string, opts: Partial<StageDraft> = {}): StageDraft {
  return {
    key: nextDraftKey("t"),
    id: null,
    hours,
    label: "基礎保養",
    parts: [makePartDraft()],
    ...opts,
  };
}

describe("parseHpTags / formatHpTags", () => {
  it("以頓號、逗號、分號、斜線與換行分隔，去空白與空項", () => {
    expect(parseHpTags("20HP、30HP")).toEqual(["20HP", "30HP"]);
    expect(parseHpTags(" 20HP , 30HP ; 40HP / 50HP\n60HP ")).toEqual([
      "20HP",
      "30HP",
      "40HP",
      "50HP",
      "60HP",
    ]);
    expect(parseHpTags("，、 ,")).toEqual([]);
    expect(parseHpTags("")).toEqual([]);
    expect(parseHpTags(null)).toEqual([]);
  });

  it("空白不是分隔符（「20 馬力」是一個標籤，不會被切成「20」「馬力」）", () => {
    expect(parseHpTags("20 馬力")).toEqual(["20 馬力"]);
    expect(parseHpTags("20 HP、30 HP")).toEqual(["20 HP", "30 HP"]);
  });

  it("正規化後相同者去重，保留先出現的原文", () => {
    expect(parseHpTags("20HP、20 hp、020hp、20馬力、20")).toEqual(["20HP"]);
    expect(parseHpTags("20、20HP、30HP")).toEqual(["20", "30HP"]);
  });

  it("無法正規化的字樣仍保留（交給驗證與使用者判斷）", () => {
    expect(parseHpTags("HP、HP")).toEqual(["HP", "HP"]);
  });

  it("formatHpTags 以頓號組回輸入框文字，與 parseHpTags 互為往返", () => {
    expect(formatHpTags(["20HP", "30HP"])).toBe("20HP、30HP");
    expect(formatHpTags([])).toBe("");
    expect(formatHpTags(null)).toBe("");
    expect(parseHpTags(formatHpTags(["20HP", "30HP"]))).toEqual([
      "20HP",
      "30HP",
    ]);
  });
});

describe("草稿建構", () => {
  it("nextDraftKey 不重複", () => {
    const keys = new Set([nextDraftKey(), nextDraftKey(), nextDraftKey("x")]);
    expect(keys.size).toBe(3);
  });

  it("makePlanDraft：新增時預設啟用、欄位空白；編輯時帶入既有值", () => {
    expect(makePlanDraft()).toEqual({
      name: "",
      hpTagsText: "",
      active: true,
      note: "",
    });
    expect(
      makePlanDraft({
        id: PLAN_ID,
        name: "20HP 空壓機",
        hp_tags: ["20HP", "30HP"],
        active: false,
        note: "舊機專用",
        created_by: null,
        created_at: "",
        updated_at: "",
      }),
    ).toEqual({
      name: "20HP 空壓機",
      hpTagsText: "20HP、30HP",
      active: false,
      note: "舊機專用",
    });
  });

  it("makeStageDraft：沒有料件時仍留一列空白", () => {
    const d = makeStageDraft();
    expect(d.id).toBeNull();
    expect(d.hours).toBe("");
    expect(d.parts).toHaveLength(1);

    const existing = makeStageDraft(
      stage("s1", 2000, "基礎保養", [
        { name: "螺旋專用油", qty: "1", unit: "桶" },
      ]),
    );
    expect(existing.id).toBe("s1");
    expect(existing.hours).toBe("2000");
    expect(existing.parts).toHaveLength(1);
    expect(existing.parts[0]).toMatchObject({
      name: "螺旋專用油",
      qty: "1",
      unit: "桶",
    });
    // 沒有 unit 的料件補空字串（受控輸入不可為 undefined）。
    expect(
      makeStageDraft(
        stage("s2", 4000, "年度保養", [{ name: "油濾", qty: "1" }]),
      ).parts[0].unit,
    ).toBe("");
  });

  it("makeStageDrafts 逐筆轉換，key 皆不同", () => {
    const drafts = makeStageDrafts([stage("a", 2000), stage("b", 4000)]);
    expect(drafts.map((d) => d.id)).toEqual(["a", "b"]);
    expect(new Set(drafts.map((d) => d.key)).size).toBe(2);
    expect(makeStageDrafts(null)).toEqual([]);
  });
});

describe("料件列增刪改", () => {
  it("新增料件列不動到原物件", () => {
    const before = makeStageDraft();
    const after = addPartRow(before);
    expect(before.parts).toHaveLength(1);
    expect(after.parts).toHaveLength(2);
  });

  it("刪除料件列；刪到一列不剩時補一列空白", () => {
    let s = addPartRow(makeStageDraft());
    s = updatePartRow(s, s.parts[0].key, { name: "螺旋專用油" });
    const removed = removePartRow(s, s.parts[0].key);
    expect(removed.parts).toHaveLength(1);
    expect(removed.parts[0].name).toBe("");

    const emptied = removePartRow(removed, removed.parts[0].key);
    expect(emptied.parts).toHaveLength(1);
    expect(emptied.parts[0].name).toBe("");
  });

  it("updatePartRow 只改指定的那一列", () => {
    const s = addPartRow(makeStageDraft());
    const next = updatePartRow(s, s.parts[1].key, { qty: "2", unit: "個" });
    expect(next.parts[0]).toEqual(s.parts[0]);
    expect(next.parts[1]).toMatchObject({ qty: "2", unit: "個" });
  });

  it("mapStage 只改指定階段", () => {
    const stages = [draft("2000"), draft("4000")];
    const next = mapStage(stages, stages[1].key, (s) => addPartRow(s));
    expect(next[0].parts).toHaveLength(1);
    expect(next[1].parts).toHaveLength(2);
  });
});

describe("階段增刪與排序", () => {
  it("addStage / removeStage / updateStage", () => {
    const one = addStage([]);
    expect(one).toHaveLength(1);
    const two = addStage(one);
    expect(two).toHaveLength(2);
    expect(removeStage(two, two[0].key)).toHaveLength(1);
    expect(updateStage(two, two[0].key, { hours: "2000" })[0].hours).toBe(
      "2000",
    );
    expect(updateStage(two, two[0].key, { hours: "2000" })[1].hours).toBe("");
  });

  it("依時數由小到大排序；空白／不合法時數排最後並保留原順序", () => {
    const a = draft("6000");
    const b = draft("");
    const c = draft("2000");
    const d = draft("abc");
    const e = draft("4000");
    expect(sortStageDrafts([a, b, c, d, e]).map((s) => s.hours)).toEqual([
      "2000",
      "4000",
      "6000",
      "",
      "abc",
    ]);
  });

  it("時數相同時維持原本相對順序（穩定）", () => {
    const a = draft("2000", { label: "先" });
    const b = draft("2000", { label: "後" });
    expect(sortStageDrafts([a, b]).map((s) => s.label)).toEqual(["先", "後"]);
  });
});

describe("儲存轉換", () => {
  it("planDraftToInput：去空白、備註空字串轉 null、解析馬力", () => {
    expect(
      planDraftToInput(
        {
          name: "  20HP 空壓機 ",
          hpTagsText: "20HP、30HP",
          active: false,
          note: "  ",
        },
        null,
      ),
    ).toEqual({
      id: null,
      name: "20HP 空壓機",
      hp_tags: ["20HP", "30HP"],
      active: false,
      note: null,
    });
    expect(planDraftToInput(makePlanDraft(), PLAN_ID).id).toBe(PLAN_ID);
  });

  it("planDraftToInput 的結果通過 validatePlanInput", () => {
    expect(
      validatePlanInput(
        planDraftToInput(
          { name: "20HP 空壓機", hpTagsText: "20HP", active: true, note: "" },
          null,
        ),
      ),
    ).toBeNull();
  });

  it("stageDraftToInput：去空白，料件列原樣帶上（空列由 normalizeStageInput 丟掉）", () => {
    const s: StageDraft = {
      key: "k",
      id: null,
      hours: " 2000 ",
      label: " 基礎保養 ",
      parts: [
        { key: "p1", name: " 螺旋專用油 ", qty: " 1 ", unit: " 桶 " },
        { key: "p2", name: "", qty: "", unit: "" },
      ],
    };
    const input = stageDraftToInput(s, PLAN_ID);
    expect(input).toEqual({
      id: null,
      plan_id: PLAN_ID,
      hours: "2000",
      label: "基礎保養",
      parts: [
        { name: "螺旋專用油", qty: "1", unit: "桶" },
        { name: "", qty: "", unit: "" },
      ],
    });
    expect(validateStageInput(input)).toBeNull();
  });

  it("既有階段帶上 id（更新而非新增）", () => {
    const s = makeStageDraft(stage("s1", 2000));
    expect(stageDraftToInput(s, PLAN_ID).id).toBe("s1");
  });

  it("deletedStageIds：畫面上被移除的既有階段才需要刪除", () => {
    const kept = makeStageDraft(stage("a", 2000));
    const added = draft("6000");
    expect(deletedStageIds(["a", "b"], [kept, added])).toEqual(["b"]);
    expect(deletedStageIds([], [added])).toEqual([]);
    expect(deletedStageIds(["a"], [])).toEqual(["a"]);
  });

  it("markStageSaved 回填 id，重試不會重複新增", () => {
    const stages = [draft("2000"), draft("4000")];
    const next = markStageSaved(stages, stages[0].key, "new-id");
    expect(next[0].id).toBe("new-id");
    expect(next[1].id).toBeNull();
    expect(stageDraftToInput(next[0], PLAN_ID).id).toBe("new-id");
  });

  it("isBlankStage：只有全新且完全沒填的階段算空", () => {
    expect(isBlankStage(makeStageDraft())).toBe(true);
    expect(isBlankStage({ ...makeStageDraft(), hours: "2000" })).toBe(false);
    expect(isBlankStage({ ...makeStageDraft(), label: "基礎保養" })).toBe(
      false,
    );
    // 只是多按了幾次「新增料件」，全是空列 → 仍算空。
    expect(isBlankStage(addPartRow(addPartRow(makeStageDraft())))).toBe(true);
    const filled = makeStageDraft();
    expect(
      isBlankStage(updatePartRow(filled, filled.parts[0].key, { name: "油" })),
    ).toBe(false);
    // 既有階段（有 id）就算清空也不算空，要走刪除流程。
    expect(isBlankStage(makeStageDraft(stage("s1", 2000, "", [])))).toBe(false);
  });
});

describe("前置檢查與文案", () => {
  it("時數重複回中文錯誤；不合法時數不參與比對", () => {
    expect(duplicateStageHoursError([draft("2000"), draft("4000")])).toBeNull();
    expect(duplicateStageHoursError([draft("2000"), draft("2000")])).toBe(
      SP_DUPLICATE_STAGE_HOURS_MESSAGE,
    );
    expect(duplicateStageHoursError([draft(""), draft("")])).toBeNull();
    // 「2000」與「 2,000 」在 toStageHours 之後同值。
    expect(duplicateStageHoursError([draft("2000"), draft(" 2,000 ")])).toBe(
      SP_DUPLICATE_STAGE_HOURS_MESSAGE,
    );
  });

  it("stageErrorText 標明是哪一個階段", () => {
    expect(stageErrorText(draft("4000"), 1, "同一方案的階段時數不可重複")).toBe(
      "階段 2（4000 小時）：同一方案的階段時數不可重複",
    );
    expect(stageErrorText(draft(""), 0, "請輸入階段名稱")).toBe(
      "階段 1：請輸入階段名稱",
    );
  });

  it("刪除方案的確認文字含套用機台數", () => {
    expect(
      planDeleteConfirmText({ name: "20HP 空壓機", machine_count: 3 }),
    ).toContain("刪除後 3 台機台將失去方案對應");
    expect(
      planDeleteConfirmText({ name: "20HP 空壓機", machine_count: 3 }),
    ).toContain("「20HP 空壓機」");
    expect(
      planDeleteConfirmText({ name: "新方案", machine_count: 0 }),
    ).not.toContain("將失去方案對應");
  });

  it("多方案符合馬力時顯示衝突提示", () => {
    expect(planConflictText([])).toBeNull();
    expect(planConflictText(["A"])).toBeNull();
    expect(planConflictText(null)).toBeNull();
    const text = planConflictText(["20HP 空壓機", "20 匹舊機"]);
    expect(text).toContain("馬力同時符合 2 個方案");
    expect(text).toContain("20HP 空壓機、20 匹舊機");
    expect(text).toContain("「20HP 空壓機」");
  });
});
