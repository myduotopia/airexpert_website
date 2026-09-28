import { describe, it, expect, vi, beforeEach } from "vitest";

// 保養方案 server actions（mock supabase，同 service-report-actions.test.ts 模式）：
//   1. 未授權 → 全部拒絕且不碰 DB；
//   2. 驗證失敗不碰 DB；
//   3. 23505 依 unique index 給「方案名稱已存在」/「同一方案的階段時數不可重複」；
//   4. 逐台指定的寫入（upsert）與清除（delete）；
//   5. revalidate 到方案頁、機台對應頁與報告單列表（提醒區塊）。

type Kind = "select" | "insert" | "update" | "delete" | "upsert";
interface Recorded {
  table: string;
  kind: Kind;
  payload: unknown;
  filters: { fn: string; args: unknown[] }[];
}
type Res = {
  data: unknown;
  error: { code?: string; message: string; details?: string } | null;
};

let recorded: Recorded[] = [];
let responses: Record<string, (q: Query) => Res> = {};
let moduleGranted = true;
const revalidateSpy = vi.fn();

class Query implements PromiseLike<Res> {
  kind: Kind = "select";
  payload: unknown = null;
  filters: { fn: string; args: unknown[] }[] = [];
  constructor(public table: string) {}
  select(): this {
    return this;
  }
  insert(payload: unknown): this {
    this.kind = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: unknown, opts?: unknown): this {
    this.kind = "upsert";
    this.payload = payload;
    this.filters.push({ fn: "opts", args: [opts] });
    return this;
  }
  update(payload: unknown): this {
    this.kind = "update";
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.kind = "delete";
    return this;
  }
  eq(...a: unknown[]): this {
    this.filters.push({ fn: "eq", args: a });
    return this;
  }
  single(): this {
    return this;
  }
  private run(): Res {
    recorded.push({
      table: this.table,
      kind: this.kind,
      payload: this.payload,
      filters: this.filters,
    });
    return (
      responses[`${this.table}:${this.kind}`]?.(this) ?? {
        data: null,
        error: null,
      }
    );
  }
  then<A = Res, B = never>(
    ok?: ((v: Res) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const fakeSupabase = { from: (table: string) => new Query(table) };

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidateSpy(...args),
}));
vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(
    async (m: string) => moduleGranted && m === "service_report",
  ),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => fakeSupabase),
}));

import {
  deletePlanAction,
  deleteStageAction,
  savePlanAction,
  saveStageAction,
  setMachinePlanAction,
} from "@/app/admin/(protected)/service-reports/plans/actions";

const PLAN_ID = "11111111-2222-4333-8444-555555555555";
const STAGE_ID = "22222222-2222-4333-8444-555555555555";
const MACHINE_ID = "33333333-2222-4333-8444-555555555555";

const plan = { name: "20HP 空壓機", hp_tags: ["20HP"], active: true };
const stage = {
  plan_id: PLAN_ID,
  hours: 4000,
  label: "基礎保養",
  parts: [{ name: "螺旋專用油", qty: "1", unit: "桶" }],
};

beforeEach(() => {
  recorded = [];
  responses = {};
  moduleGranted = true;
  revalidateSpy.mockClear();
});

describe("未授權", () => {
  it("所有 action 皆拒絕且不碰 DB", async () => {
    moduleGranted = false;
    const results = await Promise.all([
      savePlanAction(plan),
      deletePlanAction(PLAN_ID),
      saveStageAction(stage),
      deleteStageAction(STAGE_ID),
      setMachinePlanAction(MACHINE_ID, PLAN_ID),
    ]);
    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "沒有機台維護報告單權限" });
    }
    expect(recorded).toEqual([]);
    expect(revalidateSpy).not.toHaveBeenCalled();
  });
});

describe("savePlanAction", () => {
  it("新增：正規化後寫入並 revalidate 方案 / 機台對應 / 列表頁", async () => {
    responses["sr_service_plans:insert"] = () => ({
      data: { id: PLAN_ID },
      error: null,
    });
    const r = await savePlanAction({
      name: "  20HP 空壓機 ",
      hp_tags: [" 20HP ", "20 hp"],
      active: true,
      note: "  ",
    });
    expect(r).toEqual({ ok: true, data: { id: PLAN_ID } });
    expect(recorded[0].payload).toEqual({
      name: "20HP 空壓機",
      hp_tags: ["20HP"],
      active: true,
      note: null,
    });
    for (const p of [
      "/admin/service-reports/plans",
      `/admin/service-reports/plans/${PLAN_ID}`,
      "/admin/service-reports/plans/machines",
      "/admin/service-reports",
    ]) {
      expect(revalidateSpy).toHaveBeenCalledWith(p);
    }
  });

  it("驗證失敗不碰 DB", async () => {
    expect(await savePlanAction({ ...plan, name: " " })).toEqual({
      ok: false,
      error: "請輸入方案名稱",
    });
    expect(recorded).toEqual([]);
  });

  it("名稱重複 → 方案名稱已存在", async () => {
    responses["sr_service_plans:insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sr_service_plans_name_key"',
      },
    });
    expect(await savePlanAction(plan)).toEqual({
      ok: false,
      error: "方案名稱已存在",
    });
  });

  it("編輯：帶 updated_at、以 id 條件更新；0 列 → 找不到保養方案", async () => {
    responses["sr_service_plans:update"] = () => ({
      data: [{ id: PLAN_ID }],
      error: null,
    });
    expect(await savePlanAction({ ...plan, id: PLAN_ID })).toEqual({
      ok: true,
      data: { id: PLAN_ID },
    });
    const u = recorded[0];
    expect(u.kind).toBe("update");
    expect(u.filters[0]).toEqual({ fn: "eq", args: ["id", PLAN_ID] });
    expect(u.payload).toMatchObject({ name: "20HP 空壓機" });
    expect(typeof (u.payload as { updated_at: string }).updated_at).toBe(
      "string",
    );

    responses["sr_service_plans:update"] = () => ({ data: [], error: null });
    expect(await savePlanAction({ ...plan, id: PLAN_ID })).toEqual({
      ok: false,
      error: "找不到保養方案",
    });
  });
});

describe("deletePlanAction", () => {
  it("刪除成功 / 0 列 / id 不合法", async () => {
    responses["sr_service_plans:delete"] = () => ({
      data: [{ id: PLAN_ID }],
      error: null,
    });
    expect(await deletePlanAction(PLAN_ID)).toEqual({
      ok: true,
      data: { id: PLAN_ID },
    });
    responses["sr_service_plans:delete"] = () => ({ data: [], error: null });
    expect(await deletePlanAction(PLAN_ID)).toEqual({
      ok: false,
      error: "找不到保養方案",
    });
    recorded = [];
    expect(await deletePlanAction("x")).toEqual({
      ok: false,
      error: "找不到保養方案",
    });
    expect(recorded).toEqual([]);
  });
});

describe("saveStageAction / deleteStageAction", () => {
  it("新增：料件正規化後寫入", async () => {
    responses["sr_service_plan_stages:insert"] = () => ({
      data: { id: STAGE_ID },
      error: null,
    });
    const r = await saveStageAction({
      ...stage,
      hours: "4,000",
      parts: [
        { name: " 螺旋專用油 ", qty: "1", unit: "桶" },
        { name: "", qty: "", unit: "" },
      ],
    });
    expect(r).toEqual({ ok: true, data: { id: STAGE_ID } });
    expect(recorded[0].payload).toEqual({
      plan_id: PLAN_ID,
      hours: 4000,
      label: "基礎保養",
      parts: [{ name: "螺旋專用油", qty: "1", unit: "桶" }],
    });
  });

  it("同一方案時數重複 → 同一方案的階段時數不可重複", async () => {
    responses["sr_service_plan_stages:insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sr_service_plan_stages_plan_hours_key"',
      },
    });
    expect(await saveStageAction(stage)).toEqual({
      ok: false,
      error: "同一方案的階段時數不可重複",
    });
  });

  it("驗證失敗不碰 DB", async () => {
    expect(await saveStageAction({ ...stage, hours: 0 })).toEqual({
      ok: false,
      error: "時數需為 1–1000000 的整數",
    });
    expect(recorded).toEqual([]);
  });

  it("刪除階段：回傳的 plan_id 用於 revalidate；0 列 → 找不到保養階段", async () => {
    responses["sr_service_plan_stages:delete"] = () => ({
      data: [{ id: STAGE_ID, plan_id: PLAN_ID }],
      error: null,
    });
    expect(await deleteStageAction(STAGE_ID)).toEqual({
      ok: true,
      data: { id: STAGE_ID },
    });
    expect(revalidateSpy).toHaveBeenCalledWith(
      `/admin/service-reports/plans/${PLAN_ID}`,
    );
    responses["sr_service_plan_stages:delete"] = () => ({
      data: [],
      error: null,
    });
    expect(await deleteStageAction(STAGE_ID)).toEqual({
      ok: false,
      error: "找不到保養階段",
    });
  });
});

describe("setMachinePlanAction", () => {
  it("指定方案 → upsert（machine_id 為主鍵）", async () => {
    const r = await setMachinePlanAction(MACHINE_ID, PLAN_ID);
    expect(r).toEqual({
      ok: true,
      data: { machine_id: MACHINE_ID, plan_id: PLAN_ID },
    });
    const w = recorded[0];
    expect(w.table).toBe("sr_machine_plans");
    expect(w.kind).toBe("upsert");
    expect(w.payload).toMatchObject({
      machine_id: MACHINE_ID,
      plan_id: PLAN_ID,
    });
    expect(w.filters[0].args[0]).toEqual({ onConflict: "machine_id" });
  });

  it("清除指定 → 刪除該機台的指定列", async () => {
    const r = await setMachinePlanAction(MACHINE_ID, null);
    expect(r).toEqual({
      ok: true,
      data: { machine_id: MACHINE_ID, plan_id: null },
    });
    const w = recorded[0];
    expect(w.kind).toBe("delete");
    expect(w.filters[0]).toEqual({
      fn: "eq",
      args: ["machine_id", MACHINE_ID],
    });
    expect(revalidateSpy).toHaveBeenCalledWith(
      "/admin/service-reports/plans/machines",
    );
  });

  it("id 不合法不碰 DB；DB 錯誤回中文訊息", async () => {
    expect(await setMachinePlanAction("x", PLAN_ID)).toEqual({
      ok: false,
      error: "找不到機台",
    });
    expect(await setMachinePlanAction(MACHINE_ID, "x")).toEqual({
      ok: false,
      error: "找不到保養方案",
    });
    expect(recorded).toEqual([]);
    responses["sr_machine_plans:upsert"] = () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    expect(await setMachinePlanAction(MACHINE_ID, PLAN_ID)).toEqual({
      ok: false,
      error: "沒有機台維護報告單權限",
    });
  });
});
