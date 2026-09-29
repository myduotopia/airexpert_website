// 機台 → 保養方案比對（spec §5.3）— 純函式（client / server 皆可用）。
import type { PlanMatchSource, ServicePlan } from "./types";

/** 比對只需要這幾個欄位（ServicePlan / ServicePlanWithStages 皆可傳入）。 */
export type PlanMatchable = Pick<
  ServicePlan,
  "id" | "name" | "hp_tags" | "active"
>;

/** 比對只需要機台 id 與馬力。 */
export interface PlanMatchMachine {
  id: string;
  horsepower: string | null;
}

export interface PlanMatchResult<T extends PlanMatchable> {
  plan: T | null;
  source: PlanMatchSource;
  /** 依馬力／通用預設比到多個方案時的全部候選（依名稱排序）；≤1 筆時為空陣列。 */
  conflicts: T[];
}

/**
 * 馬力標籤正規化：全形轉半形、大寫、去空白與「馬力」、去 HP 字樣、去前導零。
 * 「20HP」「20 hp」「０２０HP」「20馬力」→ "20"；無法正規化回 ""。
 */
export function normalizeHpTag(tag: string | null | undefined): string {
  if (typeof tag !== "string") return "";
  return tag
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/馬力|匹/g, "")
    .replace(/HP/g, "")
    .replace(/^0+(?=\d)/, "")
    .trim();
}

/**
 * 是否為「通用預設方案」的馬力標籤：正規化後一個有效標籤都沒有。
 * 這種方案套用到所有沒有比到其他方案的空壓機（match 的最後一層 fallback）。
 */
export function isDefaultHpTags(
  tags: readonly string[] | null | undefined,
): boolean {
  return !(tags ?? []).some((tag) => normalizeHpTag(tag) !== "");
}

/** 方案名稱排序（穩定、與語系無關；spec §5.3「取 name 排序第一」）。 */
function byName(a: PlanMatchable, b: PlanMatchable): number {
  if (a.name === b.name) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.name < b.name ? -1 : 1;
}

/** 逐台指定的查表：Map 或 { [machineId]: planId } 皆可。 */
export type PlanOverrideLookup =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>
  | null
  | undefined;

function lookupOverride(
  lookup: PlanOverrideLookup,
  machineId: string,
): string | null {
  if (!lookup) return null;
  if (lookup instanceof Map) return lookup.get(machineId) ?? null;
  return (lookup as Record<string, string>)[machineId] ?? null;
}

/**
 * 比對機台的保養方案：
 * 1. 逐台指定（sr_machine_plans）→ 直接用，即使方案已停用（避免突然失效）；
 * 2. 否則依馬力正規化比對啟用中方案的 hp_tags，多筆相符取名稱排序第一並回 conflicts；
 * 3. 仍沒有 → 通用預設方案（啟用中且未填適用馬力），同樣多筆取名稱排序第一並回
 *    conflicts；機台沒填馬力（或無法正規化）時也走這一層；
 * 4. 都沒有 → plan: null。
 * 指定的方案不在 plans 內（已刪除 / 未載入）時退回馬力比對。
 */
export function matchPlan<T extends PlanMatchable>(
  machine: PlanMatchMachine,
  plans: readonly T[],
  overrideByMachineId?: PlanOverrideLookup,
): PlanMatchResult<T> {
  const overrideId = lookupOverride(overrideByMachineId, machine.id);
  if (overrideId) {
    const plan = plans.find((p) => p.id === overrideId);
    if (plan) return { plan, source: "override", conflicts: [] };
  }

  const hp = normalizeHpTag(machine.horsepower);
  if (hp !== "") {
    const matched = plans
      .filter(
        (p) =>
          p.active &&
          (p.hp_tags ?? []).some((tag) => normalizeHpTag(tag) === hp),
      )
      .sort(byName);
    if (matched.length > 0) {
      return {
        plan: matched[0],
        source: "hp",
        conflicts: matched.length > 1 ? matched : [],
      };
    }
  }

  // 通用預設：沒填適用馬力的啟用方案，接住所有沒有其他對應的空壓機
  //（含馬力空白或無法正規化的機台）。
  const defaults = plans
    .filter((p) => p.active && isDefaultHpTags(p.hp_tags))
    .sort(byName);
  if (defaults.length === 0) return { plan: null, source: null, conflicts: [] };
  return {
    plan: defaults[0],
    source: "default",
    conflicts: defaults.length > 1 ? defaults : [],
  };
}
