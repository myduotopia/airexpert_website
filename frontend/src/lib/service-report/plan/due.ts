// 使用速度推估、到期提醒判定與排序（spec §5.5 / §5.6）— 純函式（client / server 皆可用）。
import { latestHours, sortReadings } from "./hours";
import {
  lastMilestone,
  milestoneKey,
  milestoneLabel,
  nextMilestone,
  type MilestoneTarget,
} from "./stage";
import {
  RATE_MAX,
  RATE_MIN,
  RATE_MIN_DAYS,
  RATE_SAMPLE_SIZE,
  REMINDER_HORIZON_DAYS,
  type HoursReading,
  type ServicePlan,
  type ServicePlanStage,
  type StageReminder,
} from "./types";

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** 西元 ISO 日期 + n 天 → 西元 ISO 日期（純日曆運算，無時區）。 */
export function addDaysIso(iso: string, days: number): string {
  const t = toUtc(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/** from → to 相差幾天（to 較晚為正）。任一無效回 0。 */
export function daysBetweenIso(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

export interface DueEstimate {
  /** 預估到達目標時數的日期（西元 ISO）；已超過推估時間者以今天表示。 */
  dueDate: string;
  /** 每日運轉時數（已限制在 0.1–24）。 */
  rate: number;
  /** 取樣筆數。 */
  samples: number;
  /** 取樣首尾相距天數。 */
  spanDays: number;
  /** 距離目標還要幾天（自最新抄表日起算，可為負）。 */
  daysToTarget: number;
}

/**
 * 依最近 6 筆遞增抄表推估到達 targetHours 的日期（spec §5.5）。
 * 需至少 2 筆、首尾相距 ≥ 7 天且時數有增加，否則回 null（＝無法推估）。
 * rate 限制在 0.1–24 小時/日，避免離群值造成荒謬日期。
 */
export function estimateDue(
  readings: readonly HoursReading[] | null | undefined,
  targetHours: number,
  todayIso: string,
): DueEstimate | null {
  const sorted = sortReadings(readings).slice(-RATE_SAMPLE_SIZE);
  // 時數倒退（換表 / 誤抄）的點直接略過，只留遞增序列。
  const rising: HoursReading[] = [];
  for (const r of sorted) {
    const last = rising.at(-1);
    if (!last || r.hours >= last.hours) rising.push(r);
  }
  if (rising.length < 2) return null;

  const first = rising[0];
  const last = rising[rising.length - 1];
  const spanDays = daysBetweenIso(first.date, last.date);
  const gained = last.hours - first.hours;
  if (spanDays < RATE_MIN_DAYS || gained <= 0) return null;

  const rate = Math.min(RATE_MAX, Math.max(RATE_MIN, gained / spanDays));
  const daysToTarget = Math.ceil((targetHours - last.hours) / rate);
  const raw = addDaysIso(last.date, daysToTarget);
  return {
    dueDate: raw < todayIso ? todayIso : raw,
    rate,
    samples: rising.length,
    spanDays,
    daysToTarget,
  };
}

/** 提醒需要的機台欄位。 */
export interface ReminderMachine {
  id: string;
  customer_id: string | null;
  customer_name: string;
  machine_no: string | null;
  serial_no: string | null;
  model: string | null;
}

/** 機台顯示文字：「代號-機號」，皆缺時用型號。 */
export function machineLabel(
  machine: Pick<ReminderMachine, "machine_no" | "serial_no" | "model">,
): string {
  const parts = [machine.machine_no, machine.serial_no]
    .map((v) => (v ?? "").trim())
    .filter((v) => v !== "");
  if (parts.length) return parts.join("-");
  const model = (machine.model ?? "").trim();
  return model === "" ? "（未命名機台）" : model;
}

export interface ReminderInput {
  machine: ReminderMachine;
  plan: Pick<ServicePlan, "id" | "name">;
  /** 該方案的全部階段（循環里程碑由此推導）。 */
  stages: readonly ServicePlanStage[];
  readings: readonly HoursReading[];
  /**
   * 已開過的里程碑鍵（milestoneKey(plan_stage_id, plan_stage_hours)）；
   * 只認「同階段且同里程碑」的未作廢報告單。
   */
  issued?: ReadonlySet<string> | readonly string[] | null;
  /** 今天（台北）西元 ISO。 */
  todayIso: string;
  /** 展望天數（預設 14）。 */
  horizonDays?: number;
}

function toKeySet(
  keys: ReadonlySet<string> | readonly string[] | null | undefined,
): ReadonlySet<string> {
  if (!keys) return new Set<string>();
  return keys instanceof Set ? keys : new Set(keys as readonly string[]);
}

/**
 * 是否列入提醒（spec §5.6，循環里程碑）：
 * 1. 已達的最後一個里程碑尚未開過 → "due"（最優先，無預估日期）；
 *    只看「最後一個」，不回頭補更舊的里程碑。
 * 2. 否則看下一個里程碑：尚未開過、可推估且預估到期日 ≤ 今天 + horizonDays
 *    → "upcoming"（附預估日期）。
 * 3. 其他（含無抄表、無法推估）→ null。
 */
export function reminderFor(input: ReminderInput): StageReminder | null {
  const { machine, plan, stages, todayIso } = input;
  const latest = latestHours(input.readings);
  if (!latest) return null;
  const issued = toKeySet(input.issued);
  const isIssued = (t: MilestoneTarget) =>
    issued.has(milestoneKey(t.stage.id, t.milestone));

  const base = (target: MilestoneTarget) => ({
    machine_id: machine.id,
    customer_id: machine.customer_id,
    customer_name: machine.customer_name,
    machine_label: machineLabel(machine),
    plan_id: plan.id,
    plan_name: plan.name,
    milestone: target.milestone,
    stage_id: target.stage.id,
    stage_hours: target.stage.hours,
    stage_name: target.stage.label,
    stage_label: milestoneLabel(target.milestone, target.stage),
    latest_hours: latest.hours,
    latest_date: latest.date,
    latest_source: latest.source,
  });

  const last = lastMilestone(stages, latest.hours);
  if (last && !isIssued(last)) {
    return { ...base(last), status: "due", due_date: null };
  }

  const next = nextMilestone(stages, latest.hours);
  if (!next || isIssued(next)) return null;
  const estimate = estimateDue(input.readings, next.milestone, todayIso);
  if (!estimate) return null;
  const horizon = addDaysIso(
    todayIso,
    input.horizonDays ?? REMINDER_HORIZON_DAYS,
  );
  if (estimate.dueDate > horizon) return null;
  return { ...base(next), status: "upcoming", due_date: estimate.dueDate };
}

/** 排序：已達門檻在前，其次預估日期由近到遠，再依客戶名稱 / 機台。 */
export function sortReminders(
  reminders: readonly StageReminder[],
): StageReminder[] {
  return [...reminders].sort((a, b) => {
    if (a.status !== b.status) return a.status === "due" ? -1 : 1;
    const ad = a.due_date ?? "";
    const bd = b.due_date ?? "";
    if (ad !== bd) return ad < bd ? -1 : 1;
    if (a.customer_name !== b.customer_name) {
      return a.customer_name < b.customer_name ? -1 : 1;
    }
    return a.machine_label < b.machine_label
      ? -1
      : a.machine_label > b.machine_label
        ? 1
        : 0;
  });
}
