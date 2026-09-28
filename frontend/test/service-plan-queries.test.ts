import { describe, it, expect, vi, beforeEach } from "vitest";

// 保養方案查詢（mock supabase）：方案 + 階段分組、機台對應列、提醒清單組裝
// （作廢單不計入時數與已開過階段、逐台指定優先、無抄表不提醒）、單機台階段旗標。

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string } | null;

let tables: Record<string, Row[]> = {};
let errors: Record<string, DbError> = {};

class Query implements PromiseLike<{ data: unknown; error: DbError }> {
  private conds: ((r: Row) => boolean)[] = [];
  private from = 0;
  private to = Number.MAX_SAFE_INTEGER;
  private single = false;
  constructor(public table: string) {}
  select(): this {
    return this;
  }
  eq(col: string, val: unknown): this {
    this.conds.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown): this {
    this.conds.push((r) => r[col] !== val);
    return this;
  }
  is(col: string, val: unknown): this {
    this.conds.push((r) => (r[col] ?? null) === val);
    return this;
  }
  not(col: string, _op: string, val: unknown): this {
    this.conds.push((r) => (r[col] ?? null) !== val);
    return this;
  }
  order(): this {
    return this;
  }
  range(from: number, to: number): this {
    this.from = from;
    this.to = to;
    return this;
  }
  maybeSingle(): this {
    this.single = true;
    return this;
  }
  private run(): { data: unknown; error: DbError } {
    const error = errors[this.table] ?? null;
    if (error) return { data: null, error };
    const rows = (tables[this.table] ?? []).filter((r) =>
      this.conds.every((c) => c(r)),
    );
    if (this.single) return { data: rows[0] ?? null, error: null };
    return { data: rows.slice(this.from, this.to + 1), error: null };
  }
  then<A, B = never>(
    ok?: ((v: { data: unknown; error: DbError }) => A | PromiseLike<A>) | null,
    bad?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: (table: string) => new Query(table),
  })),
}));

import {
  getPlanWithStages,
  listMachinePlanRows,
  listPlansWithStages,
  listReminders,
  listStagesForMachine,
} from "@/lib/service-report/plan/queries";

const uuid = (n: number) =>
  `${String(n).padStart(8, "0")}-2222-4333-8444-555555555555`;
const P1 = uuid(1);
const P2 = uuid(2);
const P3 = uuid(3);
const S1 = uuid(11);
const S2 = uuid(12);
const S3 = uuid(13);
const M1 = uuid(21);
const M2 = uuid(22);
const M3 = uuid(23);
const M4 = uuid(24);
const TODAY = "2026-09-11";

function machine(
  id: string,
  customer: string,
  horsepower: string | null,
  machine_no: string | null,
  serial_no: string,
): Row {
  return {
    id,
    customer_id: `c-${customer}`,
    card_type: "compressor",
    archived_at: null,
    machine_no,
    serial_no,
    model: "AE-20",
    horsepower,
    mx_customers: { name: customer },
  };
}

beforeEach(() => {
  errors = {};
  tables = {
    sr_service_plans: [
      {
        id: P1,
        name: "20HP 空壓機",
        hp_tags: ["20HP"],
        active: true,
        note: null,
        created_by: null,
        created_at: "",
        updated_at: "",
      },
      {
        id: P2,
        name: "30HP 空壓機",
        hp_tags: ["30"],
        active: true,
        note: null,
        created_by: null,
        created_at: "",
        updated_at: "",
      },
    ],
    sr_service_plan_stages: [
      { id: S2, plan_id: P1, hours: 4000, label: "基礎保養", parts: [] },
      { id: S1, plan_id: P1, hours: 2000, label: "基礎保養", parts: [] },
      { id: S3, plan_id: P2, hours: 2000, label: "年度保養", parts: [] },
    ],
    sr_machine_plans: [{ machine_id: M3, plan_id: P1 }],
    mx_machines: [
      machine(M1, "甲客戶", "20HP", "2", "AB-1"),
      machine(M2, "乙客戶", "30", null, "CD-2"),
      machine(M3, "甲客戶", null, null, "EF-3"),
      machine(M4, "丙客戶", "20hp", null, "GH-4"),
    ],
    mx_records: [
      { id: "r1", machine_id: M1, service_date: "2026-09-01", hours: "1000" },
      { id: "r2", machine_id: M1, service_date: "2026-09-11", hours: "2,100" },
      { id: "r3", machine_id: M2, service_date: "2026-09-01", hours: "1800" },
      { id: "r4", machine_id: M4, service_date: "2026-09-01", hours: "1000" },
      { id: "r5", machine_id: M4, service_date: "2026-09-11", hours: "2100" },
      { id: "r6", machine_id: M1, service_date: null, hours: "9999" },
    ],
    sr_reports: [
      {
        id: "x1",
        machine_id: M1,
        report_date: "2026-09-05",
        status: "printed",
        results: { compressor: { run_hours: "1500" } },
        plan_stage_id: null,
      },
      {
        id: "x2",
        machine_id: M2,
        report_date: "2026-09-11",
        status: "printed",
        results: { compressor: { run_hours: "1,900" } },
        plan_stage_id: null,
      },
      {
        // 作廢單：時數與已開過階段皆不計入
        id: "x3",
        machine_id: M1,
        report_date: "2026-09-10",
        status: "voided",
        results: { compressor: { run_hours: "99999" } },
        plan_stage_id: S1,
      },
      {
        id: "x4",
        machine_id: M4,
        report_date: "2026-09-06",
        status: "completed",
        results: {},
        plan_stage_id: S1,
      },
    ],
  };
});

describe("listPlansWithStages / getPlanWithStages", () => {
  it("方案帶階段，階段依時數由小到大", async () => {
    const r = await listPlansWithStages();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((p) => p.id)).toEqual([P1, P2]);
    expect(r.data[0].stages.map((s) => s.hours)).toEqual([2000, 4000]);
    expect(r.data[1].stages.map((s) => s.id)).toEqual([S3]);
  });

  it("單一方案；id 不合法 / 不存在 → null", async () => {
    const r = await getPlanWithStages(P1);
    expect(r.ok && r.data?.stages.map((s) => s.id)).toEqual([S1, S2]);
    expect(await getPlanWithStages("x")).toEqual({ ok: true, data: null });
    expect(await getPlanWithStages(uuid(99))).toEqual({ ok: true, data: null });
  });

  it("DB 錯誤 → 中文訊息", async () => {
    errors.sr_service_plans = { code: "42501", message: "denied" };
    expect(await listPlansWithStages()).toEqual({
      ok: false,
      error: "沒有機台維護報告單權限",
    });
  });
});

describe("listMachinePlanRows", () => {
  it("未封存空壓機 + 客戶 + 比對方案 + 目前時數，依客戶 / 機台排序", async () => {
    const r = await listMachinePlanRows();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byId = new Map(r.data.rows.map((x) => [x.machine_id, x]));
    expect(byId.get(M1)).toMatchObject({
      customer_name: "甲客戶",
      machine_label: "2-AB-1",
      plan_id: P1,
      plan_source: "hp",
      override_plan_id: null,
      latest_hours: 2100,
      latest_date: "2026-09-11",
      conflicts: [],
    });
    // 逐台指定：沒有馬力也對得到方案
    expect(byId.get(M3)).toMatchObject({
      plan_id: P1,
      plan_source: "override",
      override_plan_id: P1,
      latest_hours: null,
      latest_date: null,
    });
    expect(byId.get(M2)?.plan_id).toBe(P2);
    expect(r.data.plans.map((p) => p.id)).toEqual([P1, P2]);
    // 客戶名稱排序（丙 < 乙 < 甲，依字碼）
    expect(r.data.rows.map((x) => x.customer_name)).toEqual([
      "丙客戶",
      "乙客戶",
      "甲客戶",
      "甲客戶",
    ]);
  });

  it("多方案相符 → conflicts 帶出方案名稱", async () => {
    tables.sr_service_plans.push({
      id: P3,
      name: "A 另一個 20HP",
      hp_tags: ["20"],
      active: true,
      note: null,
      created_by: null,
      created_at: "",
      updated_at: "",
    });
    const r = await listMachinePlanRows();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m1 = r.data.rows.find((x) => x.machine_id === M1)!;
    // 名稱排序以字碼為準（"2" < "A"），結果穩定且與語系無關
    expect(m1.plan_name).toBe("20HP 空壓機");
    expect(m1.conflicts).toEqual(["20HP 空壓機", "A 另一個 20HP"]);
  });
});

describe("listReminders", () => {
  it("已達門檻在前、即將到期在後；作廢單不計入、已開過階段不再提醒", async () => {
    const r = await listReminders(TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.data.map((x) => [x.machine_id, x.status, x.stage_id, x.due_date]),
    ).toEqual([
      [M1, "due", S1, null],
      [M2, "upcoming", S3, "2026-09-21"],
    ]);
    expect(r.data[0]).toMatchObject({
      customer_name: "甲客戶",
      machine_label: "2-AB-1",
      plan_name: "20HP 空壓機",
      stage_label: "2000 小時 基礎保養",
      latest_hours: 2100,
      latest_source: "record",
    });
    // M4 的 2000 小時階段已開過（未作廢單），下一階段 4000 還很遠 → 不提醒
    expect(r.data.some((x) => x.machine_id === M4)).toBe(false);
    // M3 沒有任何抄表 → 不提醒
    expect(r.data.some((x) => x.machine_id === M3)).toBe(false);
  });

  it("沒有方案 → 空清單；DB 錯誤 → 中文訊息", async () => {
    tables.sr_service_plans = [];
    expect(await listReminders(TODAY)).toEqual({ ok: true, data: [] });
    errors.mx_machines = { code: "42501", message: "denied" };
    tables.sr_service_plans = [
      {
        id: P1,
        name: "20HP",
        hp_tags: ["20"],
        active: true,
        note: null,
        created_by: null,
        created_at: "",
        updated_at: "",
      },
    ];
    expect(await listReminders(TODAY)).toEqual({
      ok: false,
      error: "沒有機台維護報告單權限",
    });
  });
});

describe("listStagesForMachine", () => {
  it("階段帶已開過 / 已達門檻旗標與建議套用的階段", async () => {
    const r = await listStagesForMachine(M1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.plan?.id).toBe(P1);
    expect(r.data?.plan_source).toBe("hp");
    expect(r.data?.latest).toEqual({
      date: "2026-09-11",
      hours: 2100,
      source: "record",
    });
    expect(r.data?.stages.map((s) => [s.hours, s.issued, s.reached])).toEqual([
      [2000, false, true],
      [4000, false, false],
    ]);
    expect(r.data?.suggested_stage_id).toBe(S1);
  });

  it("已開過的階段跳過，下一階段未達門檻 → 不建議套用", async () => {
    const r = await listStagesForMachine(M4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.stages.map((s) => [s.hours, s.issued])).toEqual([
      [2000, true],
      [4000, false],
    ]);
    expect(r.data?.suggested_stage_id).toBeNull();
  });

  it("機台不存在 / id 不合法 → null", async () => {
    expect(await listStagesForMachine("x")).toEqual({ ok: true, data: null });
    expect(await listStagesForMachine(uuid(98))).toEqual({
      ok: true,
      data: null,
    });
  });
});
