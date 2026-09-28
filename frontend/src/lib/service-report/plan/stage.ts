// 階段判定與料件套用（spec §5.4 / §6.2）— 純函式（client / server 皆可用）。
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

function toIdSet(
  ids: ReadonlySet<string> | readonly string[] | null | undefined,
): ReadonlySet<string> {
  if (!ids) return new Set<string>();
  return ids instanceof Set ? ids : new Set(ids as readonly string[]);
}

/**
 * 下一個階段：時數由小到大，排除已開過（存在未作廢報告單）的階段，取第一個。
 * 全部開過回 null（每個階段只觸發一次）。
 */
export function nextStage(
  stages: readonly ServicePlanStage[] | null | undefined,
  issuedStageIds?: ReadonlySet<string> | readonly string[] | null,
): ServicePlanStage | null {
  const issued = toIdSet(issuedStageIds);
  return sortStages(stages).find((s) => !issued.has(s.id)) ?? null;
}

/** 階段顯示文字：「4000 小時 基礎保養」（名稱空白時只有時數）。 */
export function stageLabel(
  stage: Pick<ServicePlanStage, "hours" | "label">,
): string {
  const name = (stage.label ?? "").trim();
  return name === "" ? `${stage.hours} 小時` : `${stage.hours} 小時 ${name}`;
}

/** 目前時數是否已達該階段門檻。 */
export function isStageReached(
  stage: Pick<ServicePlanStage, "hours">,
  hours: number | null | undefined,
): boolean {
  return typeof hours === "number" && Number.isFinite(hours)
    ? hours >= stage.hours
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
