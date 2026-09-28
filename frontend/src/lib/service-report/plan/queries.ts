// 保養方案查詢 — SERVER ONLY。一律以登入者 session（getServerSupabase）讀，靠 RLS
// has_module('service_report') 擋（0022 的三張方案表與 mx_records 的 select policy）。
// 可能超過 1000 列的表（mx_records / sr_reports / mx_machines）一律以 .range 分頁讀完。
import "server-only";

import { taipeiTodayYmd } from "@/lib/analytics/ranges";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ServiceReportResults, SrResult } from "../types";
import { isUuid } from "../validate";
import { machineLabel, reminderFor, sortReminders } from "./due";
import { planErrorMessage } from "./errors";
import { latestHours, readingFrom } from "./hours";
import { matchPlan } from "./match";
import { isStageReached, nextStage, sortStages } from "./stage";
import type {
  HoursReading,
  PlanMatchSource,
  ServicePlan,
  ServicePlanStage,
  ServicePlanWithStages,
  StageReminder,
} from "./types";

const PAGE_SIZE = 1000;
/** 分頁讀取的保護上限（避免意外的無窮迴圈）。 */
const MAX_ROWS = 100_000;

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

type PagedResult = { data: unknown; error: DbError | null };

/** 以 .range 分頁讀完一張表（呼叫端需自行加上穩定的 order）。 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PagedResult>,
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

type Supabase = Awaited<ReturnType<typeof getServerSupabase>>;

const PLAN_COLUMNS =
  "id, name, hp_tags, active, note, created_by, created_at, updated_at";
const STAGE_COLUMNS =
  "id, plan_id, hours, label, parts, created_at, updated_at";
const MACHINE_COLUMNS =
  "id, customer_id, machine_no, serial_no, model, horsepower, mx_customers(name)";

/** mx_machines + 客戶名（嵌套關聯在 PostgREST 可能是物件或陣列）。 */
interface MachineRow {
  id: string;
  customer_id: string;
  machine_no: string | null;
  serial_no: string | null;
  model: string | null;
  horsepower: string | null;
  mx_customers?: { name: string } | { name: string }[] | null;
}

function customerNameOf(row: MachineRow): string {
  const c = row.mx_customers;
  const name = Array.isArray(c) ? c[0]?.name : c?.name;
  return (name ?? "").trim() || "（未命名客戶）";
}

/* ------------------------------------------------------------ 讀取單元 */

async function loadPlans(supabase: Supabase): Promise<{
  plans: ServicePlan[];
  stages: ServicePlanStage[];
  error: DbError | null;
}> {
  const plans = await fetchAll<ServicePlan>((from, to) =>
    supabase
      .from("sr_service_plans")
      .select(PLAN_COLUMNS)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (plans.error) return { plans: [], stages: [], error: plans.error };
  const stages = await fetchAll<ServicePlanStage>((from, to) =>
    supabase
      .from("sr_service_plan_stages")
      .select(STAGE_COLUMNS)
      .order("plan_id", { ascending: true })
      .order("hours", { ascending: true })
      .range(from, to),
  );
  if (stages.error) return { plans: [], stages: [], error: stages.error };
  return { plans: plans.rows, stages: stages.rows, error: null };
}

function groupStages(
  stages: readonly ServicePlanStage[],
): Map<string, ServicePlanStage[]> {
  const byPlan = new Map<string, ServicePlanStage[]>();
  for (const s of stages) {
    const list = byPlan.get(s.plan_id);
    if (list) list.push(s);
    else byPlan.set(s.plan_id, [s]);
  }
  for (const [id, list] of byPlan) byPlan.set(id, sortStages(list));
  return byPlan;
}

/** 逐台指定：machine_id → plan_id。 */
async function loadOverrides(
  supabase: Supabase,
): Promise<{ map: Map<string, string>; error: DbError | null }> {
  const { rows, error } = await fetchAll<{
    machine_id: string;
    plan_id: string;
  }>((from, to) =>
    supabase
      .from("sr_machine_plans")
      .select("machine_id, plan_id")
      .order("machine_id", { ascending: true })
      .range(from, to),
  );
  return {
    map: new Map(rows.map((r) => [r.machine_id, r.plan_id])),
    error,
  };
}

/** 未封存的空壓機（過濾卡不納入提醒與自動帶入）。 */
async function loadMachines(
  supabase: Supabase,
  machineId?: string,
): Promise<{ rows: MachineRow[]; error: DbError | null }> {
  return fetchAll<MachineRow>((from, to) => {
    let q = supabase
      .from("mx_machines")
      .select(MACHINE_COLUMNS)
      .is("archived_at", null)
      .eq("card_type", "compressor");
    if (machineId) q = q.eq("id", machineId);
    return q
      .order("machine_no", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
  });
}

/**
 * 時數抄表：保養卡 mx_records.hours + 未作廢報告單的 results.compressor.run_hours。
 * 回 machine_id → 抄表陣列（未排序；latestHours / estimateDue 會自行處理）。
 */
async function loadReadings(
  supabase: Supabase,
  machineId?: string,
): Promise<{ map: Map<string, HoursReading[]>; error: DbError | null }> {
  const map = new Map<string, HoursReading[]>();
  const push = (id: string | null, reading: HoursReading | null) => {
    if (!id || !reading) return;
    const list = map.get(id);
    if (list) list.push(reading);
    else map.set(id, [reading]);
  };

  const records = await fetchAll<{
    machine_id: string;
    service_date: string | null;
    hours: string | null;
  }>((from, to) => {
    let q = supabase
      .from("mx_records")
      .select("machine_id, service_date, hours")
      .not("service_date", "is", null)
      .not("hours", "is", null);
    if (machineId) q = q.eq("machine_id", machineId);
    return q
      .order("service_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  });
  if (records.error) return { map, error: records.error };
  for (const r of records.rows) {
    push(r.machine_id, readingFrom(r.service_date, r.hours, "record"));
  }

  const reports = await fetchAll<{
    machine_id: string | null;
    report_date: string;
    results: ServiceReportResults | null;
  }>((from, to) => {
    let q = supabase
      .from("sr_reports")
      .select("machine_id, report_date, results")
      .neq("status", "voided")
      .not("machine_id", "is", null);
    if (machineId) q = q.eq("machine_id", machineId);
    return q
      .order("report_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  });
  if (reports.error) return { map, error: reports.error };
  for (const r of reports.rows) {
    push(
      r.machine_id,
      readingFrom(r.report_date, r.results?.compressor?.run_hours, "report"),
    );
  }
  return { map, error: null };
}

/** 已開過的階段（未作廢報告單）：machine_id → Set<stage_id>。 */
async function loadIssuedStages(
  supabase: Supabase,
  machineId?: string,
): Promise<{ map: Map<string, Set<string>>; error: DbError | null }> {
  const map = new Map<string, Set<string>>();
  const { rows, error } = await fetchAll<{
    machine_id: string | null;
    plan_stage_id: string | null;
  }>((from, to) => {
    let q = supabase
      .from("sr_reports")
      .select("machine_id, plan_stage_id")
      .neq("status", "voided")
      .not("plan_stage_id", "is", null);
    if (machineId) q = q.eq("machine_id", machineId);
    return q.order("id", { ascending: true }).range(from, to);
  });
  if (error) return { map, error };
  for (const r of rows) {
    if (!r.machine_id || !r.plan_stage_id) continue;
    const set = map.get(r.machine_id);
    if (set) set.add(r.plan_stage_id);
    else map.set(r.machine_id, new Set([r.plan_stage_id]));
  }
  return { map, error: null };
}

/* -------------------------------------------------------------- 對外 API */

/** 方案清單（含階段，階段依時數排序）。 */
export async function listPlansWithStages(): Promise<
  SrResult<ServicePlanWithStages[]>
> {
  const supabase = await getServerSupabase();
  const { plans, stages, error } = await loadPlans(supabase);
  if (error) return { ok: false, error: planErrorMessage(error) };
  const byPlan = groupStages(stages);
  return {
    ok: true,
    data: plans.map((p) => ({ ...p, stages: byPlan.get(p.id) ?? [] })),
  };
}

/** 單一方案（含階段）；不存在（或無權限）回 data: null。 */
export async function getPlanWithStages(
  id: string,
): Promise<SrResult<ServicePlanWithStages | null>> {
  if (!isUuid(id)) return { ok: true, data: null };
  const supabase = await getServerSupabase();
  const plan = await supabase
    .from("sr_service_plans")
    .select(PLAN_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (plan.error) return { ok: false, error: planErrorMessage(plan.error) };
  if (!plan.data) return { ok: true, data: null };
  const stages = await fetchAll<ServicePlanStage>((from, to) =>
    supabase
      .from("sr_service_plan_stages")
      .select(STAGE_COLUMNS)
      .eq("plan_id", id)
      .order("hours", { ascending: true })
      .range(from, to),
  );
  if (stages.error) return { ok: false, error: planErrorMessage(stages.error) };
  return {
    ok: true,
    data: {
      ...(plan.data as unknown as ServicePlan),
      stages: sortStages(stages.rows),
    },
  };
}

/** 機台對應頁一列（spec §6：客戶、機台、馬力、比對到的方案、目前時數）。 */
export interface MachinePlanRow {
  machine_id: string;
  customer_id: string;
  customer_name: string;
  machine_label: string;
  machine_no: string | null;
  serial_no: string | null;
  model: string | null;
  horsepower: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_source: PlanMatchSource;
  /** 逐台指定的方案 id（null＝未指定，靠馬力比對）。 */
  override_plan_id: string | null;
  /** 馬力比到多個方案時的方案名稱（供管理頁標示衝突）；否則空陣列。 */
  conflicts: string[];
  latest_hours: number | null;
  latest_date: string | null;
}

export interface MachinePlanListData {
  rows: MachinePlanRow[];
  plans: ServicePlan[];
}

/** 機台對應清單：未封存空壓機 + 客戶名 + 馬力 + 比對到的方案 + 目前時數。 */
export async function listMachinePlanRows(): Promise<
  SrResult<MachinePlanListData>
> {
  const supabase = await getServerSupabase();
  const { plans, error: planError } = await loadPlans(supabase);
  if (planError) return { ok: false, error: planErrorMessage(planError) };
  const machines = await loadMachines(supabase);
  if (machines.error) {
    return { ok: false, error: planErrorMessage(machines.error) };
  }
  const overrides = await loadOverrides(supabase);
  if (overrides.error) {
    return { ok: false, error: planErrorMessage(overrides.error) };
  }
  const readings = await loadReadings(supabase);
  if (readings.error) {
    return { ok: false, error: planErrorMessage(readings.error) };
  }

  const rows = machines.rows.map((m): MachinePlanRow => {
    const matched = matchPlan(m, plans, overrides.map);
    const latest = latestHours(readings.map.get(m.id) ?? []);
    return {
      machine_id: m.id,
      customer_id: m.customer_id,
      customer_name: customerNameOf(m),
      machine_label: machineLabel(m),
      machine_no: m.machine_no,
      serial_no: m.serial_no,
      model: m.model,
      horsepower: m.horsepower,
      plan_id: matched.plan?.id ?? null,
      plan_name: matched.plan?.name ?? null,
      plan_source: matched.source,
      override_plan_id: overrides.map.get(m.id) ?? null,
      conflicts: matched.conflicts.map((p) => p.name),
      latest_hours: latest?.hours ?? null,
      latest_date: latest?.date ?? null,
    };
  });
  rows.sort((a, b) =>
    a.customer_name !== b.customer_name
      ? a.customer_name < b.customer_name
        ? -1
        : 1
      : a.machine_label < b.machine_label
        ? -1
        : a.machine_label > b.machine_label
          ? 1
          : 0,
  );
  return { ok: true, data: { rows, plans } };
}

/**
 * 到期提醒清單（spec §5.6）：未封存空壓機 × 比對到的方案 × 下一個未開過的階段，
 * 已達門檻或 14 天內預估到期者列入，已達門檻在前。
 */
export async function listReminders(
  /** 今天（台北）西元 ISO；省略則以台北時間的今天計算。 */
  todayIso: string = taipeiTodayYmd(),
): Promise<SrResult<StageReminder[]>> {
  const supabase = await getServerSupabase();
  const { plans, stages, error: planError } = await loadPlans(supabase);
  if (planError) return { ok: false, error: planErrorMessage(planError) };
  if (plans.length === 0) return { ok: true, data: [] };
  const byPlan = groupStages(stages);

  const machines = await loadMachines(supabase);
  if (machines.error) {
    return { ok: false, error: planErrorMessage(machines.error) };
  }
  const overrides = await loadOverrides(supabase);
  if (overrides.error) {
    return { ok: false, error: planErrorMessage(overrides.error) };
  }
  const readings = await loadReadings(supabase);
  if (readings.error) {
    return { ok: false, error: planErrorMessage(readings.error) };
  }
  const issued = await loadIssuedStages(supabase);
  if (issued.error) return { ok: false, error: planErrorMessage(issued.error) };

  const reminders: StageReminder[] = [];
  for (const m of machines.rows) {
    const plan = matchPlan(m, plans, overrides.map).plan;
    if (!plan) continue;
    const stage = nextStage(byPlan.get(plan.id) ?? [], issued.map.get(m.id));
    if (!stage) continue;
    const reminder = reminderFor({
      machine: {
        id: m.id,
        customer_id: m.customer_id,
        customer_name: customerNameOf(m),
        machine_no: m.machine_no,
        serial_no: m.serial_no,
        model: m.model,
      },
      plan,
      stage,
      readings: readings.map.get(m.id) ?? [],
      todayIso,
    });
    if (reminder) reminders.push(reminder);
  }
  return { ok: true, data: sortReminders(reminders) };
}

/** 單一機台的階段狀態（開單頁套用階段用）。 */
export interface MachineStageRow extends ServicePlanStage {
  /** 已存在未作廢報告單記錄此階段。 */
  issued: boolean;
  /** 目前時數已達此階段門檻。 */
  reached: boolean;
}

export interface MachineStagesData {
  machine_id: string;
  plan: ServicePlan | null;
  plan_source: PlanMatchSource;
  stages: MachineStageRow[];
  latest: HoursReading | null;
  /** 已達門檻且未開過的階段 id（開單時主動提示套用）；無則 null。 */
  suggested_stage_id: string | null;
}

/** 機台的方案 / 階段 + 已開過與已達門檻旗標；機台不存在（或非空壓機）回 data: null。 */
export async function listStagesForMachine(
  machineId: string,
): Promise<SrResult<MachineStagesData | null>> {
  if (!isUuid(machineId)) return { ok: true, data: null };
  const supabase = await getServerSupabase();
  const machines = await loadMachines(supabase, machineId);
  if (machines.error) {
    return { ok: false, error: planErrorMessage(machines.error) };
  }
  const machine = machines.rows[0];
  if (!machine) return { ok: true, data: null };

  const { plans, stages, error: planError } = await loadPlans(supabase);
  if (planError) return { ok: false, error: planErrorMessage(planError) };
  const overrides = await loadOverrides(supabase);
  if (overrides.error) {
    return { ok: false, error: planErrorMessage(overrides.error) };
  }
  const readings = await loadReadings(supabase, machineId);
  if (readings.error) {
    return { ok: false, error: planErrorMessage(readings.error) };
  }
  const issued = await loadIssuedStages(supabase, machineId);
  if (issued.error) return { ok: false, error: planErrorMessage(issued.error) };

  const matched = matchPlan(machine, plans, overrides.map);
  const latest = latestHours(readings.map.get(machineId) ?? []);
  const issuedSet = issued.map.get(machineId) ?? new Set<string>();
  const planStages = matched.plan
    ? (groupStages(stages).get(matched.plan.id) ?? [])
    : [];
  const rows: MachineStageRow[] = planStages.map((s) => ({
    ...s,
    issued: issuedSet.has(s.id),
    reached: isStageReached(s, latest?.hours ?? null),
  }));
  const next = nextStage(planStages, issuedSet);
  return {
    ok: true,
    data: {
      machine_id: machineId,
      plan: matched.plan,
      plan_source: matched.source,
      stages: rows,
      latest,
      suggested_stage_id:
        next && isStageReached(next, latest?.hours ?? null) ? next.id : null,
    },
  };
}
