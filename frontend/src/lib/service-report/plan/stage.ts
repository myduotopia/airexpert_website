// 循環里程碑判定與料件套用（spec §5.4 / §6.2）— 純函式（client / server 皆可用）。
import type { ServiceReportPart } from "../types";
import { PART_ROW_COUNT } from "../validate";
import type { PlanPart, ServicePlanStage } from "./types";

export const STAGE_PARTS_OVERFLOW_MESSAGE = `料件超過 ${PART_ROW_COUNT} 列，請手動調整`;

/** 料件品名比對用正規化：全形轉半形、去空白、小寫。 */
export function normalizePartName(name: string | null | undefined): string {
  if (typeof name !== "string") return "";
  return name
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 階段依時數由小到大（時數相同時以 id 穩定排序）。 */
export function sortStages(
  stages: readonly ServicePlanStage[] | null | undefined,
): ServicePlanStage[] {
  return [...(stages ?? [])].sort((a, b) =>
    a.hours !== b.hours
      ? a.hours - b.hours
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  );
}

/**
 * 一個循環里程碑：實際門檻時數（22000）與它對應的方案階段（2000 基礎保養）。
 * 報告單的 plan_stage_hours 存的就是 milestone，plan_stage_label 存 stage.label 原文。
 */
export interface MilestoneTarget {
  /** 里程碑時數（如 22000）。 */
  milestone: number;
  /** 對應的方案階段（hours 為階段原時數，如 2000）。 */
  stage: ServicePlanStage;
}

/** 階段時數由小到大、去重（皆 > 0 且有限）。 */
function stageHours(stages: readonly ServicePlanStage[]): number[] {
  const out: number[] = [];
  for (const s of stages) {
    if (!Number.isFinite(s.hours) || s.hours <= 0) continue;
    if (!out.includes(s.hours)) out.push(s.hours);
  }
  return out.sort((a, b) => a - b);
}

/**
 * 一輪循環的長度＝方案中最大的階段時數（2000／4000／6000 → 6000）。
 * 沒有可用階段回 0。
 */
export function cycleLength(
  stages: readonly ServicePlanStage[] | null | undefined,
): number {
  const hours = stageHours(sortStages(stages));
  return hours.length === 0 ? 0 : hours[hours.length - 1];
}

/**
 * 里程碑 → 對應階段：`rem = milestone % cycle`；`rem === 0` 取時數＝cycle 的階段，
 * 否則取時數＝rem 的階段。不是合法里程碑（對不到階段）回 null。
 */
export function milestoneStage(
  stages: readonly ServicePlanStage[] | null | undefined,
  milestone: number,
): ServicePlanStage | null {
  const sorted = sortStages(stages);
  const cycle = cycleLength(sorted);
  if (cycle <= 0) return null;
  if (!Number.isFinite(milestone) || milestone <= 0) return null;
  const rem = milestone % cycle;
  const target = rem === 0 ? cycle : rem;
  return sorted.find((s) => s.hours === target) ?? null;
}

/** 里程碑 + 對應階段；對不到階段回 null。 */
function targetOf(
  stages: readonly ServicePlanStage[],
  milestone: number,
): MilestoneTarget | null {
  const stage = milestoneStage(stages, milestone);
  return stage ? { milestone, stage } : null;
}

/**
 * 依 `hours` 找里程碑：`pick` 為 "last" 取 ≤ hours 的最大者、"next" 取 > hours 的最小者。
 * 里程碑集合＝{ k × cycle + h }（k ≥ 0、h 為各階段時數；h = cycle 時即下一輪起點），
 * 只需檢查 hours 前後各一輪即可涵蓋。
 */
function pickMilestone(
  stages: readonly ServicePlanStage[] | null | undefined,
  hours: number | null | undefined,
  pick: "last" | "next",
): MilestoneTarget | null {
  const sorted = sortStages(stages);
  const cycle = cycleLength(sorted);
  if (cycle <= 0) return null;
  const list = stageHours(sorted);
  const current =
    typeof hours === "number" && Number.isFinite(hours) ? hours : null;
  // 沒有時數：談不上「已達」，下一個就是第一個里程碑。
  if (current === null) {
    return pick === "next" ? targetOf(sorted, list[0]) : null;
  }

  const round = Math.floor(current / cycle);
  let best: number | null = null;
  for (let k = round - 1; k <= round + 1; k += 1) {
    if (k < 0) continue;
    for (const h of list) {
      const m = k * cycle + h;
      if (m <= 0) continue;
      if (pick === "last") {
        if (m <= current && (best === null || m > best)) best = m;
      } else if (m > current && (best === null || m < best)) best = m;
    }
  }
  return best === null ? null : targetOf(sorted, best);
}

/** 已達的最後一個里程碑（≤ 目前時數的最大者）；還沒到第一個里程碑回 null。 */
export function lastMilestone(
  stages: readonly ServicePlanStage[] | null | undefined,
  hours: number | null | undefined,
): MilestoneTarget | null {
  return pickMilestone(stages, hours, "last");
}

/** 下一個里程碑（> 目前時數的最小者）；無時數時回第一個里程碑。 */
export function nextMilestone(
  stages: readonly ServicePlanStage[] | null | undefined,
  hours: number | null | undefined,
): MilestoneTarget | null {
  return pickMilestone(stages, hours, "next");
}

/**
 * 開單頁下拉的里程碑選項：以「下一個里程碑」為錨點往前補滿一輪（階段數）個選項，
 * 前面不夠（時數還很低）就往後補。保證同時涵蓋 lastMilestone 與 nextMilestone。
 */
export function milestoneOptions(
  stages: readonly ServicePlanStage[] | null | undefined,
  hours: number | null | undefined,
): MilestoneTarget[] {
  const sorted = sortStages(stages);
  const cycle = cycleLength(sorted);
  if (cycle <= 0) return [];
  const size = stageHours(sorted).length;
  const anchor = nextMilestone(sorted, hours);
  if (!anchor) return [];

  const out: MilestoneTarget[] = [anchor];
  // 已達的最後一個里程碑一定要在選項裡（階段只有一個時，往前補不會執行到）。
  const reached = lastMilestone(sorted, hours);
  if (reached) out.unshift(reached);
  let first = out[0];
  while (out.length < size) {
    const prev = lastMilestone(sorted, first.milestone - 1);
    if (!prev) break;
    out.unshift(prev);
    first = prev;
  }
  let last = out[out.length - 1];
  while (out.length < size) {
    const nxt = nextMilestone(sorted, last.milestone);
    if (!nxt) break;
    out.push(nxt);
    last = nxt;
  }
  return out;
}

/** 「已開過」比對用的鍵：報告單的 (plan_stage_id, plan_stage_hours)。 */
export function milestoneKey(stageId: string, milestone: number): string {
  return `${stageId}@${milestone}`;
}

/** 階段顯示文字：「4000 小時 基礎保養」（名稱空白時只有時數）。 */
export function stageLabel(
  stage: Pick<ServicePlanStage, "hours" | "label">,
): string {
  const name = (stage.label ?? "").trim();
  return name === "" ? `${stage.hours} 小時` : `${stage.hours} 小時 ${name}`;
}

/** 里程碑顯示文字：「22000 小時 基礎保養」（時數用里程碑、名稱用階段原文）。 */
export function milestoneLabel(
  milestone: number,
  stage: Pick<ServicePlanStage, "label">,
): string {
  return stageLabel({ hours: milestone, label: stage.label });
}

/** 目前時數是否已達某個門檻（里程碑或階段時數）。 */
export function isHoursReached(
  target: number,
  hours: number | null | undefined,
): boolean {
  return typeof hours === "number" && Number.isFinite(hours)
    ? hours >= target
    : false;
}

/** 帶入報告單的數量＝數量 + 單位（spec §4：qty = [qty, unit].join("")）。 */
export function stagePartQty(part: PlanPart): string {
  return [part.qty ?? "", part.unit ?? ""].join("").trim();
}

export interface ApplyStageOptions {
  /** true＝覆蓋已填數量；false（預設）＝只填空白。 */
  overwrite?: boolean;
}

export interface ApplyStageResult {
  parts: ServiceReportPart[];
  /** 10 列放不下而未填入的料件（呼叫端提示使用者手動調整）。 */
  overflow: PlanPart[];
}

/** 固定 10 列（多的捨去、缺的補空列），並複製以免動到來源陣列。 */
function toRows(
  parts: readonly ServiceReportPart[] | null | undefined,
): ServiceReportPart[] {
  const src = parts ?? [];
  return Array.from({ length: PART_ROW_COUNT }, (_, i) => {
    const p = src[i];
    return {
      no: i + 1,
      name: p?.name ?? "",
      qty: p?.qty ?? "",
    };
  });
}

/**
 * 套用階段料件到報告單的 10 列（spec §6.2）：
 * 1. 品名正規化後相同者填數量（不覆蓋時只填數量空白的列）；
 * 2. 其餘依序填入「品名與數量皆空」的列；
 * 3. 放不下的回在 overflow（不填、由呼叫端提示）。
 * 不改動未涉及的列，也不清空既有內容。
 */
export function applyStageToParts(
  parts: readonly ServiceReportPart[] | null | undefined,
  stage: Pick<ServicePlanStage, "parts">,
  options: ApplyStageOptions = {},
): ApplyStageResult {
  const overwrite = options.overwrite ?? false;
  const rows = toRows(parts);
  const used = new Set<number>();
  const overflow: PlanPart[] = [];

  for (const part of stage.parts ?? []) {
    const name = (part?.name ?? "").trim();
    if (name === "") continue;
    const key = normalizePartName(name);
    const qty = stagePartQty(part);

    const matched = rows.findIndex(
      (r, i) => !used.has(i) && normalizePartName(r.name) === key,
    );
    if (matched >= 0) {
      used.add(matched);
      if (overwrite || rows[matched].qty.trim() === "") {
        rows[matched] = { ...rows[matched], qty };
      }
      continue;
    }

    const blank = rows.findIndex(
      (r, i) => !used.has(i) && r.name.trim() === "" && r.qty.trim() === "",
    );
    if (blank >= 0) {
      used.add(blank);
      rows[blank] = { ...rows[blank], name, qty };
      continue;
    }
    overflow.push(part);
  }

  return { parts: rows, overflow };
}

/** 報告單目前的料件是否已有內容（＝套用前需先詢問是否覆蓋）。 */
export function hasFilledParts(
  parts: readonly ServiceReportPart[] | null | undefined,
): boolean {
  return (parts ?? []).some((p) => (p?.qty ?? "").trim() !== "");
}
