import { describe, it, expect } from "vitest";

// 方案 / 階段驗證與正規化、錯誤訊息（spec §7 / §8），
// 以及報告單新增的 plan_stage_* 欄位（spec §4 / §6.2）。

import {
  SP_CHECK_VIOLATION_MESSAGE,
  SP_DUPLICATE_MESSAGE,
  SP_DUPLICATE_NAME_MESSAGE,
  SP_DUPLICATE_STAGE_HOURS_MESSAGE,
  SP_FK_MISSING_MESSAGE,
  planErrorMessage,
} from "@/lib/service-report/plan/errors";
import {
  normalizePlanInput,
  normalizeStageInput,
  toStageHours,
  validatePlanInput,
  validateStageInput,
} from "@/lib/service-report/plan/validate";
import {
  normalizeReportInput,
  validateReportInput,
} from "@/lib/service-report/validate";
import {
  emptySheetData,
  type ServiceReportInput,
} from "@/lib/service-report/types";

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const STAGE_ID = "22222222-2222-4333-8444-555555555555";

describe("validatePlanInput / normalizePlanInput", () => {
  it("名稱必填、長度上限、格式", () => {
    expect(validatePlanInput(null)).toBe("資料格式不正確");
    expect(validatePlanInput({ name: "  ", hp_tags: [] })).toBe(
      "請輸入方案名稱",
    );
    expect(validatePlanInput({ name: "x".repeat(51), hp_tags: [] })).toBe(
      "方案名稱不可超過 50 字",
    );
    expect(validatePlanInput({ id: "nope", name: "A", hp_tags: [] })).toBe(
      "找不到保養方案",
    );
  });

  it("馬力標籤與備註", () => {
    expect(validatePlanInput({ name: "A", hp_tags: "20HP" })).toBe(
      "適用馬力格式不正確",
    );
    expect(validatePlanInput({ name: "A", hp_tags: [1] })).toBe(
      "適用馬力格式不正確",
    );
    expect(validatePlanInput({ name: "A", hp_tags: ["x".repeat(21)] })).toBe(
      "適用馬力每個不可超過 20 字",
    );
    expect(
      validatePlanInput({ name: "A", hp_tags: [], note: "n".repeat(501) }),
    ).toBe("備註不可超過 500 字");
    expect(validatePlanInput({ name: "A", hp_tags: ["20HP"] })).toBeNull();
  });

  it("正規化：去空白、馬力去重（正規化後相同者留第一個）、備註空 → null", () => {
    expect(
      normalizePlanInput({
        name: "  20HP 空壓機 ",
        hp_tags: [" 20HP ", "20 hp", "020", "", "30"],
        active: true,
        note: "   ",
      }),
    ).toEqual({
      name: "20HP 空壓機",
      hp_tags: ["20HP", "30"],
      active: true,
      note: null,
    });
  });
});

describe("validateStageInput / normalizeStageInput", () => {
  const ok = {
    plan_id: PLAN_ID,
    hours: 4000,
    label: "基礎保養",
    parts: [{ name: "螺旋專用油", qty: "1", unit: "桶" }],
  };

  it("通過", () => {
    expect(validateStageInput(ok)).toBeNull();
    expect(validateStageInput({ ...ok, id: STAGE_ID })).toBeNull();
  });

  it("方案、時數、名稱", () => {
    expect(validateStageInput({ ...ok, plan_id: "x" })).toBe("找不到保養方案");
    expect(validateStageInput({ ...ok, id: "x" })).toBe("找不到保養階段");
    for (const hours of [0, -1, 1.5, "abc", 1000001, ""]) {
      expect(validateStageInput({ ...ok, hours })).toBe(
        "時數需為 1–1000000 的整數",
      );
    }
    expect(validateStageInput({ ...ok, label: " " })).toBe("請輸入階段名稱");
    expect(validateStageInput({ ...ok, label: "x".repeat(51) })).toBe(
      "階段名稱不可超過 50 字",
    );
  });

  it("料件", () => {
    expect(validateStageInput({ ...ok, parts: {} })).toBe("料件格式不正確");
    expect(
      validateStageInput({
        ...ok,
        parts: Array.from({ length: 21 }, () => ({ name: "油", qty: "1" })),
      }),
    ).toBe("料件最多 20 列");
    expect(validateStageInput({ ...ok, parts: [{ name: "", qty: "1" }] })).toBe(
      "料件第 1 列請填品名",
    );
    expect(
      validateStageInput({ ...ok, parts: [{ name: "x".repeat(51), qty: "" }] }),
    ).toBe("料件第 1 列品名不可超過 50 字");
    expect(
      validateStageInput({
        ...ok,
        parts: [{ name: "油", qty: "1".repeat(19), unit: "桶桶" }],
      }),
    ).toBe("料件第 1 列數量加單位不可超過 20 字");
    // 整列皆空＝未填，允許（正規化時丟掉）
    expect(
      validateStageInput({ ...ok, parts: [{ name: "", qty: "", unit: "" }] }),
    ).toBeNull();
  });

  it("正規化：時數字串、丟空列、空單位不寫入", () => {
    expect(
      normalizeStageInput({
        plan_id: PLAN_ID,
        hours: " 4,000 ",
        label: " 基礎保養 ",
        parts: [
          { name: " 螺旋專用油 ", qty: " 1 ", unit: " 桶 " },
          { name: "", qty: "", unit: "" },
          { name: "機油濾清器", qty: "1", unit: "" },
        ],
      }),
    ).toEqual({
      plan_id: PLAN_ID,
      hours: 4000,
      label: "基礎保養",
      parts: [
        { name: "螺旋專用油", qty: "1", unit: "桶" },
        { name: "機油濾清器", qty: "1" },
      ],
    });
    expect(toStageHours("2000")).toBe(2000);
    expect(toStageHours("2000.5")).toBeNull();
  });
});

describe("planErrorMessage", () => {
  it("23505 依 unique index 分辨", () => {
    expect(
      planErrorMessage({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sr_service_plans_name_key"',
      }),
    ).toBe(SP_DUPLICATE_NAME_MESSAGE);
    expect(
      planErrorMessage({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sr_service_plan_stages_plan_hours_key"',
      }),
    ).toBe(SP_DUPLICATE_STAGE_HOURS_MESSAGE);
    expect(planErrorMessage({ code: "23505", message: "dup" })).toBe(
      SP_DUPLICATE_MESSAGE,
    );
  });

  it("23505 只比對 constraint 名稱，不看含使用者資料的 details", () => {
    // 方案名稱剛好叫「Stages 20HP」：details 帶了使用者輸入也不能影響判定
    expect(
      planErrorMessage({
        code: "23505",
        constraint: "sr_service_plans_name_key",
        message:
          'duplicate key value violates unique constraint "sr_service_plans_name_key"',
        details: "Key (name)=(Stages 20HP) already exists.",
      }),
    ).toBe(SP_DUPLICATE_NAME_MESSAGE);
    // 認不出 constraint 時用通用訊息，不因 details 猜錯
    expect(
      planErrorMessage({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        details: "Key (name)=(Stages plan_hours) already exists.",
      }),
    ).toBe(SP_DUPLICATE_MESSAGE);
  });

  it("23503 / 23514 用方案語境的中文訊息", () => {
    expect(
      planErrorMessage({
        code: "23503",
        message: 'violates foreign key constraint "sr_reports_plan_stage_fk"',
      }),
    ).toBe(SP_FK_MISSING_MESSAGE);
    expect(
      planErrorMessage({
        code: "23514",
        message: 'new row violates check constraint "sr_service_plans_name_ck"',
      }),
    ).toBe(SP_CHECK_VIOLATION_MESSAGE);
  });

  it("其他錯誤沿用報告單模組的訊息", () => {
    expect(planErrorMessage({ code: "42501", message: "denied" })).toBe(
      "沒有機台維護報告單權限",
    );
    expect(
      planErrorMessage({ code: "P0001", message: "x", details: "自訂訊息" }),
    ).toBe("自訂訊息");
    expect(planErrorMessage(null)).toBe("操作失敗");
  });
});

describe("報告單的 plan_stage_* 欄位", () => {
  function input(over: Partial<ServiceReportInput> = {}): ServiceReportInput {
    return {
      ...emptySheetData(),
      report_no: "X11509009",
      report_date: "2026-09-15",
      customer_id: null,
      machine_id: null,
      note: null,
      ...over,
    };
  }

  it("驗證：階段 id / 時數 / 名稱", () => {
    expect(validateReportInput(input({ plan_stage_id: "x" }))).toBe(
      "保養階段選擇不正確",
    );
    expect(validateReportInput(input({ plan_stage_hours: 0 }))).toBe(
      "保養階段時數不正確",
    );
    expect(
      validateReportInput(input({ plan_stage_hours: 1.5 as number })),
    ).toBe("保養階段時數不正確");
    expect(
      validateReportInput(input({ plan_stage_label: "x".repeat(51) })),
    ).toBe("保養階段名稱不可超過 50 字");
    expect(
      validateReportInput(
        input({
          plan_stage_id: STAGE_ID,
          plan_stage_hours: 4000,
          plan_stage_label: "基礎保養",
        }),
      ),
    ).toBeNull();
  });

  it("正規化：未帶＝不寫入（不更動既有值）", () => {
    const out = normalizeReportInput(input());
    expect("plan_stage_id" in out).toBe(false);
    expect("plan_stage_hours" in out).toBe(false);
    expect("plan_stage_label" in out).toBe(false);
  });

  it("正規化：帶 id 與快照 → 一併寫入", () => {
    const out = normalizeReportInput(
      input({
        plan_stage_id: STAGE_ID,
        plan_stage_hours: 4000,
        plan_stage_label: "  基礎保養 ",
      }),
    );
    expect(out.plan_stage_id).toBe(STAGE_ID);
    expect(out.plan_stage_hours).toBe(4000);
    expect(out.plan_stage_label).toBe("基礎保養");
  });

  it("正規化：只帶 id（沒有快照）→ 快照寫 null，不留上一階段的值", () => {
    const out = normalizeReportInput(input({ plan_stage_id: STAGE_ID }));
    expect(out.plan_stage_id).toBe(STAGE_ID);
    expect(out.plan_stage_hours).toBeNull();
    expect(out.plan_stage_label).toBeNull();
  });

  it("正規化：值是 undefined（React Flight 會保留 key）＝不更動，不當成清除", () => {
    const out = normalizeReportInput(
      input({
        plan_stage_id: undefined,
        plan_stage_hours: undefined,
        plan_stage_label: undefined,
      }),
    );
    expect("plan_stage_id" in out).toBe(false);
    expect("plan_stage_hours" in out).toBe(false);
    expect("plan_stage_label" in out).toBe(false);
  });

  it("正規化：id 傳空字串＝清除", () => {
    const out = normalizeReportInput(
      input({
        plan_stage_id: "",
        plan_stage_hours: 4000,
        plan_stage_label: "基礎保養",
      }),
    );
    expect(out.plan_stage_id).toBeNull();
    expect(out.plan_stage_hours).toBeNull();
    expect(out.plan_stage_label).toBeNull();
  });

  it("正規化：id 傳 null＝清除，快照一併清空", () => {
    const out = normalizeReportInput(
      input({
        plan_stage_id: null,
        plan_stage_hours: 4000,
        plan_stage_label: "基礎保養",
      }),
    );
    expect(out.plan_stage_id).toBeNull();
    expect(out.plan_stage_hours).toBeNull();
    expect(out.plan_stage_label).toBeNull();
  });
});
