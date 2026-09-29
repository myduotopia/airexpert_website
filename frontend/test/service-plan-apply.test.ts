// 開單自動帶入保養階段（spec §6.2）— 純函式：套用到表單狀態、清除、送出時的三個快照欄位。
import { describe, expect, it } from "vitest";
import {
  applyStageToState,
  clearPlanStage,
  emptyFormState,
  formStateFromReport,
  formStateToInput,
  planStageFromReport,
  planStageText,
  stageApplyNeedsConfirm,
  updatePart,
  type ReportFormState,
} from "@/components/service-report/form-state";
import type { MilestoneTarget } from "@/lib/service-report/plan/stage";
import type { ServicePlanStage } from "@/lib/service-report/plan/types";
import { defaultParts, type ServiceReport } from "@/lib/service-report/types";

const TODAY = "2026-09-15";
const STAGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** 4000 小時 基礎保養：兩列比得到預設品名、一列比不到（填空白列）。 */
function stage(patch: Partial<ServicePlanStage> = {}): ServicePlanStage {
  return {
    id: STAGE_ID,
    plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    hours: 4000,
    label: "基礎保養",
    parts: [
      { name: "螺旋專用油", qty: "20", unit: "L" },
      // 全形括號：正規化後與預設列「空氣濾清器(外)」相同
      { name: "空氣濾清器（外）", qty: "1", unit: "個" },
      { name: "高壓軟管", qty: "2", unit: "條" },
    ],
    ...patch,
  };
}

/**
 * 要套用的里程碑：第 4 輪的 4000 小時階段（一輪 6000）＝ 22000 小時。
 * 快照的 plan_stage_hours 存的是這個 22000，不是階段原時數 4000。
 */
const MILESTONE = 22000;

function target(patch: Partial<ServicePlanStage> = {}): MilestoneTarget {
  return { milestone: MILESTONE, stage: stage(patch) };
}

function stateWith(patch: Partial<ReportFormState>): ReportFormState {
  return { ...emptyFormState(TODAY), ...patch };
}

function qtyOf(state: ReportFormState, name: string): string | undefined {
  return state.parts.find((p) => p.name === name)?.qty;
}

describe("applyStageToState", () => {
  it("空表單：品名比對填數量、其餘填空白列、勾選定期保養、記錄階段", () => {
    const { state, overflow } = applyStageToState(
      emptyFormState(TODAY),
      target(),
    );
    expect(overflow).toEqual([]);
    expect(qtyOf(state, "螺旋專用油")).toBe("20L");
    // 全形括號的品名比對到既有列，不會另外新增一列
    expect(qtyOf(state, "空氣濾清器(外)")).toBe("1個");
    expect(state.parts.filter((p) => p.name === "高壓軟管")).toHaveLength(1);
    // 第 8 列是預設的空白列
    expect(state.parts[7]).toEqual({ no: 8, name: "高壓軟管", qty: "2條" });
    expect(state.parts).toHaveLength(10);
    expect(state.service_items).toEqual(["periodic"]);
    // hours 存里程碑（22000），不是階段原時數（4000）
    expect(state.plan_stage).toEqual({
      id: STAGE_ID,
      hours: MILESTONE,
      label: "基礎保養",
    });
    expect(state.plan_stage?.hours).not.toBe(stage().hours);
    expect(state.plan_stage_dirty).toBe(true);
  });

  it("已勾選的服務項目不重複、順序不變", () => {
    const { state } = applyStageToState(
      stateWith({ service_items: ["periodic", "repair"] }),
      target(),
    );
    expect(state.service_items).toEqual(["periodic", "repair"]);
  });

  it("未勾選時把定期保養加在最後，其他勾選不動", () => {
    const { state } = applyStageToState(
      stateWith({ service_items: ["routine"] }),
      target(),
    );
    expect(state.service_items).toEqual(["routine", "periodic"]);
  });

  it("overwrite=false（取消覆蓋）：只填空白，已填的數量保留", () => {
    const filled = stateWith({
      parts: updatePart(defaultParts(), 1, { qty: "18L" }),
    });
    const { state } = applyStageToState(filled, target(), { overwrite: false });
    expect(qtyOf(state, "螺旋專用油")).toBe("18L");
    expect(qtyOf(state, "空氣濾清器(外)")).toBe("1個");
    expect(qtyOf(state, "高壓軟管")).toBe("2條");
  });

  it("overwrite=true：同品名的數量改成方案的數量", () => {
    const filled = stateWith({
      parts: updatePart(defaultParts(), 1, { qty: "18L" }),
    });
    const { state } = applyStageToState(filled, target(), { overwrite: true });
    expect(qtyOf(state, "螺旋專用油")).toBe("20L");
  });

  it("預設為不覆蓋（等同取消）", () => {
    const filled = stateWith({
      parts: updatePart(defaultParts(), 1, { qty: "18L" }),
    });
    expect(qtyOf(applyStageToState(filled, target()).state, "螺旋專用油")).toBe(
      "18L",
    );
  });

  it("10 列放不下：多的回在 overflow，不動已填的列", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      name: `料件${i + 1}`,
      qty: "1",
      unit: "個",
    }));
    const { state, overflow } = applyStageToState(
      emptyFormState(TODAY),
      target({ parts }),
    );
    // 預設 10 列只有第 8、9 列是空白，其餘已有預設品名
    expect(overflow.map((p) => p.name)).toEqual([
      "料件3",
      "料件4",
      "料件5",
      "料件6",
      "料件7",
      "料件8",
      "料件9",
      "料件10",
      "料件11",
      "料件12",
    ]);
    expect(state.parts[7].name).toBe("料件1");
    expect(state.parts[8].name).toBe("料件2");
    expect(state.parts[0].name).toBe("螺旋專用油");
  });

  it("不動其他欄位（只碰料件、服務項目與階段）", () => {
    const base = stateWith({ summary: "更換濾芯", technician: "陳技師" });
    const { state } = applyStageToState(base, target());
    expect(state.summary).toBe("更換濾芯");
    expect(state.technician).toBe("陳技師");
    expect(state.report_date).toBe(TODAY);
  });
});

describe("stageApplyNeedsConfirm", () => {
  it("料件皆無數量 → 不必詢問；任一列有數量 → 需先確認覆蓋", () => {
    expect(stageApplyNeedsConfirm(emptyFormState(TODAY))).toBe(false);
    expect(
      stageApplyNeedsConfirm(
        stateWith({ parts: updatePart(defaultParts(), 3, { qty: "1" }) }),
      ),
    ).toBe(true);
  });
});

describe("送出時的 plan_stage_* 三個欄位", () => {
  it("套用後：三個欄位一起送，hours 存里程碑、label 存階段名稱原文", () => {
    const { state } = applyStageToState(emptyFormState(TODAY), target());
    const input = formStateToInput(state);
    expect(input.plan_stage_id).toBe(STAGE_ID);
    // 里程碑 22000，不是階段原時數 4000
    expect(input.plan_stage_hours).toBe(22000);
    expect(input.plan_stage_hours).not.toBe(4000);
    // 不是 milestoneLabel() 的「22000 小時 基礎保養」
    expect(input.plan_stage_label).toBe("基礎保養");
  });

  it("換一個里程碑（同階段）→ 只有 plan_stage_hours 不同", () => {
    const a = applyStageToState(emptyFormState(TODAY), target()).state;
    const b = applyStageToState(emptyFormState(TODAY), {
      milestone: 28000,
      stage: stage(),
    }).state;
    expect(a.plan_stage?.id).toBe(b.plan_stage?.id);
    expect(a.plan_stage?.hours).toBe(22000);
    expect(b.plan_stage?.hours).toBe(28000);
  });

  it("沒動過階段：三個欄位皆 undefined（不更動 DB 既有值）", () => {
    const report = makeReport({
      plan_stage_id: STAGE_ID,
      plan_stage_hours: 4000,
      plan_stage_label: "基礎保養",
    });
    const state = formStateFromReport(report);
    expect(state.plan_stage_dirty).toBe(false);

    const input = formStateToInput({ ...state, summary: "改一下" }, report.id);
    expect(input.plan_stage_id).toBeUndefined();
    expect(input.plan_stage_hours).toBeUndefined();
    expect(input.plan_stage_label).toBeUndefined();
    expect("plan_stage_id" in input).toBe(false);
  });

  it("新單沒套用階段：三個欄位也不送", () => {
    const input = formStateToInput(emptyFormState(TODAY));
    expect("plan_stage_id" in input).toBe(false);
  });

  it("清除：plan_stage_id 送 null（快照欄位由 action 一併清空）", () => {
    const state = clearPlanStage(
      formStateFromReport(
        makeReport({
          plan_stage_id: STAGE_ID,
          plan_stage_hours: 4000,
          plan_stage_label: "基礎保養",
        }),
      ),
    );
    expect(state.plan_stage).toBeNull();
    const input = formStateToInput(state, "id-not-used");
    expect(input.plan_stage_id).toBeNull();
    expect(input.plan_stage_hours).toBeNull();
    expect(input.plan_stage_label).toBeNull();
  });

  it("套用後再清除，料件與勾選不會被還原", () => {
    const { state } = applyStageToState(emptyFormState(TODAY), target());
    const cleared = clearPlanStage(state);
    expect(qtyOf(cleared, "螺旋專用油")).toBe("20L");
    expect(cleared.service_items).toEqual(["periodic"]);
  });
});

describe("planStageFromReport / planStageText", () => {
  it("沒有階段 → null", () => {
    expect(planStageFromReport(makeReport())).toBeNull();
    expect(planStageText(null)).toBeNull();
  });

  it("有階段 → 「22000 小時 基礎保養」（時數是里程碑）", () => {
    const snapshot = planStageFromReport(
      makeReport({
        plan_stage_id: STAGE_ID,
        plan_stage_hours: 22000,
        plan_stage_label: "基礎保養",
      }),
    );
    expect(planStageText(snapshot)).toBe("22000 小時 基礎保養");
  });

  it("階段被刪除（id 轉 null）仍以快照顯示", () => {
    const snapshot = planStageFromReport(
      makeReport({
        plan_stage_id: null,
        plan_stage_hours: 8000,
        plan_stage_label: "大保養",
      }),
    );
    expect(snapshot).toEqual({ id: null, hours: 8000, label: "大保養" });
    expect(planStageText(snapshot)).toBe("8000 小時 大保養");
  });

  it("只有時數沒有名稱 → 只顯示時數", () => {
    expect(planStageText({ id: STAGE_ID, hours: 4000, label: "" })).toBe(
      "4000 小時",
    );
  });
});

function makeReport(patch: Partial<ServiceReport> = {}): ServiceReport {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    report_no: "X11509009",
    report_date: TODAY,
    time_slot: "afternoon",
    status: "draft",
    customer_id: null,
    machine_id: null,
    header_code: "KK855-2",
    customer_name: "鼎佑電子",
    phone: null,
    tax_id: null,
    contact: null,
    address: null,
    equipment: null,
    model: null,
    voltage: null,
    serial_no: null,
    machine_state: null,
    service_items: [],
    summary: null,
    results: {},
    parts: defaultParts(),
    suggestions: [],
    technician: null,
    customer_signer: null,
    note: null,
    print_count: 0,
    first_printed_at: null,
    last_printed_at: null,
    completed_at: null,
    voided_at: null,
    void_reason: null,
    plan_stage_id: null,
    plan_stage_hours: null,
    plan_stage_label: null,
    created_by: null,
    created_at: "2026-09-15T01:00:00Z",
    updated_at: "2026-09-15T01:00:00Z",
    ...patch,
  };
}
