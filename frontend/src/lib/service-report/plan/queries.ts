// 保養方案查詢 — SERVER ONLY。一律以登入者 session（getServerSupabase）讀，靠 RLS
// has_module('service_report') 擋（0022 的三張方案表與 mx_records 的 select policy）。
// 可能超過 1000 列的表（mx_records / sr_reports / mx_machines）一律以 .range 分頁讀完。
import "server-only";

import { taipeiTodayYmd } from "@/lib/analytics/ranges";
import { getServerSupabase } from "@/lib/supabase-server";
import type { ServiceReportResults, SrResult } from "../types";
import { isUuid } from "../validate";
import { addDaysIso, machineLabel, reminderFor, sortReminders } from "./due";
import {
  SP_TOO_MANY_ROWS_CODE,
  SP_TOO_MANY_ROWS_MESSAGE,
  planErrorMessage,
} from "./errors";
import { latestHours, readingFrom } from "./hours";
import { matchPlan } from "./match";
import {
  isHoursReached,
  lastMilestone,
  milestoneKey,
  milestoneOptions,
  sortStages,
  type MilestoneTarget,
} from "./stage";
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

/**
 * 提醒 / 使用速度推估只看最近這段期間的抄表（避免每次列表頁都整表掃 mx_records）。
 * 需比推估取樣（最多 6 筆、首尾至少相差 7 天）寬鬆得多，取約一年半。
 */
export const READING_WINDOW_DAYS = 540;

interface DbError {
  code?: string;
  message?: string;
  details?: string | null;
}

/** 讀滿保護上限：資料可能不完整，寧可回錯誤也不要靜靜地少算。 */
const TOO_MANY_ROWS_ERROR: DbError = {
  code: SP_TOO_MANY_ROWS_CODE,
  message: SP_TOO_MANY_ROWS_MESSAGE,
};

type PagedResult = { data: unknown; error: DbError | null };

/**
 * 以 .range 分頁讀完一張表（呼叫端需自行加上穩定的 order）。
 * 讀到保護上限仍未讀完時回 TOO_MANY_ROWS_ERROR，避免呼叫端拿殘缺資料當完整結果。
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<PagedResult>,
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    const chunk = (data ?? []) as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows, error: TOO_MANY_ROWS_ERROR };
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

/** 只取比對方案所需的欄位（計算「使用此方案的機台數」用，不帶客戶關聯）。 */
async function loadMachineHp(supabase: Supabase): Promise<{
  rows: { id: string; horsepower: string | null }[];
  error: DbError | null;
}> {
  return fetchAll<{ id: string; horsepower: string | null }>((from, to) =>
    supabase
      .from("mx_machines")
      .select("id, horsepower")
      .is("archived_at", null)
      .eq("card_type", "compressor")
      .order("id", { ascending: true })
      .range(from, to),
  );
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

interface HoursScope {
  /** 只讀單一機台。 */
  machineId?: string;
  /**
   * 只讀這個日期（含）之後的抄表（西元 ISO）。省略＝不限期間。
   * 已開過的階段不受此限制（漏算會讓已保養過的階段被重複提醒）。
   */
  sinceDate?: string;
}

interface HoursData {
  /** machine_id → 抄表陣列（未排序；latestHours / estimateDue 會自行處理）。 */
  readings: Map<string, HoursReading[]>;
  /**
   * machine_id → 已開過的里程碑鍵 milestoneKey(plan_stage_id, plan_stage_hours)。
   * 循環里程碑下「同階段不同里程碑」是不同的一次保養，所以鍵必須含時數；
   * 沒有記錄時數（plan_stage_hours 為 null）的舊報告單不算已開過。
   */
  issued: Map<string, Set<string>>;
  error: DbError | null;
}

/**
 * 時數抄表 + 已開過的階段。抄表來源：保養卡 mx_records.hours 與未作廢報告單的
 * results.compressor.run_hours；sr_reports 一次讀出兩種資訊（抄表 + 已開過階段），
 * 不重複掃同一張表。
 *
 * 排序一律用日期「由新到舊」：分頁讀到保護上限時被捨棄的會是最舊的幾筆，
 * 「目前時數」與使用速度推估（最近 6 筆）都還正確；若由舊到新，捨棄的反而是最新抄表，
 * 會安靜地算出錯誤的目前時數。
 */
async function loadHours(
  supabase: Supabase,
  scope: HoursScope = {},
): Promise<HoursData> {
  const { machineId, sinceDate } = scope;
  const readings = new Map<string, HoursReading[]>();
  const issued = new Map<string, Set<string>>();
  const fail = (error: DbError): HoursData => ({ readings, issued, error });
  const push = (id: string | null, reading: HoursReading | null) => {
    if (!id || !reading) return;
    const list = readings.get(id);
    if (list) list.push(reading);
    else readings.set(id, [reading]);
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
    if (sinceDate) q = q.gte("service_date", sinceDate);
    return q
      .order("service_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  if (records.error) return fail(records.error);
  for (const r of records.rows) {
    push(r.machine_id, readingFrom(r.service_date, r.hours, "record"));
  }

  const reports = await fetchAll<{
    machine_id: string | null;
    report_date: string;
    results: ServiceReportResults | null;
    plan_stage_id: string | null;
    plan_stage_hours: number | null;
  }>((from, to) => {
    let q = supabase
      .from("sr_reports")
      .select(
        "machine_id, report_date, results, plan_stage_id, plan_stage_hours",
      )
      .neq("status", "voided")
      .not("machine_id", "is", null);
    if (machineId) q = q.eq("machine_id", machineId);
    return q
      .order("report_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
  });
  if (reports.error) return fail(reports.error);
  for (const r of reports.rows) {
    if (!r.machine_id) continue;
    // 抄表與 mx_records 套用同一個期間窗（推估才不會混用新舊尺度）；
    // 已開過的階段則不設限，否則舊保養會被當成沒做過而重複提醒。
    if (!sinceDate || r.report_date >= sinceDate) {
      push(
        r.machine_id,
        readingFrom(r.report_date, r.results?.compressor?.run_hours, "report"),
      );
    }
    if (r.plan_stage_id && typeof r.plan_stage_hours === "number") {
      const key = milestoneKey(r.plan_stage_id, r.plan_stage_hours);
      const set = issued.get(r.machine_id);
      if (set) set.add(key);
      else issued.set(r.machine_id, new Set([key]));
    }
  }
  return { readings, issued, error: null };
}

/* -------------------------------------------------------------- 對外 API */

/** 方案清單一列：方案 + 階段 + 使用此方案的機台數（#201 刪除確認用）。 */
export interface PlanListRow extends ServicePlanWithStages {
  /** 逐台指定此方案的機台數。 */
  override_machine_count: number;
  /** 實際套用此方案的機台數＝逐台指定 + 靠馬力比到此方案（且未被指定覆寫）。 */
  machine_count: number;
}

/**
 * 方案清單（含階段，階段依時數排序）+ 每個方案的使用機台數。
 * 機台只讀 id / horsepower 兩欄（比對用），不帶客戶關聯。
 */
export async function listPlansWithStages(): Promise<SrResult<PlanListRow[]>> {
  const supabase = await getServerSupabase();
  const { plans, stages, error } = await loadPlans(supabase);
  if (error) return { ok: false, error: planErrorMessage(error) };
  const byPlan = groupStages(stages);

  const overrides = await loadOverrides(supabase);
  if (overrides.error) {
    return { ok: false, error: planErrorMessage(overrides.error) };
  }
  const machines = await loadMachineHp(supabase);
  if (machines.error) {
    return { ok: false, error: planErrorMessage(machines.error) };
  }

  const total = new Map<string, number>();
  const overridden = new Map<string, number>();
  for (const m of machines.rows) {
    const matched = matchPlan(m, plans, overrides.map);
    if (!matched.plan) continue;
    const id = matched.plan.id;
    total.set(id, (total.get(id) ?? 0) + 1);
    if (matched.source === "override") {
      overridden.set(id, (overridden.get(id) ?? 0) + 1);
    }
  }

  return {
    ok: true,
    data: plans.map((p) => ({
      ...p,
      stages: byPlan.get(p.id) ?? [],
      override_machine_count: overridden.get(p.id) ?? 0,
      machine_count: total.get(p.id) ?? 0,
    })),
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
  const hours = await loadHours(supabase);
  if (hours.error) {
    return { ok: false, error: planErrorMessage(hours.error) };
  }

  const rows = machines.rows.map((m): MachinePlanRow => {
    const matched = matchPlan(m, plans, overrides.map);
    const latest = latestHours(hours.readings.get(m.id) ?? []);
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
 * 到期提醒清單（spec §5.6）：未封存空壓機 × 比對到的方案 × 循環里程碑，
 * 已達的最後一個里程碑未開過（due）或下一個里程碑 14 天內預估到期（upcoming）者列入，
 * 已達門檻在前。
 *
 * 抄表只讀最近 READING_WINDOW_DAYS 天（這份清單每次列表頁都會算，不能整表掃
 * mx_records）。窗內完全沒有抄表的機台不會出現在提醒中（與「從未抄表」相同）；
 * 窗內只有一筆抄表的機台無法推估使用速度，只可能以「已達門檻」列入。
 * 已開過的階段不受此窗限制，舊保養不會被當成沒做過而重複提醒。
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
  const hours = await loadHours(supabase, {
    sinceDate: addDaysIso(todayIso, -READING_WINDOW_DAYS),
  });
  if (hours.error) {
    return { ok: false, error: planErrorMessage(hours.error) };
  }

  const reminders: StageReminder[] = [];
  for (const m of machines.rows) {
    const plan = matchPlan(m, plans, overrides.map).plan;
    if (!plan) continue;
    const stages = byPlan.get(plan.id) ?? [];
    if (stages.length === 0) continue;
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
      stages,
      issued: hours.issued.get(m.id),
      readings: hours.readings.get(m.id) ?? [],
      todayIso,
    });
    if (reminder) reminders.push(reminder);
  }
  return { ok: true, data: sortReminders(reminders) };
}

/** 單一機台的里程碑狀態（開單頁套用階段用）。 */
export interface MachineMilestoneRow extends MilestoneTarget {
  /** 已存在未作廢報告單記錄此「階段 + 里程碑」。 */
  issued: boolean;
  /** 目前時數已達此里程碑。 */
  reached: boolean;
}

export interface MachineStagesData {
  machine_id: string;
  plan: ServicePlan | null;
  plan_source: PlanMatchSource;
  /** 這台機台目前這一輪的里程碑選項（時數由小到大）。 */
  milestones: MachineMilestoneRow[];
  latest: HoursReading | null;
  /** 已達且未開過的里程碑（開單時主動提示套用）；無則 null。 */
  suggested_milestone: number | null;
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
  const hours = await loadHours(supabase, { machineId });
  if (hours.error) {
    return { ok: false, error: planErrorMessage(hours.error) };
  }

  const matched = matchPlan(machine, plans, overrides.map);
  const latest = latestHours(hours.readings.get(machineId) ?? []);
  const issuedSet = hours.issued.get(machineId) ?? new Set<string>();
  const planStages = matched.plan
    ? (groupStages(stages).get(matched.plan.id) ?? [])
    : [];
  const rows: MachineMilestoneRow[] = milestoneOptions(
    planStages,
    latest?.hours ?? null,
  ).map((t) => ({
    ...t,
    issued: issuedSet.has(milestoneKey(t.stage.id, t.milestone)),
    reached: isHoursReached(t.milestone, latest?.hours ?? null),
  }));
  // 主動提示只看「已達的最後一個里程碑」且它未開過（不回頭補更舊的）。
  const last = lastMilestone(planStages, latest?.hours ?? null);
  const suggested =
    last && !issuedSet.has(milestoneKey(last.stage.id, last.milestone))
      ? last
      : null;
  return {
    ok: true,
    data: {
      machine_id: machineId,
      plan: matched.plan,
      plan_source: matched.source,
      milestones: rows,
      latest,
      suggested_milestone: suggested?.milestone ?? null,
    },
  };
}
